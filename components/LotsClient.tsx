"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { panelCls, thCls, tdCls, monoCls, btnCls, btnPrimaryCls, inputNarrowCls, labelCls, Stat } from "@/components/ui";
import { money } from "@/lib/format";
import { label } from "@/lib/constants";
import { priceLot, bundleDiscountPct, lotTitle, groupByCategory, type LotCandidate } from "@/lib/lotMath";

interface LotRow {
  id: string; lotCode: string; name: string; status: string;
  askingPrice: number | null; soldPrice: number | null; itemCount: number; createdAt: string;
}



export default function LotsClient({
  candidates, lots, staleThreshold, feePct,
}: { candidates: LotCandidate[]; lots: LotRow[]; staleThreshold: number; feePct: number }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [discount, setDiscount] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const chosen = useMemo(() => candidates.filter((c) => selected.has(c.id)), [candidates, selected]);
  // A non-numeric discount must not silently become NaN pricing behind an
  // enabled Create button — fall back to the automatic discount instead.
  const discountNum = discount.trim() === "" ? undefined : Number(discount);
  const discountValid = discountNum === undefined || (Number.isFinite(discountNum) && discountNum >= 0 && discountNum < 100);
  const pricing = useMemo(
    // feePct comes from Settings; hardcoding eBay's rate here let a lot be
    // created below the break-even floor the server computes.
    () => priceLot(chosen, feePct, discountValid ? discountNum : undefined),
    [chosen, feePct, discountValid, discountNum]
  );

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Selecting a whole category keeps the lot coherent to a buyer. */
  function selectCategory(cat: string) {
    const ids = candidates.filter((c) => c.category === cat).map((c) => c.id);
    setSelected(new Set(ids));
    setName(lotTitle(label(cat), ids.length));
  }

  async function create() {
    setBusy(true); setMsg("");
    const res = await fetch("/api/lots", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemIds: [...selected],
        name: name.trim() || undefined,
        askingPrice: pricing.suggestedPrice,
        discountPct: discountValid ? discountNum : undefined,
        platform: "EBAY",
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMsg(`Created ${data.lotCode}`);
      setSelected(new Set()); setName(""); setDiscount("");
      router.refresh();
    } else setMsg(data.error ?? "Could not create the lot");
  }

  async function patchLot(id: string, body: Record<string, unknown>) {
    setBusy(true);
    const res = await fetch(`/api/lots/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) router.refresh();
    else setMsg(data.error ?? "Update failed");
  }

  const byCategory = useMemo(() => groupByCategory(candidates), [candidates]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-base font-semibold text-zinc-100">Lots</h1>
        <span className="text-[12px] text-muted">
          Bundle stock that has sat past {staleThreshold} days — cutting price further has already failed.
        </span>
        {msg ? <span className="text-[12px] text-ok">{msg}</span> : null}
      </div>

      {selected.size > 0 ? (
        <div className={panelCls + " p-3"}>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="Items selected" value={String(pricing.itemCount)} />
            <Stat label="Individually priced at" value={money(pricing.totalIndividualPrice)} />
            <Stat label="Suggested lot price" value={money(pricing.suggestedPrice)} tone="accent" sub={`${pricing.discountPct}% off`} />
            <Stat label="Profit at that price" value={money(pricing.netAtSuggested)} tone={pricing.netAtSuggested >= 0 ? "ok" : "danger"} />
          </div>

          {pricing.belowCost ? (
            <p className="mt-2 text-[12px] text-danger">
              ⚠ A {pricing.discountPct}% discount would fall below cost after fees — the price has been
              raised to the break-even floor instead.
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <label className={labelCls}>Lot name</label>
              <input className={inputNarrowCls + " w-64"} value={name} onChange={(e) => setName(e.target.value)}
                placeholder={`Lot of ${pricing.itemCount}`} />
            </div>
            <div>
              <label className={labelCls}>Discount % (auto {bundleDiscountPct(pricing.itemCount)})</label>
              <input className={inputNarrowCls + " w-24"} value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="auto" />
              {discountValid ? null : <p className="mt-1 text-[11px] text-danger">Enter 0–99, or leave blank</p>}
            </div>
            <button
              className={btnPrimaryCls}
              disabled={busy || selected.size < 2 || !discountValid || !Number.isFinite(pricing.suggestedPrice)}
              onClick={() => void create()}
            >
              Create lot of {selected.size}
            </button>
            <button className={btnCls} onClick={() => { setSelected(new Set()); setName(""); }}>Clear</button>
          </div>
        </div>
      ) : null}

      <div className={panelCls}>
        <div className="flex flex-wrap items-center gap-2 border-b border-edge px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
            Bundle candidates — {candidates.length} stale item(s)
          </span>
          {[...byCategory.entries()].map(([cat, items]) => (
            <button key={cat} className={btnCls + " px-1.5 py-0.5 text-[11px]"} onClick={() => selectCategory(cat)}>
              {label(cat)} ({items.length})
            </button>
          ))}
        </div>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className={thCls + " w-6"} />
                <th className={thCls}>SKU</th>
                <th className={thCls}>Item</th>
                <th className={thCls}>Category</th>
                <th className={thCls + " text-right"}>Days listed</th>
                <th className={thCls + " text-right"}>Cost</th>
                <th className={thCls + " text-right"}>Asking</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id} className="hover:bg-raised/60">
                  <td className={tdCls}>
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                  </td>
                  <td className={`${tdCls} ${monoCls}`}>
                    <Link href={`/items/${c.id}`} className="text-accent hover:underline">{c.sku}</Link>
                  </td>
                  <td className={tdCls + " max-w-64"}><div className="truncate">{c.name}</div></td>
                  <td className={tdCls}>{label(c.category)}</td>
                  <td className={`${tdCls} ${monoCls} text-right text-danger`}>{c.daysListed ?? "—"}d</td>
                  <td className={`${tdCls} ${monoCls} text-right text-muted`}>{money(c.ourCost)}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{money(c.sellPrice)}</td>
                </tr>
              ))}
              {candidates.length === 0 ? (
                <tr><td className={tdCls + " text-muted"} colSpan={7}>
                  Nothing has sat past {staleThreshold} days. Good.
                </td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className={panelCls}>
        <div className="border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
          Lots
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              <th className={thCls}>Code</th>
              <th className={thCls}>Name</th>
              <th className={thCls + " text-right"}>Items</th>
              <th className={thCls + " text-right"}>Asking</th>
              <th className={thCls + " text-right"}>Sold</th>
              <th className={thCls}>Status</th>
              <th className={thCls} />
            </tr>
          </thead>
          <tbody>
            {lots.map((l) => (
              <tr key={l.id} className="hover:bg-raised/60">
                <td className={`${tdCls} ${monoCls} text-accent`}>{l.lotCode}</td>
                <td className={tdCls}>{l.name}</td>
                <td className={`${tdCls} ${monoCls} text-right`}>{l.itemCount}</td>
                <td className={`${tdCls} ${monoCls} text-right`}>{money(l.askingPrice)}</td>
                <td className={`${tdCls} ${monoCls} text-right text-ok`}>{money(l.soldPrice)}</td>
                <td className={tdCls}>{label(l.status)}</td>
                <td className={tdCls}>
                  <div className="flex gap-1">
                    {l.status === "DRAFT" ? (
                      <button className={btnCls + " px-1.5 py-0.5 text-[11px]"} disabled={busy}
                        onClick={() => void patchLot(l.id, { status: "LISTED" })}>List</button>
                    ) : null}
                    {l.status !== "SOLD" && l.status !== "CANCELLED" ? (
                      <>
                        <button className={btnCls + " px-1.5 py-0.5 text-[11px]"} disabled={busy}
                          onClick={() => {
                            const v = prompt(`Sale price for ${l.lotCode}?`, String(l.askingPrice ?? ""));
                            if (v) void patchLot(l.id, { status: "SOLD", soldPrice: v });
                          }}>Sold</button>
                        <button className={btnCls + " px-1.5 py-0.5 text-[11px]"} disabled={busy}
                          onClick={() => {
                            if (confirm(`Break up ${l.lotCode}? Items return to LISTED.`)) void patchLot(l.id, { status: "CANCELLED" });
                          }}>Break up</button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {lots.length === 0 ? (
              <tr><td className={tdCls + " text-muted"} colSpan={7}>No lots yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
