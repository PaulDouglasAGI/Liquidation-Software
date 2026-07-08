import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, serverError, unauthorized } from "@/lib/api";
import { EbayConfigError } from "@/lib/ebay";
import { pushItemToEbay } from "@/lib/listing";
import { logActivity } from "@/lib/activity";

const MAX_PER_CALL = 25;

/**
 * Bulk "push selected to eBay": lists items sequentially (eBay rate limits),
 * skipping ones that are already listed/sold or have no price, and reports a
 * per-item outcome so one bad item never blocks the rest.
 */
export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  try {
    const b = await req.json().catch(() => null);
    const ids: string[] = Array.isArray(b?.ids) ? b.ids.filter((x: unknown) => typeof x === "string") : [];
    if (ids.length === 0) return badRequest("No items selected");
    if (ids.length > MAX_PER_CALL) return badRequest(`Max ${MAX_PER_CALL} items per push — select fewer and repeat`);

    const items = await prisma.item.findMany({ where: { id: { in: ids } } });
    const results: { sku: string; ok: boolean; itemId?: string; error?: string }[] = [];
    let listed = 0;

    for (const item of items) {
      if (item.status === "LISTED" && item.listingIdEbay) {
        results.push({ sku: item.sku, ok: false, error: "already listed on eBay" });
        continue;
      }
      try {
        const { itemId } = await pushItemToEbay(item, req.nextUrl.origin);
        results.push({ sku: item.sku, ok: true, itemId });
        listed++;
      } catch (e) {
        if (e instanceof EbayConfigError) {
          // Config problems affect every item — stop early with one clear message.
          return NextResponse.json({ error: e.message }, { status: 503 });
        }
        results.push({ sku: item.sku, ok: false, error: e instanceof Error ? e.message : "failed" });
      }
    }

    if (listed > 0) logActivity(user.name, "listing.ebay.bulk", `${listed} item(s) pushed to eBay`);
    return NextResponse.json({ ok: true, listed, results });
  } catch (e) {
    return serverError(e);
  }
}
