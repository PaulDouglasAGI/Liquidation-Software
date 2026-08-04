import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { decidePalletStatus } from "./palletStatus";

export type { PalletComputedStatus, PalletItemCounts } from "./palletStatus";

/** Either the base client or a transaction handle, so callers can stay atomic. */
type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Recomputes a pallet's lifecycle status from its items. CLOSED is manual and
 * never overridden. The decision rules live in ./palletStatus (pure + tested).
 *
 * Pass the transaction client when calling from inside `$transaction` so the
 * status can't be derived from a half-applied batch.
 */
export async function recalcPalletStatus(palletId: string, db: Db = prisma) {
  const pallet = await db.pallet.findUnique({
    where: { id: palletId },
    select: { status: true },
  });
  if (!pallet || pallet.status === "CLOSED") return;

  const [total, listedOrBeyond, anyItems] = await Promise.all([
    db.item.count({ where: { palletId, status: { not: "SCRAPPED" } } }),
    db.item.count({ where: { palletId, status: { in: ["LISTED", "RESERVED", "SOLD"] } } }),
    db.item.count({ where: { palletId } }),
  ]);

  const status = decidePalletStatus({ anyItems, total, listedOrBeyond });
  if (status !== pallet.status) {
    await db.pallet.update({ where: { id: palletId }, data: { status } });
  }
}
