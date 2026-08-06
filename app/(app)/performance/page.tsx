import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { lotInsights, lotPerformance } from "@/lib/lotPerformance";
import { money, pct } from "@/lib/format";
import { label } from "@/lib/constants";
import { Stat, panelCls, thCls, tdCls, monoCls } from "@/components/ui";

export const dynamic = "force-dynamic";

const hrs = (n: number) => (n === 0 ? "—" : `${n.toFixed(n % 1 ? 1 : 0)}h`);

/** The master metric, coloured, because it is the one people should read first. */
function ProfitPerHour({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-muted" title="No hours logged against this lot yet">— </span>;
  }
  const tone = value >= 25 ? "text-ok" : value >= 0 ? "text-amber-400" : "text-danger";
  return <span className={`font-mono text-[15px] font-semibold ${tone}`}>{money(value)}</span>;
}

export default async function PerformancePage() {
  await requireUser();
  const [rows, ins] = await Promise.all([lotPerformance(), lotInsights()]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-base font-semibold text-zinc-100">Lot Performance</h1>
        <Link href="/performance/insights" className="text-[13px] text-accent hover:underline">
          What should we buy next? →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat
          label="Profit / labor hour"
          value={ins.profitPerHour === null ? "—" : money(ins.profitPerHour)}
          sub={`${ins.hours.toFixed(1)}h across ${ins.lots} lot${ins.lots === 1 ? "" : "s"}`}
          tone={ins.profitPerHour !== null && ins.profitPerHour < 0 ? "danger" : "accent"}
        />
        <Stat label="Profit to date" value={money(ins.profit)} sub={`${money(ins.revenue)} in, ${money(ins.totalCost)} out`} tone={ins.profit >= 0 ? "ok" : "danger"} />
        <Stat
          label="Pickup → first listing"
          value={ins.processing.recentAvg === null ? "—" : `${ins.processing.recentAvg.toFixed(1)}d`}
          sub={
            ins.processing.changeDays === null
              ? "last 5 lots"
              : `${ins.processing.changeDays >= 0 ? "+" : ""}${ins.processing.changeDays.toFixed(1)}d vs before`
          }
          tone={ins.processing.alarm ? "danger" : undefined}
        />
        <Stat
          label="Estimate accuracy"
          value={ins.avgEstimateAccuracy === null ? "—" : `${ins.avgEstimateAccuracy.toFixed(2)}×`}
          sub={ins.avgEstimateAccuracy === null ? "no estimates recorded" : "actual ÷ pre-bid"}
          tone={ins.avgEstimateAccuracy !== null && ins.avgEstimateAccuracy < 0.9 ? "danger" : undefined}
        />
      </div>

      {ins.processing.alarm ? (
        <div className="border border-danger/60 bg-danger/10 px-3 py-2 text-[13px] text-danger">
          <strong>Processing is slipping.</strong> Lots are taking{" "}
          {ins.processing.recentAvg?.toFixed(1)}d to reach a first listing, up from{" "}
          {ins.processing.priorAvg?.toFixed(1)}d. You are buying faster than you can process — clear
          the backlog before the next pickup.
        </div>
      ) : null}

      {ins.lotsMissingHours > 0 ? (
        <div className="border border-edge bg-raised px-3 py-2 text-[12px] text-muted">
          {ins.lotsMissingHours} lot{ins.lotsMissingHours === 1 ? " has" : "s have"} no hours logged, so
          profit-per-hour is blank for {ins.lotsMissingHours === 1 ? "it" : "them"}. Use the{" "}
          <strong className="text-zinc-300">Log hours</strong> button, bottom right.
        </div>
      ) : null}

      <div className={panelCls + " overflow-x-auto"}>
        <table className="w-full min-w-[900px] text-[13px]">
          <thead>
            <tr>
              <th className={thCls}>Lot</th>
              <th className={thCls}>Source</th>
              <th className={thCls}>Grade</th>
              <th className={thCls + " text-right"}>Cost</th>
              <th className={thCls + " text-right"}>Revenue</th>
              <th className={thCls + " text-right"}>Profit</th>
              <th className={thCls + " text-right"}>Hours</th>
              <th className={thCls + " text-right bg-raised/60 text-accent"}>Profit / hr</th>
              <th className={thCls + " text-right"}>Sell-thru 30d</th>
              <th className={thCls + " text-right"}>Duds</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-raised/60">
                <td className={tdCls}>
                  <Link href={`/performance/${r.id}`} className={`${monoCls} text-accent hover:underline`}>
                    {r.code}
                  </Link>
                </td>
                <td className={tdCls + " text-zinc-400"}>{r.source}</td>
                <td className={tdCls + " text-zinc-400"}>{label(r.conditionGrade)}</td>
                <td className={`${tdCls} ${monoCls} text-right`}>{money(r.totalCost)}</td>
                <td className={`${tdCls} ${monoCls} text-right`}>{money(r.revenue)}</td>
                <td className={`${tdCls} ${monoCls} text-right ${r.profit >= 0 ? "text-ok" : "text-danger"}`}>
                  {money(r.profit)}
                </td>
                <td className={`${tdCls} ${monoCls} text-right text-zinc-400`}>{hrs(r.hours)}</td>
                <td className={`${tdCls} text-right bg-raised/40`}>
                  <ProfitPerHour value={r.profitPerHour} />
                </td>
                <td className={`${tdCls} ${monoCls} text-right`}>
                  {pct(r.sellThroughPct.find((s) => s.days === 30)?.pct ?? null, 0)}
                </td>
                <td className={`${tdCls} ${monoCls} text-right`}>
                  {r.units === 0 ? "—" : `${r.duds}/${r.units}`}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className={tdCls + " text-muted"} colSpan={10}>
                  No lots yet. Create one on the Pallets page — record a pre-bid estimate before you
                  bid and every metric here starts working.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted">
        Profit is revenue against the whole lot cost. Lot cost is never split across units — manifest
        retail is too unreliable to allocate from, so any per-unit margin would be invented.
      </p>
    </div>
  );
}
