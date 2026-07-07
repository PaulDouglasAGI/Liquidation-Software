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

  // Scrapped items are written off — they shouldn't hold a pallet at
  // "Partially Listed" forever. Returned items DO count as needing action.
  const [total, listedOrBeyond, anyItems] = await Promise.all([
    prisma.item.count({ where: { palletId, status: { not: "SCRAPPED" } } }),
    prisma.item.count({ where: { palletId, status: { in: ["LISTED", "SOLD"] } } }),
    prisma.item.count({ where: { palletId } }),
  ]);

  let status: "RECEIVED" | "IN_PROCESSING" | "PARTIALLY_LISTED" | "FULLY_LISTED";
  if (anyItems === 0) status = "RECEIVED";
  else if (total === 0) status = "FULLY_LISTED"; // everything scrapped — nothing left to do
  else if (listedOrBeyond === 0) status = "IN_PROCESSING";
  else if (listedOrBeyond < total) status = "PARTIALLY_LISTED";
  else status = "FULLY_LISTED";

  if (status !== pallet.status) {
    await prisma.pallet.update({ where: { id: palletId }, data: { status } });
  }
}
