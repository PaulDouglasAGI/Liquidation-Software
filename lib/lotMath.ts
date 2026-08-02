// Pure lot/bundle logic (no DB): pricing a pile of slow movers sold together.

export interface LotCandidate {
  id: string;
  sku: string;
  name: string;
  ourCost: number;
  sellPrice: number | null;
  daysListed: number | null;
  category: string;
}

export interface LotPricing {
  itemCount: number;
  /** What the units cost us — the floor we should not sell below. */
  totalCost: number;
  /** Sum of the individual asking prices. */
  totalIndividualPrice: number;
  /** Suggested lot price after the bundle discount. */
  suggestedPrice: number;
  discountPct: number;
  /** Profit at the suggested price, after fees. */
  netAtSuggested: number;
  /** True when even the cost floor exceeds the discounted price. */
  belowCost: boolean;
}

/**
 * Bundles trade margin for speed, so the discount deepens with the size of the
 * lot — a buyer taking 20 units off your hands is worth more than one taking 3.
 */
export function bundleDiscountPct(itemCount: number): number {
  if (itemCount >= 20) return 45;
  if (itemCount >= 10) return 35;
  if (itemCount >= 5) return 25;
  return 15;
}

/**
 * Prices a lot. The floor is the total cost grossed up for fees, so a bundle
 * can dump dead stock quickly but never at a loss by construction.
 */
export function priceLot(items: LotCandidate[], feePct: number, discountPct?: number): LotPricing {
  const cents = (n: number) => Math.round(n * 100);
  const totalCost = cents(items.reduce((s, i) => s + i.ourCost, 0)) / 100;
  const totalIndividualPrice = cents(items.reduce((s, i) => s + (i.sellPrice ?? 0), 0)) / 100;

  const pct = discountPct ?? bundleDiscountPct(items.length);
  const discounted = Math.round(totalIndividualPrice * (100 - pct)) / 100;

  // Fee-aware floor: selling here still returns the goods cost after the cut.
  const denom = 1 - Math.min(Math.max(feePct, 0), 99) / 100;
  const floor = totalCost > 0 ? Math.round((totalCost / denom) * 100) / 100 : 0;

  const suggestedPrice = Math.max(discounted, floor);
  const fees = Math.round(suggestedPrice * (feePct / 100) * 100) / 100;

  return {
    itemCount: items.length,
    totalCost,
    totalIndividualPrice,
    suggestedPrice,
    discountPct: pct,
    netAtSuggested: Math.round((suggestedPrice - totalCost - fees) * 100) / 100,
    belowCost: discounted < floor,
  };
}

/**
 * Ranks stale stock for bundling: oldest and cheapest first, since those are
 * the units least likely to ever sell individually.
 */
export function rankBundleCandidates(items: LotCandidate[], minDaysListed = 60): LotCandidate[] {
  return items
    .filter((i) => (i.daysListed ?? 0) >= minDaysListed)
    .sort((a, b) => (b.daysListed ?? 0) - (a.daysListed ?? 0) || a.ourCost - b.ourCost);
}

/** Groups candidates by category so a lot is coherent to a buyer. */
export function groupByCategory(items: LotCandidate[]): Map<string, LotCandidate[]> {
  const out = new Map<string, LotCandidate[]>();
  for (const i of items) {
    const list = out.get(i.category) ?? [];
    list.push(i);
    out.set(i.category, list);
  }
  return out;
}

/** Suggested title, e.g. "Power Tools Lot — 12 items". */
export const lotTitle = (categoryLabel: string, count: number) =>
  `${categoryLabel} Lot — ${count} item${count === 1 ? "" : "s"}`;
