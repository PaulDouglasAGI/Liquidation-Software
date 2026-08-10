// Quarterly time series for the pallet-performance graphs. Pure — no DB.

/**
 * Rotation is the thing a liquidation business lives or dies on: how fast the
 * same money goes out, comes back, and goes out again. A profit column cannot
 * show it. A line per quarter can.
 */

const DAY_MS = 86_400_000;

export interface RotationUnit {
  lotId: string;
  cost: number;
  salePrice: number | null;
  fees: number | null;
  shippingPaid: number | null;
  shippingCollected: number | null;
  receivedAt: Date | null;
  soldAt: Date | null;
  scrapped: boolean;
}

export interface RotationLot {
  id: string;
  code: string;
  cost: number;
  receivedAt: Date | null;
}

export interface QuarterPoint {
  /** "2026-Q3" */
  key: string;
  label: string;
  year: number;
  quarter: number;
  /** Sort order and x-position. */
  index: number;

  /** Money spent on lots that arrived this quarter. */
  spend: number;
  /** Sales banked this quarter, gross. */
  grossRevenue: number;
  fees: number;
  postage: number;
  postageCollected: number;
  /** What reached the bank this quarter. */
  netProceeds: number;
  /** netProceeds less the cost of the units that sold this quarter. */
  netProfit: number;
  unitsBought: number;
  unitsSold: number;
  /** Cost of units still unsold at the end of this quarter — capital on the shelf. */
  capitalOnShelf: number;
  unitsOnShelf: number;
  /** netProceeds this quarter ÷ average capital held. Turns per quarter. */
  turnRate: number | null;
  /** Median days from arrival to sale, for units sold in this quarter. */
  medianCashCycleDays: number | null;
  /** Cumulative net profit to the end of this quarter. */
  cumulativeProfit: number;
}

export const quarterOf = (d: Date) => Math.floor(d.getUTCMonth() / 3) + 1;
export const quarterKey = (d: Date) => `${d.getUTCFullYear()}-Q${quarterOf(d)}`;
const quarterIndex = (year: number, q: number) => year * 4 + (q - 1);

const round = (n: number, p = 2) => Math.round(n * 10 ** p) / 10 ** p;

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** End of a quarter, for "what was still on the shelf then" questions. */
function quarterEnd(year: number, q: number): Date {
  return new Date(Date.UTC(year, q * 3, 1) - 1);
}

/**
 * One point per quarter from the first arrival to the last sale, with no gaps —
 * a quarter where nothing happened is a real and meaningful zero, and skipping
 * it would draw a straight line through a dead season.
 */
export function buildQuarterlySeries(units: RotationUnit[], now = new Date()): QuarterPoint[] {
  const dated = units.filter((u) => u.receivedAt || u.soldAt);
  if (dated.length === 0) return [];

  const stamps: Date[] = [];
  for (const u of dated) {
    if (u.receivedAt) stamps.push(u.receivedAt);
    if (u.soldAt) stamps.push(u.soldAt);
  }
  const first = new Date(Math.min(...stamps.map((d) => d.getTime())));
  const last = new Date(Math.max(...stamps.map((d) => d.getTime()), now.getTime()));

  const startIdx = quarterIndex(first.getUTCFullYear(), quarterOf(first));
  const endIdx = quarterIndex(last.getUTCFullYear(), quarterOf(last));

  const points: QuarterPoint[] = [];
  let cumulative = 0;
  let prevCapital: number | null = null;

  for (let idx = startIdx; idx <= endIdx; idx++) {
    const year = Math.floor(idx / 4);
    const q = (idx % 4) + 1;
    const end = quarterEnd(year, q);

    const boughtThis = dated.filter((u) => u.receivedAt && quarterIndex(u.receivedAt.getUTCFullYear(), quarterOf(u.receivedAt)) === idx);
    const soldThis = dated.filter((u) => u.soldAt && quarterIndex(u.soldAt.getUTCFullYear(), quarterOf(u.soldAt)) === idx);

    const grossRevenue = soldThis.reduce((s, u) => s + (u.salePrice ?? 0), 0);
    const fees = soldThis.reduce((s, u) => s + (u.fees ?? 0), 0);
    const postage = soldThis.reduce((s, u) => s + (u.shippingPaid ?? 0), 0);
    const postageCollected = soldThis.reduce((s, u) => s + (u.shippingCollected ?? 0), 0);
    const netProceeds = grossRevenue - fees - postage + postageCollected;
    const cogsSold = soldThis.reduce((s, u) => s + u.cost, 0);
    const netProfit = netProceeds - cogsSold;
    cumulative += netProfit;

    // Anything that had arrived by the end of this quarter and had not sold or
    // been scrapped yet: the capital sitting on the shelf at that moment.
    const onShelf = dated.filter(
      (u) => u.receivedAt != null && u.receivedAt <= end && !u.scrapped && (u.soldAt == null || u.soldAt > end)
    );
    const capitalOnShelf = onShelf.reduce((s, u) => s + u.cost, 0);

    const avgCapital = prevCapital == null ? capitalOnShelf : (prevCapital + capitalOnShelf) / 2;
    prevCapital = capitalOnShelf;

    const cycles = soldThis
      .map((u) => (u.receivedAt && u.soldAt ? (u.soldAt.getTime() - u.receivedAt.getTime()) / DAY_MS : null))
      .filter((d): d is number => d != null && d >= 0);

    points.push({
      key: `${year}-Q${q}`,
      label: `Q${q} ${year}`,
      year, quarter: q, index: idx,
      spend: round(boughtThis.reduce((s, u) => s + u.cost, 0)),
      grossRevenue: round(grossRevenue),
      fees: round(fees),
      postage: round(postage),
      postageCollected: round(postageCollected),
      netProceeds: round(netProceeds),
      netProfit: round(netProfit),
      unitsBought: boughtThis.length,
      unitsSold: soldThis.length,
      capitalOnShelf: round(capitalOnShelf),
      unitsOnShelf: onShelf.length,
      turnRate: avgCapital > 0 ? round(netProceeds / avgCapital, 2) : null,
      medianCashCycleDays: cycles.length ? round(median(cycles)!, 1) : null,
      cumulativeProfit: round(cumulative),
    });
  }
  return points;
}

