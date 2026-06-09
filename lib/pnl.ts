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
  gross: number;
  marginPct: number | null;
}

export interface PnlReport {
  groups: PnlGroup[];
  totals: { count: number; revenue: number; cogs: number; gross: number; marginPct: number | null };
  expenses: { id: string; date: Date; category: string; description: string; amount: number }[];
  expenseTotal: number;
  net: number;
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
      return d.toISOString().slice(0, 10);
    case "week": {
      const monday = new Date(d);
      const day = monday.getDay() === 0 ? 6 : monday.getDay() - 1;
      monday.setDate(monday.getDate() - day);
      return `Week of ${monday.toISOString().slice(0, 10)}`;
    }
    case "month":
      return d.toISOString().slice(0, 7);
  }
}

export async function computePnl(from: Date, to: Date, groupBy: PnlGroupBy): Promise<PnlReport> {
  const [sold, expenses] = await Promise.all([
    prisma.item.findMany({
      where: { status: "SOLD", dateSold: { gte: from, lte: to } },
      select: {
        soldPrice: true,
        ourCost: true,
        dateSold: true,
        category: true,
        platform: true,
        pallet: { select: { palletCode: true } },
      },
    }),
    prisma.expense.findMany({ where: { date: { gte: from, lte: to } }, orderBy: { date: "desc" } }),
  ]);

  const map = new Map<string, PnlGroup>();
  let revenue = 0;
  let cogs = 0;
  for (const i of sold) {
    const key = bucketKey(groupBy, {
      dateSold: i.dateSold,
      palletCode: i.pallet.palletCode,
      category: i.category,
      platform: i.platform,
    });
    const g = map.get(key) ?? { key, count: 0, revenue: 0, cogs: 0, gross: 0, marginPct: null };
    const r = num(i.soldPrice) ?? 0;
    const c = i.ourCost.toNumber();
    g.count++;
    g.revenue += r;
    g.cogs += c;
    g.gross = g.revenue - g.cogs;
    map.set(key, g);
    revenue += r;
    cogs += c;
  }
  const groups = [...map.values()]
    .map((g) => ({ ...g, marginPct: g.revenue > 0 ? (g.gross / g.revenue) * 100 : null }))
    .sort((a, b) => (groupBy === "day" || groupBy === "week" || groupBy === "month" ? a.key.localeCompare(b.key) : b.revenue - a.revenue));

  const expenseRows = expenses.map((e) => ({
    id: e.id,
    date: e.date,
    category: e.category,
    description: e.description,
    amount: e.amount.toNumber(),
  }));
  const expenseTotal = expenseRows.reduce((a, e) => a + e.amount, 0);
  const gross = revenue - cogs;

  return {
    groups,
    totals: { count: sold.length, revenue, cogs, gross, marginPct: revenue > 0 ? (gross / revenue) * 100 : null },
    expenses: expenseRows,
    expenseTotal,
    net: gross - expenseTotal,
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
