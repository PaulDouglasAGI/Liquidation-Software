import "server-only";
import { prisma } from "./db";

/**
 * Recomputes a pallet's lifecycle status from its items. CLOSED is manual and
 * never overridden.
 */
export async function recalcPalletStatus(palletId: string) {
  const pallet = await prisma.pallet.findUnique({
    where: { id: palletId },
    select: { status: true },
  });
  if (!pallet || pallet.status === "CLOSED") return;

  const [total, listedOrBeyond] = await Promise.all([
    prisma.item.count({ where: { palletId } }),
    prisma.item.count({ where: { palletId, status: { in: ["LISTED", "SOLD"] } } }),
  ]);

  let status: "RECEIVED" | "IN_PROCESSING" | "PARTIALLY_LISTED" | "FULLY_LISTED";
  if (total === 0) status = "RECEIVED";
  else if (listedOrBeyond === 0) status = "IN_PROCESSING";
  else if (listedOrBeyond < total) status = "PARTIALLY_LISTED";
  else status = "FULLY_LISTED";

  if (status !== pallet.status) {
    await prisma.pallet.update({ where: { id: palletId }, data: { status } });
  }
}
