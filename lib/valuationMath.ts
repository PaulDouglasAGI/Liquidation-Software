// What the inventory sitting in the warehouse is actually worth.
//
// Pure (no DB), and deliberately the same recovery-rate engine the Bid
// Calculator uses on prospective pallets — applied instead to stock already
// owned. The point is one honest number: not retail, not what we're asking,
// but what history says we will really bank on it.
import { feeRateFor, type FeeRates } from "./fees";
import type { RecoveryStat } from "./bidMath";

/** One unsold unit on the shelf. */
export interface Holding {
  category: string;
  brand: string | null;
  status: string; // IN_STOCK | LISTED | RESERVED
  ourCost: number;
  sellPrice: number | null;
  msrp: number | null;
  platform: string | null;
}

/** Where each unit's expected value came from — drives the confidence note. */
export type ValueSource = "brand" | "category" | "asking" | "fallback";

export interface ValuationAssumptions {
  /** Share of held stock expected to sell at all. */
  sellThroughPct: number;
  /** Recovery to assume for a category with no sales history. */
  fallbackRecoveryPct: number;
  /** Sales of a category/brand before its rate is trusted. */
  minSalesForHistory: number;
}

/** Below this many recorded sales, rates are indicative rather than reliable. */
export const THIN_HISTORY_SALES = 20;

export const DEFAULT_VALUATION: ValuationAssumptions = {
  sellThroughPct: 85,
  fallbackRecoveryPct: 30,
  minSalesForHistory: 3,
};

export interface CategoryValue {
  key: string;
  units: number;
  costBasis: number;
  expectedNet: number;
  source: ValueSource;
}

export interface InventoryValuation {
  units: number;
  /** What we paid for the unsold stock — the money currently tied up. */
  costBasis: number;
  /** Sticker value of the same stock; useful context, never a forecast. */
  retailValue: number;
  /** Sum of our asking prices — what we HOPE to get. */
  askingValue: number;
  /** What history says we will actually gross, after sell-through. */
  expectedRevenue: number;
  expectedFees: number;
  /** Revenue minus fees — what reaches the bank before goods cost. */
  expectedNet: number;
  /** expectedNet − costBasis: the profit still locked up in the shelves. */
  expectedProfit: number;
  expectedMarginPct: number | null;
  /** expectedProfit / costBasis — return on the money tied up. */
  expectedRoiPct: number | null;
  /** Share of units valued from real sales history, 0–100. */
  confidencePct: number;
  /** How many past sales the rates rest on. 100% of units backed by three
   *  sales is not the same as 100% backed by three hundred. */
  salesBacking: number;
  /** How to read the number: grounded in our data, or still an assumption. */
  basis: "history" | "blended" | "assumption";
  byCategory: CategoryValue[];
  byStatus: { status: string; units: number; costBasis: number; expectedNet: number }[];
}

const cents = (n: number) => Math.round(n * 100);
const fromCents = (n: number) => n / 100;

/** Best available recovery rate for one unit, and where it came from. */
function rateFor(
  h: Holding,
  byCategory: Map<string, RecoveryStat>,
  byBrand: Map<string, RecoveryStat>,
  a: ValuationAssumptions
): { pct: number | null; source: ValueSource } {
  const brand = h.brand ? byBrand.get(h.brand) : undefined;
  if (brand?.avgRecoveryPct != null && brand.soldCount >= a.minSalesForHistory) {
    return { pct: brand.avgRecoveryPct, source: "brand" };
  }
  const cat = byCategory.get(h.category);
  if (cat?.avgRecoveryPct != null && cat.soldCount >= a.minSalesForHistory) {
    return { pct: cat.avgRecoveryPct, source: "category" };
  }
  return { pct: null, source: "fallback" };
}

/**
 * Values every unsold unit.
 *
 * Per unit, in order of how much we trust it:
 *   1. brand history × MSRP    — our own sales of that brand
 *   2. category history × MSRP — our own sales of that category
 *   3. our asking price        — a considered human estimate
 *   4. fallback % × MSRP       — a guess, and reported as one
 */
