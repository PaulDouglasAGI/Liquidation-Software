import "server-only";
import { prisma } from "./db";
import { num } from "./serialize";
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

export interface PnlReport {
  groups: PnlGroup[];
  totals: PnlTotals;
  expenses: { id: string; date: Date; category: string; description: string; amount: number }[];
  expenseTotal: number;
  /** net profit after operating expenses — the bottom line */
  net: number;
}

// Bucket in SERVER-LOCAL time to match parseRange and the dashboard's
// "today" — toISOString() would shift late-evening sales into the next day.
function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function bucketKey(groupBy: PnlGroupBy, item: { dateSold: Date | null; palletCode: string; category: string; platform: string | null }): string {
  const d = item.dateSold ?? new Date();
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

export async function computePnl(from: Date, to: Date, groupBy: PnlGroupBy): Promise<PnlReport> {
  const [sold, expenses] = await Promise.all([
    prisma.item.findMany({
      where: { status: "SOLD", dateSold: { gte: from, lte: to } },
      select: {
        soldPrice: true,
        ourCost: true,
        feesAmount: true,
        shippingCost: true,
        dateSold: true,
        category: true,
        platform: true,
        pallet: { select: { palletCode: true } },
      },
    }),
    prisma.expense.findMany({ where: { date: { gte: from, lte: to } }, orderBy: { date: "desc" } }),
  ]);

  const emptyGroup = (key: string): PnlGroup => ({
    key, count: 0, revenue: 0, cogs: 0, fees: 0, shipping: 0, netProfit: 0, netMarginPct: null,
  });
  const map = new Map<string, PnlGroup>();
  const totals = emptyGroup("TOTAL");
  for (const i of sold) {
    const key = bucketKey(groupBy, {
      dateSold: i.dateSold,
      palletCode: i.pallet.palletCode,
      category: i.category,
      platform: i.platform,
    });
    const g = map.get(key) ?? emptyGroup(key);
    for (const t of [g, totals]) {
      t.count++;
      t.revenue += num(i.soldPrice) ?? 0;
      t.cogs += i.ourCost.toNumber();
      t.fees += num(i.feesAmount) ?? 0;
      t.shipping += num(i.shippingCost) ?? 0;
      t.netProfit = t.revenue - t.cogs - t.fees - t.shipping;
      t.netMarginPct = t.revenue > 0 ? (t.netProfit / t.revenue) * 100 : null;
    }
    map.set(key, g);
  }
  const groups = [...map.values()].sort((a, b) =>
    groupBy === "day" || groupBy === "week" || groupBy === "month"
      ? a.key.localeCompare(b.key)
      : b.revenue - a.revenue
  );

  const expenseRows = expenses.map((e) => ({
    id: e.id,
    date: e.date,
    category: e.category,
    description: e.description,
    amount: e.amount.toNumber(),
  }));
  const expenseTotal = expenseRows.reduce((a, e) => a + e.amount, 0);

  return {
    groups,
    totals,
    expenses: expenseRows,
    expenseTotal,
    net: totals.netProfit - expenseTotal,
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
