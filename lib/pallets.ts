import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { decidePalletStatus } from "./palletStatus";
import { splitEvenly } from "./fulfillmentMath";

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

/**
 * Spreads a pallet's purchase cost evenly across its units, to the cent.
 *
 * A flat `Math.round(total / n)` per unit does not add back up: $2450 over 16
 * units rounds to $153.13 each, which is $2450.08 of COGS against $2450 spent.
 * Every pallet carried a little phantom cost forever, and the one figure an
 * operator would check — do my unit costs add up to what I paid — never did.
 *
 * SOLD units keep the cost they were booked at; rewriting it would restate the
 * margin on a sale that has already happened. They still take a share, so
 * removing them from the split cannot inflate what the rest carry.
 */
export async function spreadPalletCost(palletId: string, db: Db = prisma) {
  const pallet = await db.pallet.findUnique({
    where: { id: palletId },
    select: { totalCost: true },
  });
  if (!pallet) return;
  // Deterministic order, so re-running lands the spare cents in the same place
  // instead of shuffling costs around on every import.
  const items = await db.item.findMany({
    where: { palletId },
    select: { id: true, status: true },
    orderBy: { sku: "asc" },
  });
  if (items.length === 0) return;

  const shares = splitEvenly(pallet.totalCost.toNumber(), items.length);
  for (const [idx, item] of items.entries()) {
    if (item.status === "SOLD") continue;
    await db.item.update({ where: { id: item.id }, data: { ourCost: shares[idx] } });
  }
}
