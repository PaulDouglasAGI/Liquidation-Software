import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { apiUser, serverError } from "@/lib/api";
import { EbayConfigError, getRecentOrders } from "@/lib/ebay";
import { estimateFees } from "@/lib/fees";
import { getFeeRates, getSetting, setSetting } from "@/lib/settings";
import { recalcPalletStatus } from "@/lib/pallets";
import { logActivity } from "@/lib/activity";

const DEFAULT_LOOKBACK_DAYS = 30;
const OVERLAP_MS = 86_400_000; // re-scan the last day so nothing slips a boundary

function secretMatches(req: NextRequest): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return false;
  const provided = Buffer.from(req.headers.get("x-webhook-secret") ?? "");
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

/**
 * Pulls recent eBay orders and marks the matching items SOLD with the real
 * price and order ID. Auth: a logged-in session, or X-Webhook-Secret (so an
 * external cron can drive it):
 *   curl -X POST https://your-app/api/ebay/sync-orders -H "X-Webhook-Secret: $SECRET"
 */
export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user && !secretMatches(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const actor = user?.name ?? "eBay sync (cron)";
  try {
    const lastSync = await getSetting("ebay.lastOrderSync");
    const since = new Date(
      (lastSync ? new Date(lastSync).getTime() : Date.now() - DEFAULT_LOOKBACK_DAYS * 86_400_000) - OVERLAP_MS
    );
    const startedAt = new Date();

    const lines = await getRecentOrders(since.toISOString());
    const rates = await getFeeRates();

    let matched = 0;
    let updated = 0;
    for (const line of lines) {
      const item = await prisma.item.findFirst({
        where: {
          OR: [
            ...(line.legacyItemId ? [{ listingIdEbay: line.legacyItemId }] : []),
            ...(line.sku ? [{ sku: line.sku }] : []),
          ],
        },
      });
      if (!item) continue;
      matched++;
      if (item.status === "SOLD") continue; // idempotent across overlapping windows

      const soldPrice = line.lineTotal ?? item.sellPrice?.toNumber() ?? null;
      // Prefer eBay's actual fee when the order has a single line (ours do:
      // every listing is quantity 1); otherwise estimate from settings.
      const fees =
        line.orderMarketplaceFee !== null && line.orderLineCount === 1
          ? line.orderMarketplaceFee
          : estimateFees(soldPrice, "EBAY", rates);

      await prisma.item.update({
        where: { id: item.id },
        data: {
          status: "SOLD",
          soldPrice,
          feesAmount: item.feesAmount ?? fees,
          dateSold: new Date(line.creationDate),
          orderId: line.orderId,
          platform: "EBAY",
        },
      });
      await recalcPalletStatus(item.palletId);
      logActivity(actor, "item.sold", `${item.sku} sold on eBay (order ${line.orderId}) via sync`);
      updated++;
    }

    await setSetting("ebay.lastOrderSync", startedAt.toISOString());
    return NextResponse.json({ ok: true, checked: lines.length, matched, updated });
  } catch (e) {
    if (e instanceof EbayConfigError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    return serverError(e);
  }
}
