// Pure input-parsing helpers (no server-only imports, unit-testable).

export function parseMoney(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  // Number(), not parseFloat(): "1O.99" must be rejected, not truncated to 1
  const n = typeof v === "number" ? v : Number(String(v).trim().replace(/^\$/, "").replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
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
