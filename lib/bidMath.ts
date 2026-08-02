// Pure buy-side decision support (no DB): what a pallet is worth to US,
// based on how our own past inventory in those categories actually performed.
import { feeRateFor, type FeeRates } from "./fees";

/** Historical performance for one category/brand, from lib/insightsMath. */
export interface RecoveryStat {
  key: string;
  soldCount: number;
  /** Sold price as a % of MSRP. */
  avgRecoveryPct: number | null;
  avgDaysToSell: number | null;
}

/** One line of a manifest being evaluated before purchase. */
export interface ManifestLine {
  name: string;
  category: string;
  brand?: string | null;
  qty: number;
  msrp: number | null;
}

export interface BidAssumptions {
  /** Share of units expected to be sellable at all (rest is damage/shrink). */
  sellThroughPct: number;
  /** Fallback recovery when we have no history for a category. */
  fallbackRecoveryPct: number;
  /** Profit margin we require on the whole pallet, as a % of revenue. */
  targetMarginPct: number;
  /** Average postage per unit sold. */
  shippingPerUnit: number;
  /** Platform we expect to sell on, for fee estimation. */
  platform: string;
}

export const DEFAULT_ASSUMPTIONS: BidAssumptions = {
  sellThroughPct: 85,
  fallbackRecoveryPct: 30,
  targetMarginPct: 35,
  shippingPerUnit: 0,
  platform: "EBAY",
};

export interface BidLineResult extends ManifestLine {
  /** Recovery % applied, and whether it came from our data or the fallback. */
  recoveryPct: number;
  recoverySource: "brand" | "category" | "fallback";
  /** qty x msrp x recovery — before sell-through, fees, or shipping. */
  grossValue: number;
  avgDaysToSell: number | null;
}

