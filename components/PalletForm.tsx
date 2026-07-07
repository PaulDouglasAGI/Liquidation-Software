"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputCls, selectCls, btnPrimaryCls, btnCls, labelCls } from "@/components/ui";
import { CATEGORIES, SUPPLIERS, label } from "@/lib/constants";
import { localDateStr } from "@/lib/format";

export default function PalletForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    supplier: SUPPLIERS[0] as string,
    supplierOther: "",
    purchaseDate: localDateStr(new Date()),
    totalCost: "",
    manifestUrl: "",
    category: "MIXED",
    notes: "",
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/pallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        supplier: form.supplier === "Other" && form.supplierOther ? form.supplierOther : form.supplier,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      setForm((f) => ({ ...f, totalCost: "", manifestUrl: "", notes: "" }));
      router.push(`/pallets/${data.id}`);
      router.refresh();
    } else {
      setError(data.error ?? "Failed to create pallet");
    }
  }

  if (!open) {
    return (
      <button className={btnPrimaryCls} onClick={() => setOpen(true)}>+ New Pallet</button>
    );
  }

  return (
    <form onSubmit={submit} className="border border-edge bg-surface p-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <label className={labelCls}>Supplier</label>
          <select className={selectCls} value={form.supplier} onChange={set("supplier")}>
            {SUPPLIERS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {form.supplier === "Other" ? (
          <div>
            <label className={labelCls}>Supplier name</label>
            <input className={inputCls} value={form.supplierOther} onChange={set("supplierOther")} placeholder="Supplier" />
          </div>
        ) : null}
        <div>
          <label className={labelCls}>Purchase date</label>
          <input type="date" required className={inputCls} value={form.purchaseDate} onChange={set("purchaseDate")} />
        </div>
        <div>
          <label className={labelCls}>Pallet cost ($)</label>
          <input type="number" step="0.01" min="0" required className={inputCls + " font-mono"} value={form.totalCost} onChange={set("totalCost")} placeholder="0.00" />
        </div>
        <div>
          <label className={labelCls}>Category</label>
          <select className={selectCls} value={form.category} onChange={set("category")}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Manifest URL (optional)</label>
          <input className={inputCls} value={form.manifestUrl} onChange={set("manifestUrl")} placeholder="https://…" />
        </div>
        <div className="col-span-2 md:col-span-4">
          <label className={labelCls}>Notes</label>
          <textarea className={inputCls} rows={2} value={form.notes} onChange={set("notes")} />
        </div>
      </div>
      {error ? <div className="mt-2 text-[12px] text-danger">{error}</div> : null}
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={busy} className={btnPrimaryCls}>{busy ? "Creating…" : "Create pallet"}</button>
        <button type="button" className={btnCls} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
