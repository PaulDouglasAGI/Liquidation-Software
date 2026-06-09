"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { btnCls, btnPrimaryCls, labelCls, inputNarrowCls, selectNarrowCls } from "@/components/ui";

const PRESETS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "mtd", label: "This month" },
];

function presetRange(key: string): { from: string; to: string } {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  switch (key) {
    case "today":
      return { from: iso(today), to: iso(today) };
    case "7d":
      return { from: iso(new Date(Date.now() - 6 * 86_400_000)), to: iso(today) };
    case "mtd":
      return { from: iso(new Date(today.getFullYear(), today.getMonth(), 2)), to: iso(today) };
    default:
      return { from: iso(new Date(Date.now() - 29 * 86_400_000)), to: iso(today) };
  }
}

export default function PnlControls({ from, to, groupBy }: { from: string; to: string; groupBy: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [range, setRange] = useState({ from, to });

  function apply(updates: Record<string, string>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.push(`/pnl?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      {PRESETS.map((p) => (
        <button
          key={p.key}
          className={btnCls}
          onClick={() => {
            const r = presetRange(p.key);
            setRange(r);
            apply(r);
          }}
        >
          {p.label}
        </button>
      ))}
      <div>
        <label className={labelCls}>From</label>
        <input type="date" className={inputNarrowCls + " w-auto"} value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
      </div>
      <div>
        <label className={labelCls}>To</label>
        <input type="date" className={inputNarrowCls + " w-auto"} value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
      </div>
      <button className={btnPrimaryCls} onClick={() => apply(range)}>Apply</button>
      <div>
        <label className={labelCls}>Group by</label>
        <select className={selectNarrowCls + " w-auto"} value={groupBy} onChange={(e) => apply({ groupBy: e.target.value })}>
          <option value="pallet">Pallet</option>
          <option value="category">Category</option>
          <option value="platform">Platform</option>
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
        </select>
      </div>
      <a className={btnCls} href={`/api/pnl/export?${searchParams.toString()}`}>Export CSV</a>
    </div>
  );
}
