"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputCls, selectCls, btnCls, btnPrimaryCls, btnDangerCls, labelCls } from "@/components/ui";
import { CATEGORIES, PALLET_STATUSES, label } from "@/lib/constants";

interface PalletData {
  id: string;
  supplier: string;
  purchaseDate: string;
  totalCost: number;
  manifestUrl: string | null;
  category: string;
  status: string;
  notes: string | null;
  itemCount: number;
}

export default function PalletEditor({ pallet }: { pallet: PalletData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState({
    supplier: pallet.supplier,
    purchaseDate: pallet.purchaseDate.slice(0, 10),
    totalCost: String(pallet.totalCost),
    manifestUrl: pallet.manifestUrl ?? "",
    category: pallet.category,
    status: pallet.status,
    notes: pallet.notes ?? "",
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/pallets/${pallet.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: "Saved" } : { ok: false, text: data.error ?? "Save failed" });
    if (res.ok) router.refresh();
  }

  async function allocate() {
    if (!confirm(`Evenly spread ${form.totalCost} across all ${pallet.itemCount} items? This overwrites per-item costs.`)) return;
    setBusy(true);
    const res = await fetch(`/api/pallets/${pallet.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "allocate" }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: `Cost reallocated: ${data.perItemCost?.toFixed(2)}/item` } : { ok: false, text: data.error ?? "Failed" });
    if (res.ok) router.refresh();
  }

  async function remove() {
    if (!confirm("Delete this pallet? Only possible when it has no items.")) return;
    setBusy(true);
    const res = await fetch(`/api/pallets/${pallet.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      router.push("/pallets");
      router.refresh();
    } else {
      setMsg({ ok: false, text: data.error ?? "Delete failed" });
    }
  }

  return (
    <form onSubmit={save} className="border border-edge bg-surface p-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <label className={labelCls}>Supplier</label>
          <input className={inputCls} value={form.supplier} onChange={set("supplier")} />
        </div>
        <div>
          <label className={labelCls}>Purchase date</label>
          <input type="date" className={inputCls} value={form.purchaseDate} onChange={set("purchaseDate")} />
        </div>
        <div>
          <label className={labelCls}>Pallet cost ($)</label>
          <input type="number" step="0.01" min="0" className={inputCls + " font-mono"} value={form.totalCost} onChange={set("totalCost")} />
        </div>
        <div>
          <label className={labelCls}>Category</label>
          <select className={selectCls} value={form.category} onChange={set("category")}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Status</label>
          <select className={selectCls} value={form.status} onChange={set("status")}>
            {PALLET_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </div>
        <div className="col-span-2 md:col-span-3">
          <label className={labelCls}>Manifest URL</label>
          <input className={inputCls} value={form.manifestUrl} onChange={set("manifestUrl")} placeholder="https://…" />
        </div>
        <div className="col-span-2 md:col-span-4">
          <label className={labelCls}>Notes</label>
          <textarea className={inputCls} rows={2} value={form.notes} onChange={set("notes")} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="submit" disabled={busy} className={btnPrimaryCls}>Save</button>
        <button type="button" disabled={busy || pallet.itemCount === 0} className={btnCls} onClick={allocate} title="Spread pallet cost evenly across all items">
          Reallocate cost / item
        </button>
        <button type="button" disabled={busy} className={btnDangerCls} onClick={remove}>Delete</button>
        {msg ? <span className={`text-[12px] ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</span> : null}
      </div>
    </form>
  );
}
