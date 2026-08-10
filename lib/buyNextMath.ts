// What to buy next, computed from what actually happened. Pure — no DB — so
// every number here is unit-testable.

/**
 * Gross profit alone is a trap in this business.
 *
 * A pallet that doubles your money in three weeks and a pallet that doubles it
 * in nine months look identical on a profit column, and the first is twelve
 * times the business. Worse, the slow one ties up the cash and the shelf that
 * the fast one needed. So the ranking here is built on annualised return on
 * capital — margin AND velocity — then docked for the ways a segment quietly
 * costs money (duds, returns, markdowns, unsold tail) and shrunk toward the
 * house average so one lucky lot cannot top the table.
 */

const DAY_MS = 86_400_000;

/** One unit that has passed through the business. */
export interface BuyNextUnit {
  category: string;
  brand: string | null;
  supplier: string;
  conditionGrade: string;
  /** Allocated share of what the lot cost. */
  cost: number;
  /** null while unsold. */
  salePrice: number | null;
  fees: number | null;
  /** Postage we paid out. */
  shippingPaid: number | null;
  /** Postage the buyer paid us. */
  shippingCollected: number | null;
  /** When the lot physically arrived. */
  receivedAt: Date | null;
  listedAt: Date | null;
  soldAt: Date | null;
  isDud: boolean;
  scrapped: boolean;
  returned: boolean;
  /** Asking price at listing time, to detect markdowns. */
  listPrice: number | null;
  lotId: string;
  hours: number;
}

export interface SegmentStats {
  key: string;
  label: string;
  dimension: "category" | "brand" | "supplier" | "grade" | "category+grade";

  // ── Volume ────────────────────────────────────────────────────────────
  unitsBought: number;
  unitsSold: number;
  unitsUnsold: number;
  unitsAgedUnsold: number;
  lots: number;

  // ── Money ─────────────────────────────────────────────────────────────
  cost: number;
  grossRevenue: number;
  fees: number;
  postagePaid: number;
  postageCollected: number;
  /** What actually reached the bank. */
  netProceeds: number;
  netProfit: number;
  netMarginPct: number | null;
  /** netProceeds / cost — 2.0 means the money came back twice. */
  netMultiple: number | null;
  profitPerUnitBought: number | null;
  profitPerUnitSold: number | null;
  medianSalePrice: number | null;

  // ── Speed ─────────────────────────────────────────────────────────────
  medianDaysToList: number | null;
  medianDaysOnShelf: number | null;
  /** Arrival to cash. The number the capital actually feels. */
  medianCashCycleDays: number | null;
  sellThroughPct: number | null;
  sellThrough30Pct: number | null;
  sellThrough90Pct: number | null;

  // ── Risk ──────────────────────────────────────────────────────────────
  dudRatePct: number;
  scrapRatePct: number;
  returnRatePct: number | null;
  markdownRatePct: number | null;
  avgMarkdownPct: number | null;

  // ── Labour ────────────────────────────────────────────────────────────
  hours: number;
  profitPerHour: number | null;
  unitsPerHour: number | null;

  // ── The verdict ───────────────────────────────────────────────────────
  /** (netMultiple − 1) × turns per year. How hard the capital works. */
  annualisedReturnPct: number | null;
  /** annualisedReturn after risk deductions. */
  riskAdjustedReturnPct: number | null;
  /** Shrunk toward the house average by sample size. The ranking column. */
  score: number | null;
  /** 0–1. How much history stands behind the score. */
  confidence: number;
  /**
   * Whether this is safe to act on.
   *
   * The score can be genuinely high off one lucky lot — six units that
   * returned 26x really is strong evidence, arithmetically. But one lot is one
   * bet on one supplier on one day, and buying against it is how a good
   * quarter becomes a bad year. So a segment is ranked on its number and
   * recommended only once more than one lot agrees.
   */
  recommended: boolean;
  /** Plain-language reason, for the operator rather than the analyst. */
  verdict: string;
}

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const days = (from: Date | null, to: Date | null): number | null =>
  from && to ? Math.max(0, (to.getTime() - from.getTime()) / DAY_MS) : null;

const round = (n: number, p = 2) => Math.round(n * 10 ** p) / 10 ** p;
const pct = (num: number, den: number): number | null => (den > 0 ? round((num / den) * 100, 1) : null);

