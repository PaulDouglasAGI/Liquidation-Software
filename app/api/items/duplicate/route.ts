import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, serverError, unauthorized } from "@/lib/api";

/**
 * GET /api/items/duplicate?upc=... — have we taken this in before?
 *
 * Scanning a UPC we already hold usually means a multi-pack from the same
 * pallet: the answer is "Save xN on the existing draft", not re-keying the
 * whole item. Also surfaces what it sold for last time, which is the best
 * price signal available.
 */
export async function GET(req: NextRequest) {
  if (!(await apiUser())) return unauthorized();
  try {
    const upc = req.nextUrl.searchParams.get("upc")?.replace(/\D/g, "") ?? "";
    if (!upc || upc.length < 8) return badRequest("Provide a UPC of at least 8 digits");

    const items = await prisma.item.findMany({
      where: { upc },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true, sku: true, name: true, brand: true, category: true, condition: true,
        msrp: true, sellPrice: true, soldPrice: true, status: true, storageLocation: true,
        palletId: true, dateSold: true,
        pallet: { select: { palletCode: true } },
      },
    });
    if (items.length === 0) return NextResponse.json({ found: false, count: 0 });

    // Order by when it SOLD, not when the row was created — intake order has
    // nothing to do with which sale was most recent.
    const sold = items
      .filter((i) => i.status === "SOLD" && i.soldPrice)
      .sort((a, b) => (b.dateSold?.getTime() ?? 0) - (a.dateSold?.getTime() ?? 0));
    const soldPrices = sold.map((i) => i.soldPrice!.toNumber());
    const inStock = items.filter((i) => i.status === "IN_STOCK" || i.status === "LISTED");

    // The most recent take-in is the best template for the next one.
    const template = items[0];

    return NextResponse.json({
      found: true,
      count: items.length,
      inStockCount: inStock.length,
      soldCount: sold.length,
      /** What it actually fetched before — better than a guess at MSRP. */
      avgSoldPrice: soldPrices.length
        ? Math.round((soldPrices.reduce((a, b) => a + b, 0) / soldPrices.length) * 100) / 100
        : null,
      lastSoldPrice: sold[0]?.soldPrice?.toNumber() ?? null,
      lastSoldAt: sold[0]?.dateSold ?? null,
      template: {
        name: template.name,
        brand: template.brand,
        category: template.category,
        condition: template.condition,
        msrp: template.msrp?.toNumber() ?? null,
        sellPrice: template.sellPrice?.toNumber() ?? null,
        storageLocation: template.storageLocation,
        palletId: template.palletId,
      },
      recent: items.slice(0, 5).map((i) => ({
        id: i.id, sku: i.sku, status: i.status,
        palletCode: i.pallet.palletCode,
        storageLocation: i.storageLocation,
        soldPrice: i.soldPrice?.toNumber() ?? null,
      })),
    });
  } catch (e) {
    return serverError(e);
  }
}
