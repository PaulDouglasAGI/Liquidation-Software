import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { formatCode, itemSkuPrefix, maxSuffix, palletCodePrefix, sequence, suffixOf } from "./skuFormat";

/** Either the base client or a transaction handle. */
type Db = Prisma.TransactionClient | typeof prisma;

export const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** Next pallet code for the current year, e.g. PAL-2026-001. */
export async function nextPalletCode(db: Db = prisma): Promise<string> {
  const prefix = palletCodePrefix(new Date().getFullYear());
  const existing = await db.pallet.findMany({
    where: { palletCode: { startsWith: prefix } },
    select: { palletCode: true },
  });
  return formatCode(prefix, maxSuffix(existing.map((p) => p.palletCode), prefix) + 1);
}

/** Prefix + next free number for items on a pallet, e.g. ITM-PAL001- / 4. */
export async function nextItemSkuParts(palletId: string, db: Db = prisma) {
  const pallet = await db.pallet.findUniqueOrThrow({
    where: { id: palletId },
    select: { palletCode: true },
  });
  const prefix = itemSkuPrefix(pallet.palletCode);
  const existing = await db.item.findMany({
    where: { sku: { startsWith: prefix } },
    select: { sku: true },
  });
  return { prefix, next: maxSuffix(existing.map((i) => i.sku), prefix) + 1 };
}

/** Next item SKU within a pallet, e.g. ITM-PAL001-001. */
export async function nextItemSku(palletId: string, db: Db = prisma): Promise<string> {
  const { prefix, next } = await nextItemSkuParts(palletId, db);
  return formatCode(prefix, next);
}

/**
 * Creates an item with a freshly generated SKU, retrying on the unique-SKU
 * race when two people scan into the same pallet at the same moment.
 */
export async function createItemWithSku(
  palletId: string,
  data: Omit<Prisma.ItemUncheckedCreateInput, "sku" | "palletId">
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.item.create({
        data: { ...data, palletId, sku: await nextItemSku(palletId) },
      });
    } catch (e) {
      if (isUniqueViolation(e) && attempt < 3) continue;
      throw e;
    }
  }
}

/**
 * Creates N identical items (distinct sequential SKUs) atomically — createMany
 * is a single statement, so a failure can never leave a partial batch behind
 * (a partial batch + retry would silently duplicate units). Retries the whole
 * batch on a SKU-uniqueness race. Serial numbers are unit-specific, so only
 * the first row keeps one.
 */
export async function createItemsWithSkus(
  palletId: string,
  data: Omit<Prisma.ItemUncheckedCreateInput, "sku" | "palletId">,
  qty: number
) {
  for (let attempt = 0; ; attempt++) {
    try {
      const firstSku = await nextItemSku(palletId);
      const prefix = firstSku.slice(0, firstSku.lastIndexOf("-") + 1);
      const skus = sequence(prefix, suffixOf(firstSku, prefix), qty);
      await prisma.item.createMany({
        data: skus.map((sku, n) => ({
          ...data,
          serialNumber: n === 0 ? data.serialNumber : null,
          palletId,
          sku,
        })),
      });
      return await prisma.item.findUniqueOrThrow({ where: { sku: firstSku } });
    } catch (e) {
      if (isUniqueViolation(e) && attempt < 3) continue;
      throw e;
    }
  }
}

/** One manifest row expanded into `qty` identical units. */
export interface ItemBatch {
  data: Omit<Prisma.ItemUncheckedCreateInput, "sku" | "palletId">;
  qty: number;
}

/**
 * Creates every unit from a manifest import in a single createMany, numbering
 * SKUs sequentially across all rows. One statement instead of thousands of
 * round-trips, and atomic: an import either lands whole or not at all.
 */
export async function createItemBatches(
  palletId: string,
  batches: ItemBatch[],
  db: Db = prisma
): Promise<number> {
  const { prefix, next } = await nextItemSkuParts(palletId, db);
  const rows: Prisma.ItemCreateManyInput[] = [];
  let n = next;
  for (const batch of batches) {
    for (let i = 0; i < batch.qty; i++) {
      rows.push({
        ...batch.data,
        // Serial numbers identify a single unit, so only the first copy keeps one.
        serialNumber: i === 0 ? batch.data.serialNumber : null,
        palletId,
        sku: formatCode(prefix, n++),
      });
    }
  }
  if (rows.length === 0) return 0;
  await db.item.createMany({ data: rows });
  return rows.length;
}

/** Creates a pallet with a generated code, retrying on the same kind of race. */
export async function createPalletWithCode(
  data: Omit<Prisma.PalletUncheckedCreateInput, "palletCode">
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.pallet.create({
        data: { ...data, palletCode: await nextPalletCode() },
      });
    } catch (e) {
      if (isUniqueViolation(e) && attempt < 3) continue;
      throw e;
    }
  }
}
