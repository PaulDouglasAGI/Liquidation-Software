import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { panelCls, thCls, tdCls, monoCls, Stat } from "@/components/ui";
import { throughputByDay, throughputByPerson, throughputSummary, WORK_KINDS } from "@/lib/throughputMath";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 14;

export default async function TeamPage() {
  await requireUser();

  const since = new Date();
  since.setDate(since.getDate() - WINDOW_DAYS);
  since.setHours(0, 0, 0, 0);

  const logRows = await prisma.activityLog.findMany({
    where: { createdAt: { gte: since } },
    select: { userName: true, action: true, createdAt: true },
    take: 20_000,
  });
  const rows = logRows.map((r) => ({ actor: r.userName, action: r.action, createdAt: r.createdAt }));

  const people = throughputByPerson(rows);
  const days = throughputByDay(rows, WINDOW_DAYS);
  const summary = throughputSummary(rows);
  const peak = Math.max(1, ...days.map((d) => d.total));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-base font-semibold text-zinc-100">Team</h1>
        <span className="text-[12px] text-muted">Last {WINDOW_DAYS} days, from the activity log</span>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Actions logged" value={String(summary.total)} />
        <Stat label="People active" value={String(summary.people)} />
        <Stat label="Days worked" value={String(summary.activeDays)} />
        <Stat label="Avg per active day" value={String(summary.perDay)} tone="ok" />
      </div>

      <div className={panelCls}>
        <div className="border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
          Per person
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              <th className={thCls}>Person</th>
              <th className={thCls + " text-right"}>Total</th>
              {WORK_KINDS.map((k) => <th key={k} className={thCls + " text-right capitalize"}>{k}</th>)}
              <th className={thCls + " text-right"}>Days</th>
              <th className={thCls + " text-right"}>Per day</th>
              <th className={thCls}>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.actor} className="hover:bg-raised/60">
                <td className={tdCls}>{p.actor}</td>
                <td className={`${tdCls} ${monoCls} text-right font-semibold`}>{p.total}</td>
                {WORK_KINDS.map((k) => (
                  <td key={k} className={`${tdCls} ${monoCls} text-right ${p.byKind[k] ? "" : "text-muted"}`}>
                    {p.byKind[k] || "—"}
                  </td>
                ))}
                <td className={`${tdCls} ${monoCls} text-right`}>{p.activeDays}</td>
                <td className={`${tdCls} ${monoCls} text-right text-accent`}>{p.perActiveDay}</td>
                <td className={tdCls + " text-muted"}>{p.lastAt.toLocaleDateString()}</td>
              </tr>
            ))}
            {people.length === 0 ? (
              <tr><td className={tdCls + " text-muted"} colSpan={9}>No activity in this window.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className={panelCls}>
        <div className="border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
          Daily volume
        </div>
        <div className="space-y-1 p-3">
          {days.map((d) => (
            <div key={d.day} className="flex items-center gap-2">
              <span className={`${monoCls} w-24 shrink-0 text-muted`}>{d.day.slice(5)}</span>
              <div className="h-3 flex-1 bg-raised">
                <div
                  className="h-3 bg-accent/70"
                  style={{ width: `${Math.round((d.total / peak) * 100)}%` }}
                  title={`${d.total} actions`}
                />
              </div>
              <span className={`${monoCls} w-10 shrink-0 text-right`}>{d.total || ""}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[12px] text-muted">
        Counts are logged actions, not hours — useful for spotting who is carrying which stage and when
        the workload spikes, not as a precise productivity score.
      </p>
    </div>
  );
}
