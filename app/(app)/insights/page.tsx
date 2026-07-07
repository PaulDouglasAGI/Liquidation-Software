import { requireUser } from "@/lib/auth";
import { computeInsights } from "@/lib/insights";
import { money, pct } from "@/lib/format";
import { label } from "@/lib/constants";
import { Stat, panelCls, thCls, tdCls, monoCls } from "@/components/ui";
import RepriceSuggestions from "@/components/RepriceSuggestions";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  await requireUser();
  const ins = await computeInsights();

  const days = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}d`);
  const mult = (n: number | null) => (n === null ? "—" : `${n.toFixed(2)}×`);

  return (
    <div className="space-y-3">
      <h1 className="text-base font-semibold text-zinc-100">Insights</h1>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Avg days to sell" value={days(ins.overall.avgDaysToSell)} sub={`${ins.overall.soldCount} sales`} />
        <Stat label="Avg recovery (% of MSRP)" value={pct(ins.overall.avgRecoveryPct, 0)} />
        <Stat label="Avg sale/cost ratio" value={mult(ins.overall.avgMultiple)} tone="ok" />
        <Stat label="Return rate" value={pct(ins.returnRate)} tone={ins.returnRate !== null && ins.returnRate > 10 ? "danger" : undefined} />
      </div>

      <RepriceSuggestions suggestions={ins.suggestions} agingDays={ins.agingDays} />

      <div className="grid gap-3 lg:grid-cols-2">
        <div className={panelCls}>
          <div className="border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Performance by category
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className={thCls}>Category</th>
                <th className={thCls + " text-right"}>Sold</th>
                <th className={thCls + " text-right"}>Days to sell</th>
                <th className={thCls + " text-right"}>% of MSRP</th>
                <th className={thCls + " text-right"}>Sale/cost</th>
              </tr>
            </thead>
            <tbody>
              {ins.byCategory.map((r) => (
                <tr key={r.key} className="hover:bg-raised/60">
                  <td className={tdCls}>{label(r.key)}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{r.soldCount}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{days(r.avgDaysToSell)}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{pct(r.avgRecoveryPct, 0)}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{mult(r.avgMultiple)}</td>
                </tr>
              ))}
              {ins.byCategory.length === 0 ? <tr><td className={tdCls + " text-muted"} colSpan={5}>No sales yet.</td></tr> : null}
            </tbody>
          </table>
        </div>

        <div className={panelCls}>
          <div className="border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Performance by brand (2+ sales)
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className={thCls}>Brand</th>
                <th className={thCls + " text-right"}>Sold</th>
                <th className={thCls + " text-right"}>Days to sell</th>
                <th className={thCls + " text-right"}>% of MSRP</th>
                <th className={thCls + " text-right"}>Sale/cost</th>
              </tr>
            </thead>
            <tbody>
              {ins.byBrand.map((r) => (
                <tr key={r.key} className="hover:bg-raised/60">
                  <td className={tdCls}>{r.key}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{r.soldCount}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{days(r.avgDaysToSell)}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{pct(r.avgRecoveryPct, 0)}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{mult(r.avgMultiple)}</td>
                </tr>
              ))}
              {ins.byBrand.length === 0 ? <tr><td className={tdCls + " text-muted"} colSpan={5}>Need 2+ sales of a brand.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className={panelCls}>
        <div className="border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
          Monthly trend — last 6 months
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              <th className={thCls}>Month</th>
              <th className={thCls + " text-right"}>Items sold</th>
              <th className={thCls + " text-right"}>Revenue</th>
              <th className={thCls + " text-right"}>COGS</th>
              <th className={thCls + " text-right"}>Profit</th>
            </tr>
          </thead>
          <tbody>
            {ins.months.map((m) => (
              <tr key={m.month} className="hover:bg-raised/60">
                <td className={tdCls}>{m.month}</td>
                <td className={`${tdCls} ${monoCls} text-right`}>{m.itemsSold}</td>
                <td className={`${tdCls} ${monoCls} text-right`}>{money(m.revenue)}</td>
                <td className={`${tdCls} ${monoCls} text-right`}>{money(m.cogs)}</td>
                <td className={`${tdCls} ${monoCls} text-right ${m.profit >= 0 ? "text-ok" : "text-danger"}`}>{money(m.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