export interface LotCurvePoint {
  /** Days since the lot arrived. */
  day: number;
  /** Share of the lot's cost recovered by then, as a multiple. 1.0 = break-even. */
  recovered: number;
}

export interface LotCurve {
  lotId: string;
  code: string;
  cost: number;
  points: LotCurvePoint[];
  /** Days to cross 1.0×, or null if it never has. */
  breakEvenDay: number | null;
  finalMultiple: number;
}

/**
 * Recovery curve per lot: how much of its own cost each lot had earned back by
 * day N. Plotted together these show rotation directly — a steep early curve is
 * a lot that paid for itself before the next auction, a flat one is money
 * still sitting on a shelf.
 */
export function buildLotCurves(lots: RotationLot[], units: RotationUnit[], now = new Date(), stepDays = 7): LotCurve[] {
  const byLot = new Map<string, RotationUnit[]>();
  for (const u of units) {
    const list = byLot.get(u.lotId);
    if (list) list.push(u); else byLot.set(u.lotId, [u]);
  }

  const curves: LotCurve[] = [];
  for (const lot of lots) {
    const us = byLot.get(lot.id) ?? [];
    if (!lot.receivedAt || lot.cost <= 0 || us.length === 0) continue;

    const sales = us
      .filter((u) => u.soldAt != null)
      .map((u) => ({
        day: Math.max(0, (u.soldAt!.getTime() - lot.receivedAt!.getTime()) / DAY_MS),
        net: (u.salePrice ?? 0) - (u.fees ?? 0) - (u.shippingPaid ?? 0) + (u.shippingCollected ?? 0),
      }))
      .sort((a, b) => a.day - b.day);

    const horizon = Math.max(
      stepDays,
      Math.ceil((now.getTime() - lot.receivedAt.getTime()) / DAY_MS)
    );

    const points: LotCurvePoint[] = [];
    let breakEvenDay: number | null = null;
    let acc = 0;
    let i = 0;
    for (let d = 0; d <= horizon; d += stepDays) {
      while (i < sales.length && sales[i].day <= d) { acc += sales[i].net; i++; }
      const recovered = round(acc / lot.cost, 3);
      if (breakEvenDay == null && recovered >= 1) breakEvenDay = d;
      points.push({ day: d, recovered });
    }
    curves.push({
      lotId: lot.id,
      code: lot.code,
      cost: round(lot.cost),
      points,
      breakEvenDay,
      finalMultiple: points.length ? points[points.length - 1].recovered : 0,
    });
  }
  return curves.sort((a, b) => b.finalMultiple - a.finalMultiple);
}
