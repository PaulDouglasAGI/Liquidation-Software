// Pure pallet lifecycle rules (no DB), so the state machine is unit-testable.

export type PalletComputedStatus =
  | "RECEIVED"
  | "IN_PROCESSING"
  | "PARTIALLY_LISTED"
  | "FULLY_LISTED";

export interface PalletItemCounts {
  /** every item on the pallet, whatever its status */
  anyItems: number;
  /** items excluding SCRAPPED — the ones that still represent work */
  total: number;
  /** items that reached LISTED, RESERVED (in a lot), or SOLD */
  listedOrBeyond: number;
}

/**
 * Decides a pallet's status from its item counts.
 *
 * Scrapped items are written off — they shouldn't hold a pallet at
 * "Partially Listed" forever. Returned items DO count as needing action.
 */
export function decidePalletStatus(c: PalletItemCounts): PalletComputedStatus {
  if (c.anyItems === 0) return "RECEIVED";
  if (c.total === 0) return "FULLY_LISTED"; // everything scrapped — nothing left to do
  if (c.listedOrBeyond === 0) return "IN_PROCESSING";
  if (c.listedOrBeyond < c.total) return "PARTIALLY_LISTED";
  return "FULLY_LISTED";
}

/** What is currently attached to a pallet, for deciding if it can be emptied. */
export interface PalletDeletionCounts {
  total: number;
  /** Items already sold — their revenue is in P&L. */
  sold: number;
  /** Items attached to an order that has not shipped or been cancelled. */
  onOrder: number;
  /** Items reserved inside a lot listing. */
  inLot: number;
  /** Items returned by a customer — part of the sale history. */
  returned: number;
}

export interface DeletionCheck {
  allowed: boolean;
  /** Human-readable reasons, each naming the fix. */
  blockers: string[];
}

/**
 * Whether a pallet's items can be deleted outright.
 *
 * Importing the wrong manifest is a normal mistake and must be undoable. Losing
 * a recorded sale is not: deleting a SOLD item would silently remove its
 * revenue, fees, and COGS from a P&L that may already have been reported. So
 * anything with real history blocks, and the message says how to clear it.
 */
export function checkPalletDeletion(c: PalletDeletionCounts): DeletionCheck {
  const blockers: string[] = [];
  const s = (n: number) => (n === 1 ? "" : "s");

  if (c.sold > 0) {
    blockers.push(
      `${c.sold} item${s(c.sold)} already sold — deleting would erase that revenue from P&L. ` +
        `Scrap them instead if they were a mistake.`
    );
  }
  if (c.returned > 0) {
    blockers.push(`${c.returned} item${s(c.returned)} returned by a customer — that history cannot be deleted.`);
  }
  if (c.onOrder > 0) {
    blockers.push(`${c.onOrder} item${s(c.onOrder)} on an open order — ship or cancel it in Ship Today first.`);
  }
  if (c.inLot > 0) {
    blockers.push(`${c.inLot} item${s(c.inLot)} in a lot — break the lot up first.`);
  }
  return { allowed: blockers.length === 0, blockers };
}