/**
 * Capital cannot turn faster than about once a week in this business, and a
 * segment with a 3-day cycle from two lucky units would otherwise compute an
 * absurd annualised return. Floor the cycle before dividing by it.
 */
const MIN_CYCLE_DAYS = 7;

/**
 * Sample size at which a segment is trusted on its own. Below it the score is
 * pulled toward the house average in proportion — 10 units of history is a
 * hint, 60 is a finding. This is what stops "buy Appliances" appearing off a
 * single 38-unit pallet.
 */
const CONFIDENCE_UNITS = 60;
const CONFIDENCE_LOTS = 3;

/**
 * Evidence needed before a segment is offered as something to go and buy.
 * Two separate lots, so the result has survived more than one supplier, one
 * manifest and one day.
 */
const RECOMMEND_MIN_LOTS = 2;
const RECOMMEND_MIN_SOLD = 15;

function statsFor(key: string, label: string, dimension: SegmentStats["dimension"], units: BuyNextUnit[], now: Date): SegmentStats {
  const sold = units.filter((u) => u.soldAt != null && u.salePrice != null);
  const unsold = units.filter((u) => u.soldAt == null && !u.scrapped);

  const cost = units.reduce((s, u) => s + u.cost, 0);
  const grossRevenue = sold.reduce((s, u) => s + (u.salePrice ?? 0), 0);
  const fees = sold.reduce((s, u) => s + (u.fees ?? 0), 0);
  const postagePaid = sold.reduce((s, u) => s + (u.shippingPaid ?? 0), 0);
  const postageCollected = sold.reduce((s, u) => s + (u.shippingCollected ?? 0), 0);
  const netProceeds = grossRevenue - fees - postagePaid + postageCollected;
  const netProfit = netProceeds - cost;

  const cycles = sold.map((u) => days(u.receivedAt, u.soldAt)).filter((d): d is number => d != null);
  const onShelf = sold.map((u) => days(u.listedAt, u.soldAt)).filter((d): d is number => d != null);
  const toList = units.map((u) => days(u.receivedAt, u.listedAt)).filter((d): d is number => d != null);

  const soldWithin = (n: number) =>
    sold.filter((u) => { const d = days(u.receivedAt, u.soldAt); return d != null && d <= n; }).length;

  const markedDown = sold.filter((u) => u.listPrice != null && u.salePrice != null && u.salePrice < u.listPrice);
  const markdowns = markedDown.map((u) => ((u.listPrice! - u.salePrice!) / u.listPrice!) * 100);

  const agedUnsold = unsold.filter((u) => { const d = days(u.receivedAt, now); return d != null && d > 60; }).length;
  const hours = units.reduce((s, u) => s + u.hours, 0);
  const netMultiple = cost > 0 ? netProceeds / cost : null;
  const cycleDays = median(cycles);

  // Turns per year at this cycle length, then the margin earned per turn.
  const turns = cycleDays != null ? 365 / Math.max(cycleDays, MIN_CYCLE_DAYS) : null;
  const annualised = netMultiple != null && turns != null ? (netMultiple - 1) * turns * 100 : null;

  const dudRate = units.length ? (units.filter((u) => u.isDud).length / units.length) * 100 : 0;
  const scrapRate = units.length ? (units.filter((u) => u.scrapped).length / units.length) * 100 : 0;
  const returnRate = pct(units.filter((u) => u.returned).length, sold.length + units.filter((u) => u.returned).length);

  // Capital still stuck in stock that has not moved is a real drag on the
  // return, so unsold tail is charged against it rather than ignored.
  const stuckPct = units.length ? (agedUnsold / units.length) * 100 : 0;
  const riskAdjusted = annualised == null ? null : annualised * (1 - Math.min(0.9, (dudRate + stuckPct) / 200));

  return {
    key, label, dimension,
    unitsBought: units.length,
    unitsSold: sold.length,
    unitsUnsold: unsold.length,
    unitsAgedUnsold: agedUnsold,
    lots: new Set(units.map((u) => u.lotId)).size,
    cost: round(cost),
    grossRevenue: round(grossRevenue),
    fees: round(fees),
    postagePaid: round(postagePaid),
    postageCollected: round(postageCollected),
    netProceeds: round(netProceeds),
    netProfit: round(netProfit),
    netMarginPct: grossRevenue > 0 ? round((netProfit / grossRevenue) * 100, 1) : null,
    netMultiple: netMultiple == null ? null : round(netMultiple, 2),
    profitPerUnitBought: units.length ? round(netProfit / units.length) : null,
    profitPerUnitSold: sold.length ? round(netProfit / sold.length) : null,
    medianSalePrice: median(sold.map((u) => u.salePrice!)),
    medianDaysToList: toList.length ? round(median(toList)!, 1) : null,
    medianDaysOnShelf: onShelf.length ? round(median(onShelf)!, 1) : null,
    medianCashCycleDays: cycleDays == null ? null : round(cycleDays, 1),
    sellThroughPct: pct(sold.length, units.length),
    sellThrough30Pct: pct(soldWithin(30), units.length),
    sellThrough90Pct: pct(soldWithin(90), units.length),
    dudRatePct: round(dudRate, 1),
    scrapRatePct: round(scrapRate, 1),
    returnRatePct: returnRate,
    markdownRatePct: pct(markedDown.length, sold.length),
    avgMarkdownPct: markdowns.length ? round(markdowns.reduce((a, b) => a + b, 0) / markdowns.length, 1) : null,
    hours: round(hours, 1),
    profitPerHour: hours > 0 ? round(netProfit / hours) : null,
    unitsPerHour: hours > 0 ? round(units.length / hours, 1) : null,
    annualisedReturnPct: annualised == null ? null : round(annualised, 1),
    riskAdjustedReturnPct: riskAdjusted == null ? null : round(riskAdjusted, 1),
    score: null,      // filled in by rankSegments once the house average exists
    confidence: 0,
    recommended: false,
    verdict: "",
  };
}

