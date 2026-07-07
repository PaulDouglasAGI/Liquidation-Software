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
