// Pure SKU / pallet-code formatting (no DB), so the numbering is unit-testable.

/** Highest numeric suffix among codes sharing a prefix (robust past 999). */
export function maxSuffix(codes: string[], prefix: string): number {
  let max = 0;
  for (const code of codes) {
    if (!code.startsWith(prefix)) continue;
    const n = parseInt(code.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

/** Pallet codes look like PAL-2026-001. */
export const palletCodePrefix = (year: number) => `PAL-${year}-`;

export const formatCode = (prefix: string, n: number) => `${prefix}${String(n).padStart(3, "0")}`;

/** Item SKUs hang off the pallet's sequence: PAL-2026-001 -> ITM-PAL001-. */
export function itemSkuPrefix(palletCode: string): string {
  const seq = palletCode.split("-").pop() || "000";
  return `ITM-PAL${seq}-`;
}

/** The numeric part of a code built by formatCode. */
export function suffixOf(code: string, prefix: string): number {
  const n = parseInt(code.slice(prefix.length), 10);
  return Number.isFinite(n) ? n : 0;
}

/** `count` sequential codes starting at `start`, e.g. ITM-PAL001-004..006. */
export function sequence(prefix: string, start: number, count: number): string[] {
  return Array.from({ length: count }, (_, n) => formatCode(prefix, start + n));
}