export function valueInventory(
  holdings: Holding[],
  history: { byCategory: RecoveryStat[]; byBrand: RecoveryStat[] },
  feeRates: FeeRates,
  opts: Partial<ValuationAssumptions> = {}
): InventoryValuation {
  const a = { ...DEFAULT_VALUATION, ...opts };
  const byCategory = new Map(history.byCategory.map((r) => [r.key, r]));
  const byBrand = new Map(history.byBrand.map((r) => [r.key, r]));
  const sellThrough = Math.min(Math.max(a.sellThroughPct, 0), 100) / 100;

  let costBasisC = 0, retailC = 0, askingC = 0, grossC = 0, feesC = 0;
  let historyUnits = 0;
  const catAcc = new Map<string, { units: number; costC: number; netC: number; source: ValueSource }>();
  const statusAcc = new Map<string, { units: number; costC: number; netC: number }>();

  for (const h of holdings) {
    const { pct, source: rateSource } = rateFor(h, byCategory, byBrand, a);

    // Gross for this unit, by the best source available.
    let gross: number;
    let source: ValueSource;
    if (pct !== null && h.msrp) {
      gross = h.msrp * (pct / 100);
      source = rateSource;
      historyUnits++;
    } else if (h.sellPrice) {
      gross = h.sellPrice;
      source = "asking";
    } else if (h.msrp) {
      gross = h.msrp * (a.fallbackRecoveryPct / 100);
      source = "fallback";
    } else {
      // No MSRP and no price: it can only be worth what it cost us.
      gross = h.ourCost;
      source = "fallback";
    }

    const expectedGross = gross * sellThrough;
    const fee = expectedGross * (feeRateFor(h.platform ?? "EBAY", feeRates) / 100);
    const netC = cents(expectedGross - fee);

    costBasisC += cents(h.ourCost);
    retailC += cents(h.msrp ?? 0);
    askingC += cents(h.sellPrice ?? 0);
    grossC += cents(expectedGross);
    feesC += cents(fee);

    const c = catAcc.get(h.category) ?? { units: 0, costC: 0, netC: 0, source };
    c.units++; c.costC += cents(h.ourCost); c.netC += netC;
    // Report the weakest source in the group, so a category is never described
    // as history-backed when part of it is guesswork.
    if (source === "fallback" || (source === "asking" && c.source !== "fallback")) c.source = source;
    catAcc.set(h.category, c);

    const st = statusAcc.get(h.status) ?? { units: 0, costC: 0, netC: 0 };
    st.units++; st.costC += cents(h.ourCost); st.netC += netC;
    statusAcc.set(h.status, st);
  }

  const costBasis = fromCents(costBasisC);
  const expectedRevenue = fromCents(grossC);
  const expectedFees = fromCents(feesC);
  const expectedNet = fromCents(grossC - feesC);
  const expectedProfit = fromCents(grossC - feesC - costBasisC);
  const confidencePct = holdings.length ? Math.round((historyUnits / holdings.length) * 100) : 0;
  // Total sales behind the rates actually used, so a high coverage percentage
  // built on a handful of sales cannot read as certainty.
  const salesBacking = history.byCategory.reduce((n, c) => n + c.soldCount, 0);

  return {
    units: holdings.length,
    costBasis,
    retailValue: fromCents(retailC),
    askingValue: fromCents(askingC),
    expectedRevenue,
    expectedFees,
    expectedNet,
    expectedProfit,
    expectedMarginPct: expectedRevenue > 0 ? Math.round((expectedProfit / expectedRevenue) * 1000) / 10 : null,
    expectedRoiPct: costBasis > 0 ? Math.round((expectedProfit / costBasis) * 1000) / 10 : null,
    confidencePct,
    salesBacking,
    // Named so nobody mistakes an assumption for a measurement. Coverage alone
    // is not enough: thin history is downgraded however many units it touches.
    basis:
      salesBacking < THIN_HISTORY_SALES
        ? confidencePct >= 25 ? "blended" : "assumption"
        : confidencePct >= 70 ? "history" : confidencePct >= 25 ? "blended" : "assumption",
    byCategory: [...catAcc.entries()]
      .map(([key, v]) => ({ key, units: v.units, costBasis: fromCents(v.costC), expectedNet: fromCents(v.netC), source: v.source }))
      .sort((x, y) => y.expectedNet - x.expectedNet),
    byStatus: [...statusAcc.entries()]
      .map(([status, v]) => ({ status, units: v.units, costBasis: fromCents(v.costC), expectedNet: fromCents(v.netC) }))
      .sort((x, y) => y.units - x.units),
  };
}

/** One line explaining how much of the figure is real. */
export function basisNote(v: InventoryValuation, minSales = DEFAULT_VALUATION.minSalesForHistory): string {
  if (v.units === 0) return "No unsold stock to value.";

  const sale = (n: number) => `${n} sale${n === 1 ? "" : "s"}`;

  if (v.salesBacking < THIN_HISTORY_SALES && v.confidencePct > 0) {
    // The honest case early on: coverage is high but the sample is tiny.
    return (
      `Based on only ${sale(v.salesBacking)} so far, so treat this as indicative. ` +
      `It sharpens automatically as you sell — around ${THIN_HISTORY_SALES} sales is where it starts to mean something.`
    );
  }
  if (v.basis === "history") {
    return `${v.confidencePct}% of units valued from your own ${sale(v.salesBacking)}.`;
  }
  if (v.basis === "blended") {
    return (
      `${v.confidencePct}% of units valued from your own ${sale(v.salesBacking)}; the rest use your ` +
      `asking prices. Figures firm up as more sells.`
    );
  }
  return `Estimated from asking prices — no category has ${minSales}+ sales yet. Treat as a rough guide.`;
}