export interface BidEstimate {
  lines: BidLineResult[];
  totalUnits: number;
  /** Units we expect to actually sell. */
  sellableUnits: number;
  /** Retail value of the manifest, for reference. */
  totalMsrp: number;
  /** Expected gross revenue after recovery and sell-through. */
  expectedRevenue: number;
  expectedFees: number;
  expectedShipping: number;
  /** Revenue minus fees and postage — what reaches us before goods cost. */
  netBeforeCost: number;
  /** The most we can pay and still hit the target margin. */
  maxBid: number;
  /** Rough time to liquidate, weighted by unit count. */
  estimatedDaysToSell: number | null;
  /** How much of the estimate rests on real history vs the fallback, 0–100. */
  confidencePct: number;
  warnings: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function lookup(
  line: ManifestLine,
  byCategory: Map<string, RecoveryStat>,
  byBrand: Map<string, RecoveryStat>,
  fallback: number
): { pct: number; source: BidLineResult["recoverySource"]; days: number | null } {
  // Brand history is more specific than category, so prefer it when we have
  // enough sales for it to mean anything.
  const brand = line.brand ? byBrand.get(line.brand) : undefined;
  if (brand && brand.avgRecoveryPct !== null && brand.soldCount >= 2) {
    return { pct: brand.avgRecoveryPct, source: "brand", days: brand.avgDaysToSell };
  }
  const cat = byCategory.get(line.category);
  if (cat && cat.avgRecoveryPct !== null && cat.soldCount >= 1) {
    return { pct: cat.avgRecoveryPct, source: "category", days: cat.avgDaysToSell };
  }
  return { pct: fallback, source: "fallback", days: null };
}

/**
 * Turns a manifest into a maximum bid.
 *
 * The chain is: MSRP → what we historically recover → how much we actually
 * sell → minus fees and postage → minus the margin we require. Whatever is
 * left is the most the pallet can be worth to us.
 */
export function estimateBid(
  manifest: ManifestLine[],
  history: { byCategory: RecoveryStat[]; byBrand: RecoveryStat[] },
  feeRates: FeeRates,
  opts: Partial<BidAssumptions> = {}
): BidEstimate {
  const a = { ...DEFAULT_ASSUMPTIONS, ...opts };
  const byCategory = new Map(history.byCategory.map((r) => [r.key, r]));
  const byBrand = new Map(history.byBrand.map((r) => [r.key, r]));
  const warnings: string[] = [];

  const lines: BidLineResult[] = manifest.map((line) => {
    const qty = Math.max(0, Math.floor(line.qty || 0));
    const { pct, source, days } = lookup(line, byCategory, byBrand, a.fallbackRecoveryPct);
    const msrp = line.msrp ?? 0;
    return {
      ...line,
      qty,
      recoveryPct: pct,
      recoverySource: source,
      avgDaysToSell: days,
      grossValue: round2(qty * msrp * (pct / 100)),
    };
  });

  const totalUnits = lines.reduce((s, l) => s + l.qty, 0);
  const totalMsrp = round2(lines.reduce((s, l) => s + l.qty * (l.msrp ?? 0), 0));
  const grossValue = lines.reduce((s, l) => s + l.grossValue, 0);

  const sellThrough = Math.min(Math.max(a.sellThroughPct, 0), 100) / 100;
  const sellableUnits = Math.round(totalUnits * sellThrough);
  const expectedRevenue = round2(grossValue * sellThrough);
  const expectedFees = round2(expectedRevenue * (feeRateFor(a.platform, feeRates) / 100));
  const expectedShipping = round2(sellableUnits * a.shippingPerUnit);
  const netBeforeCost = round2(expectedRevenue - expectedFees - expectedShipping);

  const margin = Math.min(Math.max(a.targetMarginPct, 0), 99) / 100;
  // Pay at most what leaves the required margin on expected revenue.
  const maxBid = round2(Math.max(0, netBeforeCost - expectedRevenue * margin));

  // Weight days-to-sell by units so a 200-unit line dominates a 2-unit one.
  const withDays = lines.filter((l) => l.avgDaysToSell !== null && l.qty > 0);
  const dayUnits = withDays.reduce((s, l) => s + l.qty, 0);
  const estimatedDaysToSell = dayUnits
    ? Math.round((withDays.reduce((s, l) => s + l.avgDaysToSell! * l.qty, 0) / dayUnits) * 10) / 10
    : null;

  const knownUnits = lines.filter((l) => l.recoverySource !== "fallback").reduce((s, l) => s + l.qty, 0);
  const confidencePct = totalUnits ? Math.round((knownUnits / totalUnits) * 100) : 0;

  if (totalUnits === 0) warnings.push("Manifest has no units — nothing to value.");
  if (lines.some((l) => !l.msrp)) {
    warnings.push("Some lines have no MSRP; they contribute nothing to the estimate.");
  }
  if (confidencePct < 50 && totalUnits > 0) {
    warnings.push(
      `Only ${confidencePct}% of units match categories you have sold before — the rest use the ${a.fallbackRecoveryPct}% fallback.`
    );
  }
  if (estimatedDaysToSell !== null && estimatedDaysToSell > 60) {
    warnings.push(`Expect roughly ${estimatedDaysToSell} days to sell through — slow money.`);
  }

  return {
    lines,
    totalUnits,
    sellableUnits,
    totalMsrp,
    expectedRevenue,
    expectedFees,
    expectedShipping,
    netBeforeCost,
    maxBid,
    estimatedDaysToSell,
    confidencePct,
    warnings,
  };
}

/** Profit if the pallet is actually won at `bid`. */
export function profitAtBid(est: BidEstimate, bid: number): { profit: number; marginPct: number | null; roiPct: number | null } {
  const profit = round2(est.netBeforeCost - bid);
  return {
    profit,
    marginPct: est.expectedRevenue > 0 ? Math.round((profit / est.expectedRevenue) * 1000) / 10 : null,
    roiPct: bid > 0 ? Math.round((profit / bid) * 1000) / 10 : null,
  };
}
