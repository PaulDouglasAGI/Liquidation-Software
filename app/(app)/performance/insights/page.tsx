import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { hoursByUser, lotInsights } from "@/lib/lotPerformance";
import { accuracyNote, type GroupPerformance } from "@/lib/lotPerformanceMath";
import { money, pct, dateStr } from "@/lib/format";
import { label } from "@/lib/constants";
import { Stat, panelCls, thCls, tdCls, monoCls } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Shared shape for the two "what should we buy" tables. */
function GroupTable({ title, blurb, rows }: { title: string; blurb: string; rows: GroupPerformance[] }) {
  return (
    <div className={panelCls}>
      <div className="border-b border-edge px-3 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</div>
        <div className="text-[11px] text-muted">{blurb}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-[13px]">
          <thead>
            <tr>
              <th className={thCls}></th>
              <th className={thCls + " text-right"}>Lots</th>
              <th className={thCls + " text-right"}>Hours</th>
              <th className={thCls + " text-right"}>Profit</th>
              <th className={thCls + " text-right bg-raised/60 text-accent"}>Profit / hr</th>
              <th className={thCls + " text-right"}>Dud rate</th>
              <th className={thCls + " text-right"}>Est. acc.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="hover:bg-raised/60">
                <td className={tdCls}>{label(r.key)}</td>
                <td className={`${tdCls} ${monoCls} text-right text-muted`}>{r.lots}</td>
                <td className={`${tdCls} ${monoCls} text-right text-muted`}>{r.hours || "—"}</td>
                <td className={`${tdCls} ${monoCls} text-right ${r.profit >= 0 ? "text-ok" : "text-danger"}`}>
                  {money(r.profit)}
                </td>
                <td className={`${tdCls} text-right bg-raised/40`}>
                  {r.profitPerHour === null ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <span
                      className={`font-mono text-[15px] font-semibold ${
                        r.profitPerHour >= 25 ? "text-ok" : r.profitPerHour >= 0 ? "text-amber-400" : "text-danger"
                      }`}
                    >
                      {money(r.profitPerHour)}
                    </span>
                  )}
                </td>
                <td className={`${tdCls} ${monoCls} text-right`}>{pct(r.dudRatePct, 0)}</td>
                <td className={`${tdCls} ${monoCls} text-right text-muted`}>
                  {r.avgEstimateAccuracy === null ? "—" : `${r.avgEstimateAccuracy.toFixed(2)}×`}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td className={tdCls + " text-muted"} colSpan={7}>Nothing to compare yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function LotInsightsPage() {
  await requireUser();
  const [ins, people] = await Promise.all([lotInsights(), hoursByUser()]);

  const ranked = ins.byCategory.filter((c) => c.profitPerHour !== null);
  const best = ranked[0];
  const worst = ranked.length > 1 ? ranked[ranked.length - 1] : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-base font-semibold text-zinc-100">What should we buy next?</h1>
        <Link href="/performance" className="text-[13px] text-accent hover:underline">← All lots</Link>
      </div>

      {best ? (
        <div className="border border-accent/50 bg-accent/5 px-3 py-2 text-[13px] text-zinc-200">
          <strong className="text-accent">{label(best.key)}</strong> lots return{" "}
          <strong className="font-mono">{money(best.profitPerHour)}</strong> per labor hour across{" "}
          {best.lots} lot{best.lots === 1 ? "" : "s"}
          {worst && worst.profitPerHour !== best.profitPerHour ? (
            <>
              {" "}— against <strong>{money(worst.profitPerHour)}</strong> for {label(worst.key)}.
            </>
          ) : (
            "."
          )}{" "}
          {ranked.length < 2 ? (
            <span className="text-muted">
              Only one category has hours logged, so there is nothing to compare against yet.
            </span>
          ) : null}
        </div>
      ) : (
        <div className="border border-edge bg-raised px-3 py-2 text-[13px] text-muted">
          No lot has both hours and a sale yet, so profit-per-hour has nothing to rank. Log hours as
          you work and this fills in on its own.
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat
          label="Profit / labor hour"
          value={ins.profitPerHour === null ? "—" : money(ins.profitPerHour)}
          sub="whole business"
          tone={ins.profitPerHour !== null && ins.profitPerHour < 0 ? "danger" : "accent"}
        />
        <Stat label="Hours logged" value={`${ins.hours}`} sub={`${ins.lots} lots`} />
        <Stat
          label="Recovery from floor stock"
          value={pct(ins.floorRecoveryPct, 0)}
          sub="the rate worth bidding against"
        />
        <Stat
          label="Estimate accuracy"
          value={ins.avgEstimateAccuracy === null ? "—" : `${ins.avgEstimateAccuracy.toFixed(2)}×`}
          tone={ins.avgEstimateAccuracy !== null && ins.avgEstimateAccuracy < 0.9 ? "danger" : undefined}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <GroupTable
          title="By lot category"
          blurb="200-unit lighting pallets or 40-unit tool lots? This is the answer."
          rows={ins.byCategory}
        />
        <GroupTable
          title="By condition grade"
          blurb="What customer-returns lots really cost you in labor."
          rows={ins.byConditionGrade}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className={panelCls}>
          <div className="border-b border-edge px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Dud rate by unit category
            </div>
            <div className="text-[11px] text-muted">
              By the unit&apos;s own category, since lots arrive mixed.
            </div>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className={thCls}>Category</th>
                <th className={thCls + " text-right"}>Units</th>
                <th className={thCls + " text-right"}>Duds</th>
                <th className={thCls + " text-right"}>Rate</th>
              </tr>
            </thead>
            <tbody>
              {ins.dudRateByUnitCategory.map((r) => (
                <tr key={r.key} className="hover:bg-raised/60">
                  <td className={tdCls}>{label(r.key)}</td>
                  <td className={`${tdCls} ${monoCls} text-right text-muted`}>{r.units}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{r.duds}</td>
                  <td className={`${tdCls} ${monoCls} text-right ${r.dudRatePct > 25 ? "text-danger" : ""}`}>
                    {pct(r.dudRatePct, 0)}
                  </td>
                </tr>
              ))}
              {ins.dudRateByUnitCategory.length === 0 ? (
                <tr><td className={tdCls + " text-muted"} colSpan={4}>No units yet.</td></tr>
              ) : null}
            </tbody>
          </table>
          {ins.dudsByReason.length > 0 ? (
            <div className="border-t border-edge px-3 py-2">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
                Why they were duds
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ins.dudsByReason.map((d) => (
                  <span key={d.reason} className="border border-edge bg-raised px-2 py-1 text-[12px]">
                    {label(d.reason)} <span className={monoCls + " text-zinc-300"}>{d.count}</span>{" "}
                    <span className="text-muted">{pct(d.pct, 0)}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className={panelCls}>
          <div className="border-b border-edge px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Estimate accuracy over time
            </div>
            <div className="text-[11px] text-muted">{accuracyNote(ins.avgEstimateAccuracy, ins.accuracyTrend.length)}</div>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className={thCls}>Lot</th>
                <th className={thCls}>Picked up</th>
                <th className={thCls + " text-right"}>Actual ÷ estimate</th>
                <th className={thCls}></th>
              </tr>
            </thead>
            <tbody>
              {ins.accuracyTrend.map((p) => (
                <tr key={p.id} className="hover:bg-raised/60">
                  <td className={tdCls}>
                    <Link href={`/performance/${p.id}`} className={`${monoCls} text-accent hover:underline`}>
                      {p.code}
                    </Link>
                  </td>
                  <td className={tdCls + " whitespace-nowrap text-zinc-400"}>{dateStr(p.date)}</td>
                  <td className={`${tdCls} ${monoCls} text-right ${p.accuracy < 0.9 ? "text-danger" : p.accuracy > 1.1 ? "text-ok" : ""}`}>
                    {p.accuracy.toFixed(2)}×
                  </td>
                  <td className={tdCls + " w-1/3"}>
                    {/* A bar rather than a chart library: same information, no
                        dependency, and it reads fine on a phone. */}
                    <div className="h-1.5 w-full bg-raised">
                      <div
                        className={`h-1.5 ${p.accuracy < 0.9 ? "bg-danger" : p.accuracy > 1.1 ? "bg-ok" : "bg-accent"}`}
                        style={{ width: `${Math.min(p.accuracy / 2, 1) * 100}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {ins.accuracyTrend.length === 0 ? (
                <tr>
                  <td className={tdCls + " text-muted"} colSpan={4}>
                    No lot has a pre-bid estimate and a sale yet.
                    {ins.lotsMissingEstimate > 0
                      ? ` ${ins.lotsMissingEstimate} lot(s) have no estimate recorded.`
                      : ""}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {people.length > 0 ? (
        <div className={panelCls + " p-3"}>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Hours by person — all lots
          </div>
          <div className="flex flex-wrap gap-2">
            {people.map((u) => (
              <span key={u.userName} className="border border-edge bg-raised px-2 py-1 text-[13px]">
                {u.userName} <span className={monoCls + " text-accent"}>{u.hours}h</span>{" "}
                <span className="text-muted">({u.entries} entries)</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <p className="text-[11px] text-muted">
        Group profit-per-hour pools the profit and the hours of every lot in the group rather than
        averaging each lot&apos;s ratio — a 40-hour lot should not carry the same weight as a 2-hour
        one. Lot cost is never allocated to units.
      </p>
    </div>
  );
}
