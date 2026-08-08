/** YYYY-MM-DD in LOCAL time (toISOString shifts to UTC and can be off by a day). */
export function localDateStr(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

export function dateStr(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function daysSince(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const dt = typeof d === "string" ? new Date(d) : d;
  return Math.floor((Date.now() - dt.getTime()) / 86_400_000);
}

/** Margin % given sell price and cost. */
export function marginPct(sell: number | null | undefined, cost: number): number | null {
  if (!sell || sell <= 0) return null;
  return ((sell - cost) / sell) * 100;
}

/**
 * Margin as text, bounded so a below-cost price stays readable.
 *
 * Margin is a share of the SALE price, so as the price falls towards zero the
 * percentage runs away: a $0.99 unit carrying $153 of allocated pallet cost is
 * a mathematically correct -15,368%. Five-digit percentages tell you nothing
 * the dollar figure beside them does not, and they made small prices look
 * broken. Past ±999% the sign is the only real information left, so say that
 * instead of printing the number.
 */
export function marginLabel(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n > 999) return ">999%";
  if (n < -999) return "way below cost";
  return `${n.toFixed(digits)}%`;
}
