// Pure input-parsing helpers (no server-only imports, unit-testable).

export function parseMoney(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  // Number(), not parseFloat(): "1O.99" must be rejected, not truncated to 1
  const n = typeof v === "number" ? v : Number(String(v).trim().replace(/^\$/, "").replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/**
 * A whole-number count (unit counts, quantities). Rejects fractions outright
 * rather than rounding — "37.5 units" is a mis-mapped column, not a count.
 */
export function parseCount(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim().replace(/,/g, ""));
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export function parseDate(v: unknown): Date | null {
  if (!v || typeof v !== "string") return null;
  const d = new Date(v.length === 10 ? `${v}T12:00:00` : v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Canonical brand spelling.
 *
 * Real supplier manifests spell the same brand several ways in one file — a
 * Home Depot liquidation sheet carried both "Ryobi" and "RYOBI", which split
 * one brand's history into two and weakened both the Insights brand table and
 * the Bid Calculator's brand lookup (which needs 2+ sales to trust a rate).
 * Known brands map to their house spelling; anything else is title-cased so at
 * least the casing is consistent.
 */
// House spellings. Keep unique on the normalised key — listing both "RIDGID"
// and "Ridgid" silently let the later entry win.
const KNOWN_BRANDS = [
  "Milwaukee", "Ryobi", "DeWalt", "RIDGID", "Makita", "Bosch", "Craftsman",
  "Husky", "HART", "Stanley", "Klein Tools", "Hilti", "Metabo HPT",
  "Kobalt", "SKIL", "Porter-Cable", "Black & Decker", "Toro", "EGO", "Greenworks",
];
const BRAND_BY_KEY = new Map(KNOWN_BRANDS.map((b) => [b.toLowerCase().replace(/[^a-z0-9]/g, ""), b]));

/**
 * Manifest wording for condition, mapped to the five grades we store.
 *
 * Suppliers write whatever they like, and an unrecognised value used to fall
 * through to GOOD — so a pallet manifested as "Damaged" or "Salvage" imported
 * as good stock, overstating both condition and value with nothing on screen
 * to say so. Anything genuinely ambiguous grades DOWN: understating a unit
 * costs a re-grade, overstating it ships a broken item to a buyer.
 */
const CONDITION_SYNONYMS: Record<string, string> = {
  BRAND_NEW: "NEW", NIB: "NEW", NEW_IN_BOX: "NEW", SEALED: "NEW", NWT: "NEW",
  UNOPENED: "NEW", FACTORY_SEALED: "NEW",
  MINT: "LIKE_NEW", EXCELLENT: "LIKE_NEW", OPEN_BOX: "LIKE_NEW", NEW_OTHER: "LIKE_NEW",
  REFURBISHED: "GOOD", REFURB: "GOOD", RENEWED: "GOOD", USED: "GOOD", PRE_OWNED: "GOOD",
  SHELF_PULL: "GOOD", OVERSTOCK: "GOOD",
  ACCEPTABLE: "FAIR", SCRATCH_AND_DENT: "FAIR", SCRATCH_DENT: "FAIR", CUSTOMER_RETURN: "FAIR",
  CUSTOMER_RETURNS: "FAIR", USED_FAIR: "FAIR",
  DAMAGED: "FOR_PARTS", SALVAGE: "FOR_PARTS", BROKEN: "FOR_PARTS", PARTS: "FOR_PARTS",
  PARTS_ONLY: "FOR_PARTS", AS_IS: "FOR_PARTS", NON_FUNCTIONAL: "FOR_PARTS",
  NOT_WORKING: "FOR_PARTS", DEFECTIVE: "FOR_PARTS", MISSING_PARTS: "FOR_PARTS",
};

export interface ConditionMatch {
  /** The grade to store. */
  condition: string;
  /** How it was resolved — callers warn on "synonym" and "fallback". */
  via: "exact" | "synonym" | "fallback";
}

/**
 * Resolves a manifest condition string against the known grades.
 * `valid` is the CONDITIONS enum; `fallback` is used when nothing matches.
 */
export function matchCondition(
  raw: unknown,
  valid: readonly string[],
  fallback = "GOOD"
): ConditionMatch {
  const key = typeof raw === "string" ? raw.trim().toUpperCase().replace(/[\s/-]+/g, "_") : "";
  if (!key) return { condition: fallback, via: "exact" }; // blank column, not a mis-read
  if (valid.includes(key)) return { condition: key, via: "exact" };
  const syn = CONDITION_SYNONYMS[key];
  if (syn && valid.includes(syn)) return { condition: syn, via: "synonym" };
  return { condition: fallback, via: "fallback" };
}

export function normalizeBrand(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const known = BRAND_BY_KEY.get(trimmed.toLowerCase().replace(/[^a-z0-9]/g, ""));
  if (known) return known;
  // Unknown brand: normalise casing so "ACME" and "acme" don't diverge.
  return trimmed
    .split(/\s+/)
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}
