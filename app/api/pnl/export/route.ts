import { NextRequest } from "next/server";
import { apiUser, unauthorized } from "@/lib/api";
import { computePnl, parseRange, type PnlGroupBy } from "@/lib/pnl";
import { csvResponse, toCsv } from "@/lib/csv";

const GROUPS: PnlGroupBy[] = ["pallet", "category", "platform", "day", "week", "month"];

export async function GET(req: NextRequest) {
  if (!(await apiUser())) return unauthorized();
  const sp = req.nextUrl.searchParams;
  const { from, to } = parseRange(sp.get("from") ?? undefined, sp.get("to") ?? undefined);
  const groupBy = (GROUPS.includes(sp.get("groupBy") as PnlGroupBy) ? sp.get("groupBy") : "pallet") as PnlGroupBy;
  const report = await computePnl(from, to, groupBy);

  const rows: unknown[][] = report.groups.map((g) => [
    g.key, g.count, g.revenue.toFixed(2), g.cogs.toFixed(2), g.gross.toFixed(2),
    g.marginPct !== null ? g.marginPct.toFixed(1) : "",
  ]);
  rows.push([]);
  rows.push(["TOTAL", report.totals.count, report.totals.revenue.toFixed(2), report.totals.cogs.toFixed(2), report.totals.gross.toFixed(2), report.totals.marginPct?.toFixed(1) ?? ""]);
  rows.push([]);
  rows.push(["Expenses"]);
  for (const e of report.expenses) {
    rows.push([e.date.toISOString().slice(0, 10), "", "", "", `-${e.amount.toFixed(2)}`, `${e.category}: ${e.description}`]);
  }
  rows.push(["Expense total", "", "", "", `-${report.expenseTotal.toFixed(2)}`, ""]);
  rows.push(["NET PROFIT", "", "", "", report.net.toFixed(2), ""]);

  const csv = toCsv([`Group (${groupBy})`, "Items sold", "Revenue", "COGS", "Gross profit", "Margin %"], rows);
  return csvResponse(`pnl-${from.toISOString().slice(0, 10)}-to-${to.toISOString().slice(0, 10)}.csv`, csv);
}
