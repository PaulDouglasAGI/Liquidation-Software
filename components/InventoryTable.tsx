"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { thCls, tdCls, monoCls, btnCls, panelCls, inputNarrowCls } from "@/components/ui";
import { ITEM_STATUSES, label, STATUS_COLORS } from "@/lib/constants";
import { money, daysSince } from "@/lib/format";

export interface InvRow {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  condition: string;
  ourCost: number;
  sellPrice: number | null;
  soldPrice: number | null;
  msrp: number | null;
  status: string;
  platform: string | null;
  storageLocation: string | null;
  palletCode: string;
  dateListed: string | null;
  createdAt: string;
}

export default function InventoryTable({
  rows,
  total,
  page,
  perPage,
  agingDays,
  locations,
}: {
  rows: InvRow[];
  total: number;
  page: number;
  perPage: number;
  agingDays: number;
  locations: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const paramsKey = searchParams.toString();
  const lastParamsKey = useRef(paramsKey);
  // Changing page or filters must drop the selection — otherwise bulk actions
  // silently hit items selected on a previous, no-longer-visible page.
  useEffect(() => {
    if (lastParamsKey.current !== paramsKey) {
      lastParamsKey.current = paramsKey;
      setSelected(new Set());
    }
  }, [paramsKey]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [repriceMode, setRepriceMode] = useState<"" | "pctMsrp" | "pctOff" | "flatOff">("");
  const [repriceVal, setRepriceVal] = useState("");

  const pages = Math.max(1, Math.ceil(total / perPage));
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }
  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function pageLink(p: number) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("page", String(p));
    return `/inventory?${next.toString()}`;
  }

  function sortLink(key: string) {
    const next = new URLSearchParams(searchParams.toString());
    const cur = next.get("sort");
    const dir = next.get("dir");
    next.set("sort", key);
    next.set("dir", cur === key && dir !== "asc" ? "asc" : "desc");
    next.delete("page");
    return `/inventory?${next.toString()}`;
  }

  async function patchItem(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMsg(data.error ?? "Update failed");
    } else {
      setMsg("");
    }
    router.refresh();
  }

  async function bulk(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/items/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected], action, payload }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMsg(`${data.updated} item(s) updated`);
      setSelected(new Set());
      setRepriceMode("");
      setRepriceVal("");
      router.refresh();
    } else {
      setMsg(data.error ?? "Bulk action failed");
    }
  }

  function applyReprice() {
    const v = parseFloat(repriceVal);
    if (!Number.isFinite(v) || v <= 0) {
      setMsg("Enter a valid number");
      return;
    }
    if (repriceMode === "pctMsrp") void bulk("repricePctMsrp", { pct: v });
    else if (repriceMode === "pctOff") void bulk("repriceDiscountPct", { pct: v });
    else if (repriceMode === "flatOff") void bulk("repriceDiscountFlat", { amount: v });
  }

  return (
    <div className="space-y-2">
      {/* Bulk action bar */}
      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border border-accent/40 bg-accent/5 px-2 py-1.5">
          <span className={`${monoCls} text-accent`}>{selected.size} selected</span>
          <button disabled={busy} className={btnCls} onClick={() => void bulk("markListed")}>Mark listed</button>
          <button disabled={busy} className={btnCls} onClick={() => void bulk("markSold")}>Mark sold</button>
          <button disabled={busy} className={btnCls} onClick={() => void bulk("relist")}>Relist</button>
          <button
            disabled={busy}
            className={btnCls}
            onClick={() => {
              const location = prompt("New storage location (blank to clear):");
              if (location !== null) void bulk("changeLocation", { location });
            }}
          >
            Change location
          </button>
          <button disabled={busy} className={btnCls} onClick={() => confirm("Scrap selected items?") && void bulk("scrap")}>Scrap</button>
          {repriceMode === "" ? (
            <>
              <button disabled={busy} className={btnCls} onClick={() => setRepriceMode("pctMsrp")}>Reprice: % of MSRP</button>
              <button disabled={busy} className={btnCls} onClick={() => setRepriceMode("pctOff")}>Reprice: % off</button>
              <button disabled={busy} className={btnCls} onClick={() => setRepriceMode("flatOff")}>Reprice: $ off</button>
            </>
          ) : (
            <span className="flex items-center gap-1">
              <input
                autoFocus
                type="number"
                step="0.01"
                className={inputNarrowCls + " w-24 font-mono"}
                placeholder={repriceMode === "pctMsrp" ? "% of MSRP" : repriceMode === "pctOff" ? "% off" : "$ off"}
                value={repriceVal}
                onChange={(e) => setRepriceVal(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), applyReprice())}
              />
              <button disabled={busy} className={btnCls} onClick={applyReprice}>Apply</button>
              <button className={btnCls} onClick={() => setRepriceMode("")}>×</button>
            </span>
          )}
          <a className={btnCls} href={`/api/listings/amazon?ids=${[...selected].join(",")}`}>Amazon flat file</a>
          <Link className={btnCls} href={`/labels?ids=${[...selected].join(",")}`}>Print labels</Link>
        </div>
      ) : null}
      {msg ? <div className="text-[12px] text-amber-300">{msg}</div> : null}

      <div className={panelCls + " overflow-x-auto"}>
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              <th className={thCls + " w-6"}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              </th>
              <th className={thCls}><Link href={sortLink("sku")} className="hover:text-zinc-200">SKU</Link></th>
              <th className={thCls}><Link href={sortLink("name")} className="hover:text-zinc-200">Product</Link></th>
              <th className={thCls}>Condition</th>
              <th className={thCls + " text-right"}><Link href={sortLink("cost")} className="hover:text-zinc-200">Cost</Link></th>
              <th className={thCls + " text-right"}><Link href={sortLink("price")} className="hover:text-zinc-200">List price</Link></th>
              <th className={thCls}><Link href={sortLink("status")} className="hover:text-zinc-200">Status</Link></th>
              <th className={thCls}><Link href={sortLink("location")} className="hover:text-zinc-200">Location</Link></th>
              <th className={thCls}>Pallet</th>
              <th className={thCls + " text-right"}><Link href={sortLink("listed")} className="hover:text-zinc-200">Days listed</Link></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const days = r.status === "LISTED" ? daysSince(r.dateListed) : null;
              const aging = days !== null && days >= agingDays;
              return (
                <tr key={r.id} className={`hover:bg-raised/60 ${selected.has(r.id) ? "bg-accent/5" : ""}`}>
                  <td className={tdCls}>
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                  <td className={tdCls + " whitespace-nowrap"}>
                    <Link href={`/items/${r.id}`} className={`${monoCls} text-accent hover:underline`}>{r.sku}</Link>
                  </td>
                  <td className={tdCls + " max-w-72"}>
                    <div className="truncate" title={r.name}>{r.brand ? <span className="text-muted">{r.brand} </span> : null}{r.name}</div>
                  </td>
                  <td className={tdCls}>{label(r.condition)}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{money(r.ourCost)}</td>
                  <td className={tdCls + " text-right"}>
                    <InlinePrice
                      value={r.status === "SOLD" ? r.soldPrice : r.sellPrice}
                      sold={r.status === "SOLD"}
                      onSave={(v) => void patchItem(r.id, r.status === "SOLD" ? { soldPrice: v } : { sellPrice: v })}
                    />
                  </td>
                  <td className={tdCls}>
                    <select
                      className={`bg-transparent text-[12px] outline-none cursor-pointer ${STATUS_COLORS[r.status] ?? ""}`}
                      value={r.status}
                      onChange={(e) => void patchItem(r.id, { status: e.target.value })}
                    >
                      {ITEM_STATUSES.map((s) => <option key={s} value={s} className="bg-surface text-zinc-200">{label(s)}</option>)}
                    </select>
                  </td>
                  <td className={tdCls}>
                    <InlineText
                      value={r.storageLocation ?? ""}
                      placeholder="—"
                      listId="inv-locations"
                      onSave={(v) => void patchItem(r.id, { storageLocation: v })}
                    />
                  </td>
                  <td className={`${tdCls} ${monoCls} text-muted`}>{r.palletCode}</td>
                  <td className={`${tdCls} ${monoCls} text-right ${aging ? "text-danger" : ""}`}>
                    {days !== null ? `${days}d${aging ? " ⚠" : ""}` : "—"}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr><td className={tdCls + " text-muted"} colSpan={10}>No items match the current filters.</td></tr>
            ) : null}
          </tbody>
        </table>
        <datalist id="inv-locations">
          {locations.map((l) => <option key={l} value={l} />)}
        </datalist>
      </div>

      <div className="flex items-center justify-between text-[12px] text-muted">
        <span className={monoCls}>{total} items · page {page}/{pages}</span>
        <span className="flex gap-1">
          {page > 1 ? <Link className={btnCls} href={pageLink(page - 1)}>← Prev</Link> : null}
          {page < pages ? <Link className={btnCls} href={pageLink(page + 1)}>Next →</Link> : null}
        </span>
      </div>
    </div>
  );
}

function InlinePrice({ value, sold, onSave }: { value: number | null; sold: boolean; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  if (!editing) {
    return (
      <button
        className={`${monoCls} cursor-pointer hover:text-accent ${sold ? "text-ok" : ""}`}
        onClick={() => {
          setVal(value !== null ? String(value) : "");
          setEditing(true);
        }}
        title={sold ? "Sold price (click to edit)" : "List price (click to edit)"}
      >
        {money(value)}
      </button>
    );
  }
  return (
    <input
      autoFocus
      type="number"
      step="0.01"
      min="0"
      className={inputNarrowCls + " w-20 px-1 py-0.5 text-right font-mono"}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (val !== (value !== null ? String(value) : "")) onSave(val);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}

function InlineText({ value, placeholder, listId, onSave }: { value: string; placeholder: string; listId?: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  if (!editing) {
    return (
      <button className={`${monoCls} cursor-pointer hover:text-accent ${value ? "" : "text-muted"}`} onClick={() => { setVal(value); setEditing(true); }}>
        {value || placeholder}
      </button>
    );
  }
  return (
    <input
      autoFocus
      list={listId}
      className={inputNarrowCls + " w-28 px-1 py-0.5 font-mono"}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (val !== value) onSave(val);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}
