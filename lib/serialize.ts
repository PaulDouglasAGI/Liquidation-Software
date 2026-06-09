import { Prisma } from "@prisma/client";

/**
 * Recursively converts Prisma Decimal fields to plain numbers and Dates to
 * ISO strings so query results can cross the server/client boundary.
 */
export function toPlain<T>(value: T): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Prisma.Decimal) return value.toNumber();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = toPlain(v);
    }
    return out;
  }
  return value;
}

export const num = (d: Prisma.Decimal | null | undefined): number | null =>
  d === null || d === undefined ? null : d.toNumber();
