"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputCls, btnCls, btnPrimaryCls, labelCls, inputNarrowCls, selectNarrowCls } from "@/components/ui";
import { SUPPLIERS } from "@/lib/constants";
import { localDateStr } from "@/lib/format";

export default function SupplierForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    supplierName: SUPPLIERS[0] as string,
    supplierOther: "",
    purchaseDate: localDateStr(new Date()),
    manifestId: "",
    category: "",
    palletsBought: "1",
    totalPaid: "",
    notes: "",
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        supplierName: form.supplierName === "Other" && form.supplierOther ? form.supplierOther : form.supplierName,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setForm((f) => ({ ...f, manifestId: "", totalPaid: "", notes: "" }));
      router.refresh();
    } else {
      setError(data.error ?? "Failed to log purchase");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <div>
        <label className={labelCls}>Supplier</label>
        <select className={selectNarrowCls + " w-auto"} value={form.supplierName} onChange={set("supplierName")}>
          {SUPPLIERS.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      {form.supplierName === "Other" ? (
        <div>
          <label className={labelCls}>Name</label>
          <input className={inputNarrowCls + " w-32"} value={form.supplierOther} onChange={set("supplierOther")} />
        </div>
      ) : null}
      <div>
        <label className={labelCls}>Date</label>
        <input type="date" required className={inputNarrowCls + " w-auto"} value={form.purchaseDate} onChange={set("purchaseDate")} />
      </div>
      <div>
        <label className={labelCls}>Manifest ID</label>
        <input className={inputNarrowCls + " w-28 font-mono"} value={form.manifestId} onChange={set("manifestId")} />
      </div>
      <div>
        <label className={labelCls}>Category</label>
        <input className={inputNarrowCls + " w-28"} value={form.category} onChange={set("category")} />
      </div>
      <div>
        <label className={labelCls}>Pallets</label>
        <input type="number" min="1" className={inputNarrowCls + " w-16 font-mono"} value={form.palletsBought} onChange={set("palletsBought")} />
      </div>
      <div>
        <label className={labelCls}>Total paid ($)</label>
        <input type="number" step="0.01" min="0" required className={inputNarrowCls + " w-28 font-mono"} value={form.totalPaid} onChange={set("totalPaid")} />
      </div>
      <div className="min-w-32 flex-1">
        <label className={labelCls}>Notes</label>
        <input className={inputCls} value={form.notes} onChange={set("notes")} />
      </div>
      <button type="submit" disabled={busy} className={btnPrimaryCls}>Log purchase</button>
      {error ? <span className="text-[12px] text-danger">{error}</span> : null}
    </form>
  );
}

export function DeletePurchaseButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button
      className={btnCls + " px-1.5 py-0.5 text-[11px]"}
      onClick={async () => {
        if (!confirm("Delete this purchase record?")) return;
        await fetch(`/api/suppliers/${id}`, { method: "DELETE" });
        router.refresh();
      }}
    >
      ×
    </button>
  );
}
