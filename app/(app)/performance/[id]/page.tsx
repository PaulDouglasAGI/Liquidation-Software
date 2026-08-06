import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { lotPerformanceById } from "@/lib/lotPerformance";
import { money, pct } from "@/lib/format";
import { label } from "@/lib/constants";
import { Stat, panelCls, thCls, tdCls, monoCls } from "@/components/ui";
import LaborLog from "@/components/LaborLog";

export const dynamic = "force-dynamic";

export default async function LotPerformancePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const data = await lotPerformanceById(id);
  if (!data) notFound();
  const { performance: p, labor } = data;

  const at = (n: number) => p.sellThroughPct.find((s) => s.days === n);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-semibold text-zinc-100">
            <span className={monoCls + " text-accent"}>{p.code}</span>{" "}
            <span className="text-zinc-400">— {p.source}</span>
            {p.sourceLotId ? <span className="text-muted"> · lot {p.sourceLotId}</span> : null}
          </h1>
          <div className="text-[12px] text-muted">
            {label(p.category)} · {label(p.conditionGrade)} · {label(p.status)}
          </div>
        </div>
        <div className="flex gap-3 text-[13px]">
          <Link href="/performance" className="text-accent hover:underline">← All lots</Link>
          <Link href={`/pallets/${p.id}`} className="text-accent hover:underline">Edit lot →</Link>
        </div>
      </div>

      {/* The five metrics, up top. */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Stat
          label="Profit / labor hour"
          value={p.profitPerHour === null ? "—" : money(p.profitPerHour)}
          sub={p.hours === 0 ? "log hours to see this" : `${money(p.profit)} ÷ ${p.hours}h`}
          tone={p.profitPerHour === null ? undefined : p.profitPerHour >= 0 ? "accent" : "danger"}
        />
        <Stat
          label="Dud rate"
          value={pct(p.dudRatePct, 0)}
          sub={`${p.duds} of ${p.units} units`}
          tone={p.dudRatePct !== null && p.dudRatePct > 25 ? "danger" : undefined}
        />
        <Stat
          label="Sell-through 30d"
          value={pct(at(30)?.pct ?? null, 0)}
          sub={`60d ${pct(at(60)?.pct ?? null, 0)} · 90d ${pct(at(90)?.pct ?? null, 0)}`}
        />
        <Stat
          label="Pickup → first listing"
          value={p.daysToFirstListing === null ? "—" : `${p.daysToFirstListing.toFixed(1)}d`}
          sub={p.daysToFirstListing === null ? "nothing listed yet" : undefined}
        />
        <Stat
          label="Estimate accuracy"
          value={p.estimateAccuracy === null ? "—" : `${p.estimateAccuracy.toFixed(2)}×`}
          sub={
            p.preBidEstimatedRecovery === null
              ? "no pre-bid estimate"
              : `${money(p.revenue)} vs ${money(p.preBidEstimatedRecovery)}`
          }
          tone={p.estimateAccuracy !== null && p.estimateAccuracy < 0.9 ? "danger" : undefined}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Money — lot level, always. */}
        <div className={panelCls + " p-3"}>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Lot P&amp;L
          </div>
          <dl className="space-y-1 text-[13px]">
            {[
              ["Purchase price", money(p.purchasePrice)],
              ["Fees (premium, tax)", money(p.fees)],
              ["Total cost", money(p.totalCost)],
              ["Revenue to date", money(p.revenue)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-edge/60 py-1">
                <dt className="text-zinc-400">{k}</dt>
                <dd className={monoCls}>{v}</dd>
              </div>
            ))}
            <div className="flex justify-between py-1">
              <dt className="font-semibold text-zinc-200">Profit</dt>
              <dd className={`${monoCls} text-[15px] font-semibold ${p.profit >= 0 ? "text-ok" : "text-danger"}`}>
                {money(p.profit)}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-[11px] text-muted">
            Cost stays whole. It is not divided across the {p.units} unit{p.units === 1 ? "" : "s"} —
            manifest retail is not reliable enough to allocate from.
          </p>
        </div>

        {/* Where the recovery came from. */}
        <div className={panelCls + " p-3"}>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Recovery by value class
          </div>
          {p.revenue === 0 ? (
            <p className="text-[13px] text-muted">Nothing sold yet.</p>
          ) : (
            <>
              <dl className="space-y-1 text-[13px]">
                <div className="flex justify-between border-b border-edge/60 py-1">
                  <dt className="text-zinc-400">Floor (reliable sellers)</dt>
                  <dd className={monoCls}>{money(p.floorRecovery)}</dd>
                </div>
                <div className="flex justify-between border-b border-edge/60 py-1">
                  <dt className="text-zinc-400">Speculative</dt>
                  <dd className={monoCls}>{money(p.speculativeRecovery)}</dd>
                </div>
                {p.unclassifiedRecovery > 0 ? (
                  <div className="flex justify-between border-b border-edge/60 py-1">
                    <dt className="text-muted">Untagged</dt>
                    <dd className={monoCls + " text-muted"}>{money(p.unclassifiedRecovery)}</dd>
                  </div>
                ) : null}
              </dl>
              <p className="mt-2 text-[11px] text-muted">
                {pct(p.floorRecoveryPct, 0)} of recovery came from floor stock. That is the rate to
                bid against; speculative recovery is upside, not budget.
              </p>
            </>
          )}
          {p.unitShortfall !== null && p.unitShortfall !== 0 ? (
            <p className={`mt-2 text-[12px] ${p.unitShortfall > 0 ? "text-danger" : "text-ok"}`}>
              {p.unitShortfall > 0
                ? `${p.unitShortfall} unit(s) short of the manifest.`
                : `${-p.unitShortfall} unit(s) more than the manifest promised.`}
            </p>
          ) : null}
        </div>

        {/* Duds. */}
        <div className={panelCls}>
          <div className="border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Duds by reason
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className={thCls}>Reason</th>
                <th className={thCls + " text-right"}>Units</th>
                <th className={thCls + " text-right"}>Of all duds</th>
              </tr>
            </thead>
            <tbody>
              {p.dudsByReason.map((d) => (
                <tr key={d.reason}>
                  <td className={tdCls}>{label(d.reason)}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{d.count}</td>
                  <td className={`${tdCls} ${monoCls} text-right text-muted`}>
                    {pct(p.duds ? (d.count / p.duds) * 100 : null, 0)}
                  </td>
                </tr>
              ))}
              {p.dudsByReason.length === 0 ? (
                <tr>
                  <td className={tdCls + " text-muted"} colSpan={3}>
                    No duds tagged. Mark them from Inventory as you test.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* Hours by activity. */}
        <div className={panelCls}>
          <div className="border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Where the hours went
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className={thCls}>Activity</th>
                <th className={thCls + " text-right"}>Hours</th>
                <th className={thCls + " text-right"}>Share</th>
              </tr>
            </thead>
            <tbody>
              {p.hoursByActivity.map((a) => (
                <tr key={a.activity}>
                  <td className={tdCls}>{label(a.activity)}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{a.hours}</td>
                  <td className={`${tdCls} ${monoCls} text-right text-muted`}>
                    {pct(p.hours ? (a.hours / p.hours) * 100 : null, 0)}
                  </td>
                </tr>
              ))}
              {p.hoursByActivity.length === 0 ? (
                <tr><td className={tdCls + " text-muted"} colSpan={3}>No hours logged yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Who did the work. */}
      {p.hoursByUser.length > 0 ? (
        <div className={panelCls + " p-3"}>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Hours by person
          </div>
          <div className="flex flex-wrap gap-2">
            {p.hoursByUser.map((u) => (
              <span key={u.userName} className="border border-edge bg-raised px-2 py-1 text-[13px]">
                {u.userName} <span className={monoCls + " text-accent"}>{u.hours}h</span>{" "}
                <span className="text-muted">({u.entries})</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <LaborLog palletId={p.id} palletCode={p.code} entries={labor} currentUser={user.name} isOwner={user.role === "OWNER"} />

      <p className="text-[11px] text-muted">
        Sell-through counts sales within 30/60/90 days of pickup, measured against the{" "}
        {p.nonDudUnits} sellable unit{p.nonDudUnits === 1 ? "" : "s"} of {p.units} — duds are left out
        of the denominator so a broken lot cannot read as merely slow.
      </p>
    </div>
  );
}
