import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { recalcPalletStatus } from "@/lib/pallets";
import { parseMoney } from "@/lib/api";

/**
 * Endpoint for eBay Platform Notifications / a polling cron to report sales.
 * Accepts JSON: { listingId: string, soldPrice?: number, orderId?: string }
 * and marks the matching item SOLD.
 *
 * Fails closed: WEBHOOK_SECRET must be set and sent as X-Webhook-Secret.
 * (eBay item IDs are public, so an unauthenticated endpoint would let anyone
 * rewrite sales data.)
 */
export async function POST(req: NextRequest) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook disabled: set WEBHOOK_SECRET and send it as the X-Webhook-Secret header" },
      { status: 503 }
    );
  }
  const provided = req.headers.get("x-webhook-secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Invalid webhook secret" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const listingId = typeof body?.listingId === "string" ? body.listingId : "";
  if (!listingId) return NextResponse.json({ error: "listingId required" }, { status: 400 });

  const item = await prisma.item.findFirst({ where: { listingIdEbay: listingId } });
  if (!item) return NextResponse.json({ error: "Unknown listing" }, { status: 404 });
  if (item.status === "SOLD") return NextResponse.json({ ok: true, already: true });

  await prisma.item.update({
    where: { id: item.id },
    data: {
      status: "SOLD",
      soldPrice: parseMoney(body.soldPrice) ?? item.sellPrice,
      dateSold: new Date(),
      orderId: typeof body.orderId === "string" ? body.orderId : null,
      platform: "EBAY",
    },
  });
  await recalcPalletStatus(item.palletId);
  return NextResponse.json({ ok: true });
}