function verdictFor(s: SegmentStats, houseMultiple: number): string {
  if (s.unitsSold === 0) return "Nothing has sold yet — no read on this one.";
  const conf = !s.recommended ? "Too little history to act on yet: " : s.confidence < 0.5 ? "Still thin: " : "";
  const speed =
    s.medianCashCycleDays == null ? ""
      : s.medianCashCycleDays <= 21 ? "turns fast"
      : s.medianCashCycleDays <= 60 ? "turns at a normal pace"
      : "sits for months";
  const money =
    s.netMultiple == null ? ""
      : s.netMultiple >= 3 ? `returns ${s.netMultiple.toFixed(1)}× net`
      : s.netMultiple >= 1.6 ? `returns a solid ${s.netMultiple.toFixed(1)}× net`
      : s.netMultiple > 1 ? `only returns ${s.netMultiple.toFixed(1)}× net`
      : "loses money";
  const risk =
    s.dudRatePct >= 20 ? `, but ${s.dudRatePct}% arrive dead`
      : s.unitsAgedUnsold > 0 ? `, with ${s.unitsAgedUnsold} unit(s) still stuck past 60 days`
      : "";
  const call =
    (s.netMultiple ?? 0) > houseMultiple * 1.25 ? " Buy more of this."
      : (s.netMultiple ?? 0) < houseMultiple * 0.75 ? " Bid lower or skip."
      : " Worth buying at the right price.";
  return `${conf}${money} and ${speed}${risk}.${call}`;
}

/**
 * Ranks segments, shrinking each toward the house average by how much history
 * stands behind it.
 *
 * Without this the table is topped by whichever segment had one good week. The
 * shrinkage means a segment has to keep being good, across more than one lot,
 * before it outranks a merely solid one with real volume behind it.
 */
