import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, notFound, serverError, unauthorized } from "@/lib/api";
import { addFixedPriceItem, EbayConfigError } from "@/lib/ebay";
import { DEFAULT_DESCRIPTION_TEMPLATE, DEFAULT_TITLE_TEMPLATE, renderTemplate } from "@/lib/templates";
import { recalcPalletStatus } from "@/lib/pallets";
import { num } from "@/lib/serialize";
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
    if (item.status === "SOLD") return badRequest("Item is already sold");
    const price = num(item.sellPrice);
    if (!price || price <= 0) return badRequest("Set a sell price before listing");

    const template = await prisma.listingTemplate.findUnique({ where: { category: item.category } });
    const tplItem = {
      sku: item.sku,
      name: item.name,
      brand: item.brand,
      category: item.category,
      condition: item.condition,
      conditionNotes: item.conditionNotes,
      msrp: num(item.msrp),
      sellPrice: price,
      weightLbs: num(item.weightLbs),
      lengthIn: num(item.lengthIn),
      widthIn: num(item.widthIn),
      heightIn: num(item.heightIn),
      serialNumber: item.serialNumber,
    };
    const title = renderTemplate(template?.titleTemplate ?? DEFAULT_TITLE_TEMPLATE, tplItem);
    const description = renderTemplate(template?.descriptionTemplate ?? DEFAULT_DESCRIPTION_TEMPLATE, tplItem);

    // eBay needs publicly reachable photo URLs; local uploads only work if the
    // app itself is hosted on a public URL.
    const origin = req.nextUrl.origin;
    const photoUrls = item.photos.map((p) => `${origin}/api/uploads/${p}`);

    const { itemId, url } = await addFixedPriceItem({
      title,
      description: description.replace(/\n/g, "<br>"),
      condition: item.condition,
      category: item.category,
      price,
      upc: item.upc,
      photoUrls,
      weightLbs: num(item.weightLbs),
    });

    await prisma.item.update({
      where: { id },
      data: {
        status: "LISTED",
        platform: "EBAY",
        listingIdEbay: itemId,
        listingUrl: url,
        dateListed: item.dateListed ?? new Date(),
      },
    });
    await recalcPalletStatus(item.palletId);
    logActivity(user.name, "listing.ebay", `${item.sku} → eBay item ${itemId}`);
    return NextResponse.json({ ok: true, itemId, url });
  } catch (e) {
    if (e instanceof EbayConfigError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    return serverError(e);
  }
}
