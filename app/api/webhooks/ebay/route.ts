import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { recalcPalletStatus } from "@/lib/pallets";
import { parseMoney } from "@/lib/api";

/**
 * Endpoint for eBay Platform Notifications / a polling cron to report sales.
 * Accepts JSON: { listingId: string, soldPrice?: number, orderId?: string }
 * and marks the matching item SOLD. Unauthenticated by design (eBay calls it),
 * but only acts on known listing IDs.
 */
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const listingId = typeof b?.listingId === "string" ? b.listingId : "";
  if (!listingId) return NextResponse.json({ error: "listingId required" }, { status: 400 });

  const item = await prisma.item.findFirst({ where: { listingIdEbay: listingId } });
  if (!item) return NextResponse.json({ error: "Unknown listing" }, { status: 404 });
  if (item.status === "SOLD") return NextResponse.json({ ok: true, already: true });

  await prisma.item.update({
    where: { id: item.id },
    data: {
      status: "SOLD",
      soldPrice: parseMoney(b.soldPrice) ?? item.sellPrice,
      dateSold: new Date(),
      orderId: typeof b.orderId === "string" ? b.orderId : null,
      platform: "EBAY",
    },
  });
  await recalcPalletStatus(item.palletId);
  return NextResponse.json({ ok: true });
}
