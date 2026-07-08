import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, notFound, serverError, unauthorized } from "@/lib/api";
import { EbayConfigError } from "@/lib/ebay";
import { pushItemToEbay } from "@/lib/listing";
import { logActivity } from "@/lib/activity";

type Params = { params: Promise<{ id: string }> };

/** One-click push of an item to eBay as a live fixed-price listing. */
export async function POST(req: NextRequest, { params }: Params) {
  const user = await apiUser();
  if (!user) return unauthorized();
  try {
    const { id } = await params;
    const item = await prisma.item.findUnique({ where: { id } });
    if (!item) return notFound("Item not found");

    const { itemId, url } = await pushItemToEbay(item, req.nextUrl.origin);
    logActivity(user.name, "listing.ebay", `${item.sku} → eBay item ${itemId}`);
    return NextResponse.json({ ok: true, itemId, url });
  } catch (e) {
    if (e instanceof EbayConfigError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    return serverError(e);
  }
}
