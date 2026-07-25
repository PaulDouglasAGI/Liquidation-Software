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
  /** items that reached LISTED or SOLD */
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
