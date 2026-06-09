import "server-only";
import { prisma } from "./db";

/** Next pallet code for the current year, e.g. PAL-2026-001. */
export async function nextPalletCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PAL-${year}-`;
  const last = await prisma.pallet.findFirst({
    where: { palletCode: { startsWith: prefix } },
    orderBy: { palletCode: "desc" },
    select: { palletCode: true },
  });
  const n = last ? parseInt(last.palletCode.slice(prefix.length), 10) + 1 : 1;
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
  const last = await prisma.item.findFirst({
    where: { sku: { startsWith: prefix } },
    orderBy: { sku: "desc" },
    select: { sku: true },
  });
  const n = last ? parseInt(last.sku.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(n).padStart(3, "0")}`;
}
