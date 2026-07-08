import { requireUser } from "@/lib/auth";
import { computePnl, parseRange, type PnlGroupBy } from "@/lib/pnl";
import { money, pct, dateStr } from "@/lib/format";
import { Stat, panelCls, thCls, tdCls, monoCls } from "@/components/ui";
import PnlControls from "@/components/PnlControls";
import ExpenseForm, { DeleteExpenseButton } from "@/components/ExpenseForm";

export const dynamic = "force-dynamic";

const GROUPS: PnlGroupBy[] = ["pallet", "category", "platform", "day", "week", "month"];

export default async function PnlPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; groupBy?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const { from, to } = parseRange(sp.from, sp.to);
  const groupBy = (GROUPS.includes(sp.groupBy as PnlGroupBy) ? sp.groupBy : "pallet") as PnlGroupBy;
  const report = await computePnl(from, to, groupBy);

  return (
    <div className="space-y-3">
      <h1 className="text-base font-semibold text-zinc-100">Profit &amp; Loss</h1>
      <PnlControls from={from.toISOString().slice(0, 10)} to={to.toISOString().slice(0, 10)} groupBy={groupBy} />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
        <Stat label="Items sold" value={String(report.totals.count)} />
        <Stat label="Revenue" value={money(report.totals.revenue)} tone="ok" />
        <Stat label="COGS" value={money(report.totals.cogs)} />
        <Stat label="Platform fees" value={money(report.totals.fees)} tone={report.totals.fees > 0 ? "danger" : undefined} />
        <Stat label="Shipping" value={money(report.totals.shipping)} tone={report.totals.shipping > 0 ? "danger" : undefined} />
        <Stat label="Expenses" value={money(report.expenseTotal)} tone={report.expenseTotal > 0 ? "danger" : undefined} />
        <Stat label="Net profit" value={money(report.net)} sub={report.totals.netMarginPct !== null ? `net margin ${pct(report.totals.netMarginPct)}` : undefined} tone={report.net >= 0 ? "ok" : "danger"} />
      </div>

      <div className={panelCls}>
        <div className="border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
          By {groupBy} — {dateStr(from)} to {dateStr(to)}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className={thCls}>{groupBy}</th>
                <th className={thCls + " text-right"}>Items sold</th>
                <th className={thCls + " text-right"}>Revenue</th>
                <th className={thCls + " text-right"}>COGS</th>
                <th className={thCls + " text-right"}>Fees</th>
                <th className={thCls + " text-right"}>Shipping</th>
                <th className={thCls + " text-right"}>Net profit</th>
                <th className={thCls + " text-right"}>Net margin %</th>
              </tr>
            </thead>
            <tbody>
              {report.groups.map((g) => (
                <tr key={g.key} className="hover:bg-raised/60">
                  <td className={tdCls}>{g.key}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{g.count}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{money(g.revenue)}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{money(g.cogs)}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{money(g.fees)}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{money(g.shipping)}</td>
                  <td className={`${tdCls} ${monoCls} text-right ${g.netProfit >= 0 ? "text-ok" : "text-danger"}`}>{money(g.netProfit)}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{pct(g.netMarginPct)}</td>
                </tr>
              ))}
              {report.groups.length === 0 ? (
                <tr><td className={tdCls + " text-muted"} colSpan={8}>No sales in this period.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className={panelCls}>
        <div className="border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Operating expenses in period</div>
        <div className="p-3">
          <ExpenseForm />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className={thCls}>Date</th>
                <th className={thCls}>Category</th>
                <th className={thCls}>Description</th>
                <th className={thCls + " text-right"}>Amount</th>
                <th className={thCls + " w-8"} />
              </tr>
            </thead>
            <tbody>
              {report.expenses.map((e) => (
                <tr key={e.id} className="hover:bg-raised/60">
                  <td className={tdCls}>{dateStr(e.date)}</td>
                  <td className={tdCls}>{e.category}</td>
                  <td className={tdCls}>{e.description}</td>
                  <td className={`${tdCls} ${monoCls} text-right text-danger`}>−{money(e.amount)}</td>
                  <td className={tdCls}><DeleteExpenseButton id={e.id} /></td>
                </tr>
              ))}
              {report.expenses.length === 0 ? (
                <tr><td className={tdCls + " text-muted"} colSpan={5}>No expenses recorded in this period.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
