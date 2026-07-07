import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { panelCls, thCls, tdCls, monoCls, btnCls } from "@/components/ui";

export const dynamic = "force-dynamic";

const PER_PAGE = 100;

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const [rows, total] = await Promise.all([
    prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    prisma.activityLog.count(),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="space-y-3">
      <h1 className="text-base font-semibold text-zinc-100">Activity</h1>
      <div className={panelCls + " overflow-x-auto"}>
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              <th className={thCls}>When</th>
              <th className={thCls}>Who</th>
              <th className={thCls}>Action</th>
              <th className={thCls}>Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-raised/60">
                <td className={`${tdCls} ${monoCls} whitespace-nowrap text-muted`}>
                  {r.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </td>
                <td className={tdCls}>{r.userName}</td>
                <td className={`${tdCls} ${monoCls} text-accent`}>{r.action}</td>
                <td className={tdCls}>{r.detail}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td className={tdCls + " text-muted"} colSpan={4}>No activity yet — actions like intake, status changes, imports, and listings appear here.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-[12px] text-muted">
        <span className={monoCls}>{total} entries · page {page}/{pages}</span>
        <span className="flex gap-1">
          {page > 1 ? <Link className={btnCls} href={`/activity?page=${page - 1}`}>← Prev</Link> : null}
          {page < pages ? <Link className={btnCls} href={`/activity?page=${page + 1}`}>Next →</Link> : null}
        </span>
      </div>
    </div>
  );
}