export function rankSegments(segments: SegmentStats[]): SegmentStats[] {
  const scored = segments.filter((s) => s.unitsSold > 0 && s.cost > 0);

  // House averages, per unit of capital, across everything that has sold.
  const houseCost = scored.reduce((s, x) => s + x.cost, 0);
  const houseNet = scored.reduce((s, x) => s + x.netProceeds, 0);
  const houseUnits = scored.reduce((s, x) => s + x.unitsBought, 0);
  const houseCostPerUnit = houseUnits > 0 ? houseCost / houseUnits : 0;
  const houseNetPerUnit = houseUnits > 0 ? houseNet / houseUnits : 0;
  const houseCycle =
    median(scored.map((s) => s.medianCashCycleDays).filter((d): d is number => d != null)) ?? 60;
  const houseMultiple = houseCost > 0 ? houseNet / houseCost : 1;

  for (const s of segments) {
    const byUnits = Math.min(1, s.unitsSold / CONFIDENCE_UNITS);
    const byLots = Math.min(1, s.lots / CONFIDENCE_LOTS);
    // Both matter: 200 units from one lot is still one bet.
    s.confidence = round(Math.sqrt(byUnits * byLots), 2);
  }

  for (const s of segments) {
    if (s.unitsSold === 0 || s.cost <= 0) {
      s.score = null;
      s.verdict = verdictFor(s, houseMultiple);
      continue;
    }

    // Shrink the INPUTS, not the answer.
    //
    // Blending the finished score toward the house average cannot tame an
    // outlier: six units that returned 26× still swamped ninety units that
    // returned 3.9×, because the raw gap was an order of magnitude and the
    // annualising step then multiplied it again. So the segment is instead
    // credited with K phantom units of merely average performance. Six real
    // units barely move that; ninety overwhelm it. Standard pseudo-counts,
    // and it degrades gracefully to the true figure as evidence accumulates.
    const k = CONFIDENCE_UNITS * (1 - Math.min(1, s.lots / CONFIDENCE_LOTS) * 0.5);
    const shrunkMultiple =
      (s.netProceeds + k * houseNetPerUnit) / (s.cost + k * houseCostPerUnit);

    // The cycle gets the same treatment, so a handful of quick sales cannot
    // imply the whole segment turns in a week.
    const ownCycle = s.medianCashCycleDays ?? houseCycle;
    const shrunkCycle = (ownCycle * s.unitsSold + houseCycle * k) / (s.unitsSold + k);
    const turns = 365 / Math.max(shrunkCycle, MIN_CYCLE_DAYS);

    const stuckPct = s.unitsBought ? (s.unitsAgedUnsold / s.unitsBought) * 100 : 0;
    const riskFactor = 1 - Math.min(0.9, (s.dudRatePct + stuckPct) / 200);

    s.score = round((shrunkMultiple - 1) * turns * 100 * riskFactor, 1);
    s.recommended = s.lots >= RECOMMEND_MIN_LOTS && s.unitsSold >= RECOMMEND_MIN_SOLD;
    s.verdict = verdictFor(s, houseMultiple);
  }

  // Actionable segments first. A thin segment can score higher and still not be
  // where the next $4,000 should go, so it sorts below everything that has
  // earned its place — visible, ranked, but not leading the page.
  return [...segments].sort((a, b) => {
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
    return (b.score ?? -Infinity) - (a.score ?? -Infinity);
  });
}

export interface BuyNextReport {
  byCategory: SegmentStats[];
  byGrade: SegmentStats[];
  bySupplier: SegmentStats[];
  byBrand: SegmentStats[];
  byCategoryGrade: SegmentStats[];
  /** Weighted house average annualised return, for context. */
  houseReturnPct: number | null;
  totalUnits: number;
  totalCost: number;
}

function group(units: BuyNextUnit[], keyOf: (u: BuyNextUnit) => string | null): Map<string, BuyNextUnit[]> {
  const m = new Map<string, BuyNextUnit[]>();
  for (const u of units) {
    const k = keyOf(u);
    if (!k) continue;
    const list = m.get(k);
    if (list) list.push(u); else m.set(k, [u]);
  }
  return m;
}

/** Minimum units before a segment is worth showing at all. */
const MIN_UNITS = 5;

export function buildBuyNext(units: BuyNextUnit[], now = new Date()): BuyNextReport {
  const dim = (
    keyOf: (u: BuyNextUnit) => string | null,
    dimension: SegmentStats["dimension"],
    labelOf: (k: string) => string = (k) => k
  ) =>
    rankSegments(
      [...group(units, keyOf).entries()]
        .filter(([, us]) => us.length >= MIN_UNITS)
        .map(([k, us]) => statsFor(k, labelOf(k), dimension, us, now))
    );

  const all = statsFor("all", "All stock", "category", units, now);
  return {
    byCategory: dim((u) => u.category, "category"),
    byGrade: dim((u) => u.conditionGrade, "grade"),
    bySupplier: dim((u) => u.supplier, "supplier"),
    byBrand: dim((u) => u.brand, "brand"),
    byCategoryGrade: dim((u) => `${u.category}||${u.conditionGrade}`, "category+grade", (k) => k.replace("||", " · ")),
    houseReturnPct: all.riskAdjustedReturnPct,
    totalUnits: units.length,
    totalCost: all.cost,
  };
}
