"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { panelCls, thCls, tdCls, monoCls } from "@/components/ui";
import { label } from "@/lib/constants";
import { dateStr } from "@/lib/format";

export interface LaborRow {
  id: string;
  userName: string;
  date: string;
  hours: number;
  activity: string;
  notes: string | null;
}

/**
 * The labor log for one lot, with attribution. Removal is deliberately narrow:
 * your own slips, or an owner's correction — one person cannot quietly delete
 * another's hours from the record.
 */
export default function LaborLog({
  palletId,
  palletCode,
  entries,
  currentUser,
  isOwner,
}: {
  palletId: string;
  palletCode: string;
  entries: LaborRow[];
  currentUser: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function remove(id: string) {
    setBusy(id);
    setError("");
    const res = await fetch(`/api/labor/${id}`, { method: "DELETE" });
    setBusy(null);
    if (res.ok) router.refresh();
    else setError((await res.json().catch(() => ({}))).error ?? "Could not remove that entry");
  }

  const total = Math.round(entries.reduce((s, e) => s + e.hours, 0) * 100) / 100;

  return (
    <div className={panelCls} data-pallet={palletId}>
      <div className="flex items-center justify-between border-b border-edge px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Labor log — {palletCode}
        </span>
        <span className={monoCls + " text-accent"}>{total}h</span>
      </div>
      {error ? <div className="px-3 py-2 text-[12px] text-danger">{error}</div> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[13px]">
          <thead>
            <tr>
              <th className={thCls}>Date</th>
              <th className={thCls}>Who</th>
              <th className={thCls}>Activity</th>
              <th className={thCls + " text-right"}>Hours</th>
              <th className={thCls}>Notes</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const canRemove = isOwner || e.userName === currentUser;
              return (
                <tr key={e.id} className="hover:bg-raised/60">
                  <td className={tdCls + " whitespace-nowrap text-zinc-400"}>{dateStr(e.date)}</td>
                  <td className={tdCls}>{e.userName}</td>
                  <td className={tdCls + " text-zinc-400"}>{label(e.activity)}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{e.hours}</td>
                  <td className={tdCls + " text-muted"}>{e.notes ?? ""}</td>
                  <td className={tdCls + " text-right"}>
                    {canRemove ? (
                      <button
                        onClick={() => remove(e.id)}
                        disabled={busy === e.id}
                        className="cursor-pointer text-[12px] text-muted hover:text-danger disabled:opacity-40"
                      >
                        {busy === e.id ? "…" : "Remove"}
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {entries.length === 0 ? (
              <tr>
                <td className={tdCls + " text-muted"} colSpan={6}>
                  No hours logged against this lot. Until someone does, profit-per-hour cannot be
                  calculated for it.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
