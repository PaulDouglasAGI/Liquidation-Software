import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, notFound, unauthorized } from "@/lib/api";
import { facebookBlock } from "@/lib/templates";
import { num } from "@/lib/serialize";
import { recordListing } from "@/lib/listings";

type Params = { params: Promise<{ id: string }> };

/** Formatted text block + photo URLs for manual Facebook Marketplace posting. */
export async function GET(req: NextRequest, { params }: Params) {
  if (!(await apiUser())) return unauthorized();
  const { id } = await params;
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) return notFound("Item not found");
  const text = facebookBlock({
    sku: item.sku,
    name: item.name,
    brand: item.brand,
    condition: item.condition,
    conditionNotes: item.conditionNotes,
    msrp: num(item.msrp),
    sellPrice: num(item.sellPrice),
  });
  // Same reasoning as Amazon: pulling the block is when it goes up, and
  // Facebook Marketplace gives us no id and no API, so the only way it ever
  // comes down is a person being told to go and do it.
  await recordListing(prisma, item.id, "FACEBOOK", { price: num(item.sellPrice) });
  const origin = req.nextUrl.origin;
  return NextResponse.json({
    text,
    photos: item.photos.map((p) => `${origin}/api/uploads/${p}`),
  });
}
