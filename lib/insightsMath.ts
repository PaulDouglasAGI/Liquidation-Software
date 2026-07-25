// Pure insights math (no DB or server-only imports, unit-testable).
// lib/insights.ts fetches rows and delegates the arithmetic here.
import { feeAwareFloor, feeRateFor, type FeeRates } from "./fees";

export interface VelocityRow {
  key: string;
  soldCount: number;
  avgDaysToSell: number | null;
  avgRecoveryPct: number | null; // sold price as % of MSRP
  avgMultiple: number | null; // sold price / our cost
}

export interface RepriceSuggestion {
  id: string;
  sku: string;
  name: string;
  daysListed: number;
  currentPrice: number;
  suggestedPrice: number;
  cutPct: number;
  costFloor: number; // fee-aware: selling here still nets the cost back
}

export interface MonthRow {
  month: string;
  itemsSold: number;
  revenue: number;
  cogs: number;
  profit: number;
}

/** A sold item flattened into plain numbers. */
export interface SoldRow {
  category: string;
  brand: string | null;
  dateListed: Date | null;
  dateSold: Date | null;
  soldPrice: number | null;
  msrp: number | null;
  ourCost: number;
  feesAndShip: number;
}

/** A currently-listed item flattened into plain numbers. */
export interface ListedRow {
  id: string;
  sku: string;
  name: string;
  dateListed: Date | null;
  sellPrice: number | null;
  ourCost: number;
  platform: string | null;
}

export const dayMs = 86_400_000;

export function avg(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function velocity(key: string, items: SoldRow[]): VelocityRow {
  const days = items
    .filter((i) => i.dateListed && i.dateSold)
    .map((i) => Math.max(0, (i.dateSold!.getTime() - i.dateListed!.getTime()) / dayMs));
  const recovery = items
    .filter((i) => i.soldPrice && i.msrp)
    .map((i) => (i.soldPrice! / i.msrp!) * 100);
  const multiples = items
    .filter((i) => i.soldPrice && i.ourCost > 0)
    .map((i) => i.soldPrice! / i.ourCost);
  return {
    key,
    soldCount: items.length,
    avgDaysToSell: avg(days),
    avgRecoveryPct: avg(recovery),
    avgMultiple: avg(multiples),
  };
}

/** Velocity per category, busiest first. */
export function velocityByCategory(sold: SoldRow[]): VelocityRow[] {
  return [...new Set(sold.map((i) => i.category))]
    .map((c) => velocity(c, sold.filter((i) => i.category === c)))
    .sort((a, b) => b.soldCount - a.soldCount);
}

/** Velocity per brand, only brands with enough sales to mean anything. */
export function velocityByBrand(sold: SoldRow[], minSales = 2, limit = 10): VelocityRow[] {
  const counts = new Map<string, number>();
  for (const i of sold) if (i.brand) counts.set(i.brand, (counts.get(i.brand) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, n]) => n >= minSales)
    .map(([brand]) => velocity(brand, sold.filter((i) => i.brand === brand)))
    .sort((a, b) => b.soldCount - a.soldCount)
    .slice(0, limit);
}

/** Last `count` months of revenue/COGS/profit, oldest first (local time). */
export function monthlyTrend(sold: SoldRow[], now = new Date(), count = 6): MonthRow[] {
  const months: MonthRow[] = [];
  for (let m = count - 1; m >= 0; m--) {
    const start = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - m + 1, 1);
    const inMonth = sold.filter((i) => i.dateSold && i.dateSold >= start && i.dateSold < end);
    const revenue = inMonth.reduce((a, i) => a + (i.soldPrice ?? 0), 0);
    // COGS here includes fees + shipping so "profit" is net of everything
    const cogs = inMonth.reduce((a, i) => a + i.ourCost + i.feesAndShip, 0);
    months.push({
      month: start.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      itemsSold: inMonth.length,
      revenue,
      cogs,
      profit: revenue - cogs,
    });
  }
  return months;
}

/**
 * Price cuts for stock that has sat past the aging threshold: 10% off after
 * `agingDays`, 20% after twice that, but never below the fee-aware cost floor.
 */
export function repriceSuggestions(
  listed: ListedRow[],
  agingDays: number,
  feeRates: FeeRates,
  now = new Date()
): RepriceSuggestion[] {
  const suggestions: RepriceSuggestion[] = [];
  for (const i of listed) {
    const price = i.sellPrice;
    if (!i.dateListed || !price) continue;
    const daysListed = Math.floor((now.getTime() - i.dateListed.getTime()) / dayMs);
    if (daysListed < agingDays) continue;
    const cutPct = daysListed >= agingDays * 2 ? 20 : 10;
    // Floor is fee-aware: selling at the floor must still NET the cost back
    // after the platform's cut (assume eBay when the listing has no platform).
    const floor = feeAwareFloor(i.ourCost, feeRateFor(i.platform ?? "EBAY", feeRates));
    const suggested = Math.max(floor, Math.round(price * (100 - cutPct)) / 100);
    if (suggested >= price) continue; // already at/below cost floor
    suggestions.push({
      id: i.id,
      sku: i.sku,
      name: i.name,
      daysListed,
      currentPrice: price,
      suggestedPrice: suggested,
      cutPct,
      costFloor: floor,
    });
  }
  return suggestions.sort((a, b) => b.daysListed - a.daysListed);
}

/** Returns as a share of all completed outcomes; null when nothing closed yet. */
export function returnRate(soldCount: number, returnedCount: number): number | null {
  const total = soldCount + returnedCount;
  return total > 0 ? (returnedCount / total) * 100 : null;
}
