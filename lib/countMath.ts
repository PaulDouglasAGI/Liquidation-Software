// Pure cycle-count reconciliation (no DB), so the audit maths is testable.

export interface ExpectedItem {
  id: string;
  sku: string;
  name: string;
  storageLocation: string | null;
  status: string;
}

export interface ScanRecord {
  sku: string;
  itemId: string | null;
}

export interface CountReconciliation {
  /** Scanned and expected here — nothing to do. */
  found: ExpectedItem[];
  /** Expected on this shelf but never scanned — probably lost or misfiled. */
  missing: ExpectedItem[];
  /** Scanned here but the system has it somewhere else. */
  misplaced: Array<{ sku: string; itemId: string; expectedLocation: string | null }>;
  /** Scanned but matches no item at all — a stray or a bad label. */
  unknown: string[];
  expectedCount: number;
  scannedCount: number;
  /** found / expected, 0–100. Null when nothing was expected here. */
  accuracyPct: number | null;
}

/** Statuses that mean the unit should physically be on a shelf right now. */
export const ON_HAND_STATUSES = ["IN_STOCK", "LISTED", "RESERVED"] as const;

/**
 * Compares what was scanned on a shelf against what the system expects there.
 *
 * `expected` must be the items whose storageLocation is this shelf; `allByS ku`
 * lets a scan of an item shelved elsewhere be reported as misplaced rather
 * than unknown — the difference between "someone moved it" and "no idea".
 */
export function reconcileCount(
  location: string,
  expected: ExpectedItem[],
  scans: ScanRecord[],
  allBySku: Map<string, ExpectedItem> = new Map()
): CountReconciliation {
  const norm = (s: string) => s.trim().toUpperCase();
  const here = new Set(expected.map((e) => norm(e.sku)));
  const scanned = new Set(scans.map((s) => norm(s.sku)));

  const found: ExpectedItem[] = [];
  const missing: ExpectedItem[] = [];
  for (const item of expected) {
    (scanned.has(norm(item.sku)) ? found : missing).push(item);
  }

  const misplaced: CountReconciliation["misplaced"] = [];
  const unknown: string[] = [];
  for (const sku of scanned) {
    if (here.has(sku)) continue;
    const item = allBySku.get(sku);
    if (item) {
      misplaced.push({ sku, itemId: item.id, expectedLocation: item.storageLocation });
    } else {
      unknown.push(sku);
    }
  }

  return {
    found,
    missing,
    misplaced,
    unknown,
    expectedCount: expected.length,
    scannedCount: scanned.size,
    accuracyPct: expected.length ? Math.round((found.length / expected.length) * 1000) / 10 : null,
  };
}

/** A shelf is clean when nothing is missing, misplaced, or unrecognised. */
export const isClean = (r: CountReconciliation) =>
  r.missing.length === 0 && r.misplaced.length === 0 && r.unknown.length === 0;

/** Value at risk from a count — what the missing units cost us. */
export function missingValue(missing: ExpectedItem[], costBySku: Map<string, number>): number {
  const cents = missing.reduce((a, m) => a + Math.round((costBySku.get(m.sku) ?? 0) * 100), 0);
  return cents / 100;
}
