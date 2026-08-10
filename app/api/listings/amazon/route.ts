import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, unauthorized } from "@/lib/api";
import { amazonFlatFile } from "@/lib/amazon";
import { csvResponse } from "@/lib/csv";
import { num } from "@/lib/serialize";
import { recordListing } from "@/lib/listings";

/** GET /api/listings/amazon?ids=a,b,c — Amazon inventory loader flat file (TSV). */
export async function GET(req: NextRequest) {
  if (!(await apiUser())) return unauthorized();
  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean);
  if (ids.length === 0) return badRequest("Provide ids");
  const items = await prisma.item.findMany({ where: { id: { in: ids } } });
  if (items.length === 0) return badRequest("Items not found");
  const tsv = amazonFlatFile(
    items.map((i) => ({
      sku: i.sku,
      upc: i.upc,
      sellPrice: num(i.sellPrice),
      condition: i.condition,
      conditionNotes: i.conditionNotes,
    }))
  );
  // Downloading the flat file is the moment these go up on Amazon. Recording
  // it here is what lets the takedown queue know to pull them if they sell
  // somewhere else first — Amazon cannot be ended from code, so a person has
  // to be told, and they can only be told if we wrote it down.
  for (const i of items) {
    await recordListing(prisma, i.id, "AMAZON", { externalId: i.sku, price: num(i.sellPrice) });
  }
  const res = csvResponse(`amazon-flatfile-${new Date().toISOString().slice(0, 10)}.txt`, tsv);
  res.headers.set("Content-Type", "text/tab-separated-values; charset=utf-8");
  return res;
}
