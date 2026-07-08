import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";

/** Highest numeric suffix among codes sharing a prefix (robust past 999). */
function maxSuffix(codes: string[], prefix: string): number {
  let max = 0;
  for (const code of codes) {
    const n = parseInt(code.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** Next pallet code for the current year, e.g. PAL-2026-001. */
export async function nextPalletCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PAL-${year}-`;
  const existing = await prisma.pallet.findMany({
    where: { palletCode: { startsWith: prefix } },
    select: { palletCode: true },
  });
  const n = maxSuffix(existing.map((p) => p.palletCode), prefix) + 1;
  return `${prefix}${String(n).padStart(3, "0")}`;
}

/** Next item SKU within a pallet, e.g. ITM-PAL001-001 (PAL-2026-001 -> PAL001). */
export async function nextItemSku(palletId: string): Promise<string> {
  const pallet = await prisma.pallet.findUniqueOrThrow({
    where: { id: palletId },
    select: { palletCode: true },
  });
  const seq = pallet.palletCode.split("-").pop() ?? "000";
  const prefix = `ITM-PAL${seq}-`;
  const existing = await prisma.item.findMany({
    where: { sku: { startsWith: prefix } },
    select: { sku: true },
  });
  const n = maxSuffix(existing.map((i) => i.sku), prefix) + 1;
  return `${prefix}${String(n).padStart(3, "0")}`;
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
      const start = parseInt(firstSku.slice(prefix.length), 10);
      const rows = Array.from({ length: qty }, (_, n) => ({
        ...data,
        serialNumber: n === 0 ? data.serialNumber : null,
        palletId,
        sku: `${prefix}${String(start + n).padStart(3, "0")}`,
      }));
      await prisma.item.createMany({ data: rows });
      return await prisma.item.findUniqueOrThrow({ where: { sku: firstSku } });
    } catch (e) {
      if (isUniqueViolation(e) && attempt < 3) continue;
      throw e;
    }
  }
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
