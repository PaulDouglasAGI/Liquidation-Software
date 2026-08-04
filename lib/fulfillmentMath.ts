// Pure fulfillment logic (no DB), so pick ordering and deadlines are testable.

export type OrderStatusValue = "AWAITING_PICK" | "PICKED" | "PACKED" | "SHIPPED" | "CANCELLED";

export interface PickLine {
  itemId: string;
  sku: string;
  name: string;
  storageLocation: string | null;
  picked: boolean;
}

export interface PickableOrder {
  id: string;
  orderNumber: string;
  status: OrderStatusValue;
  shipByDate: Date | null;
  soldAt: Date | null;
  buyerName: string | null;
  items: PickLine[];
}

/**
 * Splits a shelf code into sortable parts so "A-2" comes before "A-10".
 * Plain string sort would put A-10 first and send the picker back and forth.
 */
export function locationSortKey(loc: string | null): Array<string | number> {
  if (!loc) return ["￿"]; // unlocated items last — they need a search
  return loc
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

function compareKeys(a: Array<string | number>, b: Array<string | number>): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i], y = b[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (typeof x === "number" && typeof y === "number") {
      if (x !== y) return x - y;
    } else {
      const sx = String(x), sy = String(y);
      if (sx !== sy) return sx < sy ? -1 : 1;
    }
  }
  return 0;
}

/** Orders every line by shelf so the picker walks the racks once, in order. */
export function sortByLocation<T extends { storageLocation: string | null; sku: string }>(lines: T[]): T[] {
  return [...lines].sort((a, b) => {
    const c = compareKeys(locationSortKey(a.storageLocation), locationSortKey(b.storageLocation));
    return c !== 0 ? c : a.sku.localeCompare(b.sku);
  });
}

/** One walk of the warehouse covering every open order, in shelf order. */
export function buildPickList(orders: PickableOrder[]): Array<PickLine & { orderNumber: string; orderId: string }> {
  const lines = orders
    .filter((o) => o.status === "AWAITING_PICK" || o.status === "PICKED")
    .flatMap((o) => o.items.filter((i) => !i.picked).map((i) => ({ ...i, orderNumber: o.orderNumber, orderId: o.id })));
  return sortByLocation(lines);
}

/** Marketplaces normally require dispatch within a handful of days. */
export const DEFAULT_HANDLING_DAYS = 2;

export function shipByFrom(soldAt: Date | null, handlingDays = DEFAULT_HANDLING_DAYS): Date | null {
  if (!soldAt) return null;
  const d = new Date(soldAt);
  d.setDate(d.getDate() + handlingDays);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Negative = overdue. Null when there is no deadline to measure against. */
export function daysUntilShipBy(shipByDate: Date | null, now = new Date()): number | null {
  if (!shipByDate) return null;
  return Math.floor((shipByDate.getTime() - now.getTime()) / 86_400_000);
}

export type Urgency = "late" | "today" | "soon" | "ok" | "none";

/** How loudly the queue should shout about an order. */
export function urgencyOf(shipByDate: Date | null, now = new Date()): Urgency {
  const days = daysUntilShipBy(shipByDate, now);
  if (days === null) return "none";
  if (days < 0) return "late";
  if (days === 0) return "today";
  if (days === 1) return "soon";
  return "ok";
}

/**
 * Queue order: latest deadline last, and never let an unlocated or unstarted
 * order hide behind one that is merely due later.
 */
export function sortQueue<T extends { shipByDate: Date | null; soldAt: Date | null }>(orders: T[]): T[] {
  const t = (d: Date | null) => (d ? d.getTime() : Number.MAX_SAFE_INTEGER);
  return [...orders].sort((a, b) => t(a.shipByDate) - t(b.shipByDate) || t(a.soldAt) - t(b.soldAt));
}

/** The order is ready to advance once every line has been picked. */
export const allPicked = (items: PickLine[]) => items.length > 0 && items.every((i) => i.picked);

/**
 * Splits an amount into `n` parts that sum EXACTLY to it.
 *
 * A plain divide-and-round loses or gains the remainder — $100 over 3 lines
 * becomes 33.33 x 3 = $99.99 — so item-level money never reconciles to the
 * order or lot total. The leftover cents are handed to the earliest parts.
 */
export function splitEvenly(total: number, n: number): number[] {
  if (n <= 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.trunc(cents / n);
  let remainder = cents - base * n; // sign follows `cents`, so refunds work too
  const step = remainder >= 0 ? 1 : -1;
  return Array.from({ length: n }, () => {
    let c = base;
    if (remainder !== 0) { c += step; remainder -= step; }
    return c / 100;
  });
}

/**
 * Splits an amount by weights, summing EXACTLY to the total. Zero total weight
 * falls back to an even split so unpriced lines still receive their share
 * instead of being booked at $0 revenue against full cost.
 */
export function splitByWeight(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, w) => a + (w > 0 ? w : 0), 0);
  if (sum <= 0) return splitEvenly(total, weights.length);
  const cents = Math.round(total * 100);
  const raw = weights.map((w) => ((w > 0 ? w : 0) / sum) * cents);
  const floored = raw.map((r) => Math.floor(r));
  let remainder = cents - floored.reduce((a, b) => a + b, 0);
  // Give the spare cents to the largest fractional parts — standard largest-
  // remainder allocation, so the rounding is not biased toward line order.
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floored[i] += 1;
    remainder -= 1;
  }
  return floored.map((c) => c / 100);
}

/** Shipping margin on an order — what the buyer paid minus what postage cost. */
export function shippingMargin(paid: number | null, cost: number | null): number | null {
  if (paid === null && cost === null) return null;
  return Math.round(((paid ?? 0) - (cost ?? 0)) * 100) / 100;
}

const CARRIER_PATTERNS: Array<[RegExp, string]> = [
  [/^1Z[0-9A-Z]{16}$/i, "UPS"],
  [/^(94|93|92|94|95)\d{20}$/, "USPS"],
  [/^\d{12}$/, "FedEx"],
  [/^\d{15}$/, "FedEx"],
  [/^\d{22}$/, "USPS"],
];

/** Best-guess carrier from a tracking number, so staff don't pick from a list. */
export function detectCarrier(tracking: string): string | null {
  const t = tracking.replace(/\s+/g, "");
  for (const [re, carrier] of CARRIER_PATTERNS) if (re.test(t)) return carrier;
  return null;
}
