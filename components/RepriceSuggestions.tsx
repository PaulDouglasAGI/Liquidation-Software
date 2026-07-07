"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { panelCls, thCls, tdCls, monoCls, btnPrimaryCls } from "@/components/ui";
import { money } from "@/lib/format";
import type { RepriceSuggestion } from "@/lib/insights";

export default function RepriceSuggestions({
  suggestions,
  agingDays,
}: {
  suggestions: RepriceSuggestion[];
  agingDays: number;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState<Set<string>>(new Set(suggestions.map((s) => s.id)));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  function toggle(id: string) {
    setChecked((c) => {
      const next = new Set(c);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function apply() {
    setBusy(true);
    setMsg("");
    const prices = Object.fromEntries(
      suggestions.filter((s) => checked.has(s.id)).map((s) => [s.id, s.suggestedPrice])
    );
    const res = await fetch("/api/items/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Object.keys(prices), action: "setPrices", payload: { prices } }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMsg(`${data.updated} price(s) updated`);
      router.refresh();
    } else {
      setMsg(data.error ?? "Reprice failed");
    }
  }

  if (suggestions.length === 0) {
    return (
      <div className={panelCls + " px-3 py-2 text-[12px] text-muted"}>
        Repricing: nothing listed past the {agingDays}-day aging threshold. Good.
      </div>
    );
  }

  return (
    <div className={panelCls}>
      <div className="flex flex-wrap items-center gap-2 border-b border-edge px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
          Suggested price cuts — {suggestions.length} aging item(s)
        </span>
        <span className="text-[11px] text-muted">
          10% off past {agingDays} days, 20% past {agingDays * 2}, never below cost
        </span>
        <button className={btnPrimaryCls + " ml-auto"} disabled={busy || checked.size === 0} onClick={() => void apply()}>
          {busy ? "Applying…" : `Apply ${checked.size} selected`}
        </button>
        {msg ? <span className="text-[12px] text-ok">{msg}</span> : null}
      </div>
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              <th className={thCls + " w-6"} />
              <th className={thCls}>SKU</th>
              <th className={thCls}>Item</th>
              <th className={thCls + " text-right"}>Days listed</th>
              <th className={thCls + " text-right"}>Current</th>
              <th className={thCls + " text-right"}>Suggested</th>
              <th className={thCls + " text-right"}>Cost floor</th>
            </tr>
          </thead>
          <tbody>
            {suggestions.map((s) => (
              <tr key={s.id} className="hover:bg-raised/60">
                <td className={tdCls}>
                  <input type="checkbox" checked={checked.has(s.id)} onChange={() => toggle(s.id)} />
                </td>
                <td className={tdCls}>
                  <Link href={`/items/${s.id}`} className={`${monoCls} text-accent hover:underline`}>{s.sku}</Link>
                </td>
                <td className={tdCls + " max-w-64"}><div className="truncate">{s.name}</div></td>
                <td className={`${tdCls} ${monoCls} text-right text-danger`}>{s.daysListed}d</td>
                <td className={`${tdCls} ${monoCls} text-right`}>{money(s.currentPrice)}</td>
                <td className={`${tdCls} ${monoCls} text-right text-accent`}>{money(s.suggestedPrice)} <span className="text-muted">(−{s.cutPct}%)</span></td>
                <td className={`${tdCls} ${monoCls} text-right text-muted`}>{money(s.ourCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
