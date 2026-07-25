// Pure P&L aggregation (no DB or server-only imports, unit-testable).
// lib/pnl.ts fetches rows and delegates the arithmetic here.
import { label } from "./constants";

export type PnlGroupBy = "pallet" | "category" | "platform" | "day" | "week" | "month";

export interface PnlGroup {
  key: string;
  count: number;
  revenue: number;
  cogs: number;
  fees: number;
  shipping: number;
  /** revenue − cogs − fees − shipping */
  netProfit: number;
  netMarginPct: number | null;
}

export type PnlTotals = Omit<PnlGroup, "key">;

/** A sold item flattened into plain numbers — whatever the source. */
export interface PnlSoldRow {
  soldPrice: number | null;
  ourCost: number;
  feesAmount: number | null;
  shippingCost: number | null;
  dateSold: Date | null;
  category: string;
  platform: string | null;
  palletCode: string;
}

export interface PnlExpenseRow {
  id: string;
  date: Date;
  category: string;
  description: string;
  amount: number;
}

export interface PnlReport {
  groups: PnlGroup[];
  totals: PnlTotals;
  expenses: PnlExpenseRow[];
  expenseTotal: number;
  /** net profit after operating expenses — the bottom line */
  net: number;
}

// Bucket in SERVER-LOCAL time to match parseRange and the dashboard's
// "today" — toISOString() would shift late-evening sales into the next day.
export function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function bucketKey(groupBy: PnlGroupBy, item: PnlSoldRow, now = new Date()): string {
  const d = item.dateSold ?? now;
  switch (groupBy) {
    case "pallet":
      return item.palletCode;
    case "category":
      return label(item.category);
    case "platform":
      return item.platform ? label(item.platform) : "Unassigned";
    case "day":
      return localDate(d);
    case "week": {
      const monday = new Date(d);
      monday.setHours(0, 0, 0, 0);
      const day = monday.getDay() === 0 ? 6 : monday.getDay() - 1;
      monday.setDate(monday.getDate() - day);
      return `Week of ${localDate(monday)}`;
    }
    case "month":
      return localDate(d).slice(0, 7);
  }
}

const emptyGroup = (key: string): PnlGroup => ({
  key, count: 0, revenue: 0, cogs: 0, fees: 0, shipping: 0, netProfit: 0, netMarginPct: null,
});

/** Money is summed in cents so repeated float addition can't drift. */
const cents = (n: number) => Math.round(n * 100);
const fromCents = (n: number) => n / 100;

function finalize(g: PnlGroup): PnlGroup {
  g.revenue = fromCents(g.revenue);
  g.cogs = fromCents(g.cogs);
  g.fees = fromCents(g.fees);
  g.shipping = fromCents(g.shipping);
  g.netProfit = Math.round((g.revenue - g.cogs - g.fees - g.shipping) * 100) / 100;
  g.netMarginPct = g.revenue > 0 ? (g.netProfit / g.revenue) * 100 : null;
  return g;
}

/** Groups sold items, sums the money, and nets out operating expenses. */
export function aggregatePnl(
  sold: PnlSoldRow[],
  expenses: PnlExpenseRow[],
  groupBy: PnlGroupBy,
  now = new Date()
): PnlReport {
  const map = new Map<string, PnlGroup>();
  const totals = emptyGroup("TOTAL");

  for (const i of sold) {
    const key = bucketKey(groupBy, i, now);
    const g = map.get(key) ?? emptyGroup(key);
    for (const t of [g, totals]) {
      t.count++;
      t.revenue += cents(i.soldPrice ?? 0);
      t.cogs += cents(i.ourCost);
      t.fees += cents(i.feesAmount ?? 0);
      t.shipping += cents(i.shippingCost ?? 0);
    }
    map.set(key, g);
  }

  const groups = [...map.values()].map(finalize).sort((a, b) =>
    groupBy === "day" || groupBy === "week" || groupBy === "month"
      ? a.key.localeCompare(b.key)
      : b.revenue - a.revenue
  );
  finalize(totals);

  const expenseTotal = fromCents(expenses.reduce((a, e) => a + cents(e.amount), 0));

  return {
    groups,
    totals,
    expenses,
    expenseTotal,
    net: Math.round((totals.netProfit - expenseTotal) * 100) / 100,
  };
}

export function parseRange(fromStr?: string, toStr?: string): { from: Date; to: Date } {
  const to = toStr ? new Date(`${toStr}T23:59:59`) : new Date();
  const from = fromStr
    ? new Date(`${fromStr}T00:00:00`)
    : new Date(new Date().setDate(new Date().getDate() - 30));
  if (!fromStr) from.setHours(0, 0, 0, 0);
  return { from, to };
}
