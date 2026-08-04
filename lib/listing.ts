import "server-only";
import type { Item } from "@prisma/client";
import { prisma } from "./db";
import { addFixedPriceItem } from "./ebay";
import { DEFAULT_DESCRIPTION_TEMPLATE, DEFAULT_TITLE_TEMPLATE, renderTemplate } from "./templates";
import { recalcPalletStatus } from "./pallets";
import { num } from "./serialize";

/**
 * Pushes one item to eBay as a live fixed-price listing and records the
 * result on the item. Shared by the single-item route and bulk push.
 * Throws (EbayConfigError or Error) on failure — callers decide how to report.
 */
export async function pushItemToEbay(item: Item, origin: string): Promise<{ itemId: string; url: string }> {
  if (item.status === "SOLD") throw new Error("Item is already sold");
  if (item.status === "RESERVED") {
    // Reserved means committed to a lot or held for a buyer; listing it
    // individually is exactly the double-sale the reservation prevents.
    throw new Error("Item is reserved (in a lot or on hold) — release it before listing");
  }
  if (item.status === "SCRAPPED") throw new Error("Item is scrapped and cannot be listed");
  if (item.status === "RETURNED") throw new Error("Item was returned — relist it first to confirm its condition");
  const price = num(item.sellPrice);
  if (!price || price <= 0) throw new Error("Set a sell price before listing");

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
  const photoUrls = item.photos.map((p) => `${origin}/api/uploads/${p}`);

  const { itemId, url } = await addFixedPriceItem({
    title,
    description: description.replace(/\n/g, "<br>"),
    condition: item.condition,
    category: item.category,
    price,
    upc: item.upc,
    sku: item.sku,
    photoUrls,
    weightLbs: num(item.weightLbs),
  });

  await prisma.item.update({
    where: { id: item.id },
    data: {
      status: "LISTED",
      platform: "EBAY",
      listingIdEbay: itemId,
      listingUrl: url,
      dateListed: item.dateListed ?? new Date(),
    },
  });
  await recalcPalletStatus(item.palletId);
  return { itemId, url };
}
