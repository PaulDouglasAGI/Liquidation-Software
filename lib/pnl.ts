import "server-only";
import { prisma } from "./db";
import { num } from "./serialize";
import { aggregatePnl } from "./pnlMath";
import type { PnlGroupBy, PnlReport } from "./pnlMath";

// Types and the arithmetic itself live in ./pnlMath (pure + unit-tested);
// this module only fetches rows and flattens Prisma Decimals into numbers.
export type { PnlGroupBy, PnlGroup, PnlTotals, PnlReport, PnlSoldRow, PnlExpenseRow } from "./pnlMath";
export { parseRange } from "./pnlMath";

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

  return aggregatePnl(
    sold.map((i) => ({
      soldPrice: num(i.soldPrice),
      ourCost: i.ourCost.toNumber(),
      feesAmount: num(i.feesAmount),
      shippingCost: num(i.shippingCost),
      dateSold: i.dateSold,
      category: i.category as string,
      platform: i.platform as string | null,
      palletCode: i.pallet.palletCode,
    })),
    expenses.map((e) => ({
      id: e.id,
      date: e.date,
      category: e.category,
      description: e.description,
      amount: e.amount.toNumber(),
    })),
    groupBy
  );
}
