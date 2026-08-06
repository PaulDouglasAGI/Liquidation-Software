"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputCls, selectCls, btnPrimaryCls, btnCls, labelCls } from "@/components/ui";
import { CATEGORIES, CONDITION_GRADES, SUPPLIERS, label } from "@/lib/constants";
import { localDateStr } from "@/lib/format";

export default function PalletForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    supplier: SUPPLIERS[0] as string,
    supplierOther: "",
    sourceLotId: "",
    purchaseDate: localDateStr(new Date()),
    pickupDate: localDateStr(new Date()),
    totalCost: "",
    fees: "",
    manifestUrl: "",
    category: "MIXED",
    conditionGrade: "MIXED",
    manifestUnitCount: "",
    actualUnitCount: "",
    manifestRetailTotal: "",
    preBidEstimatedRecovery: "",
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
      setForm((f) => ({
        ...f,
        sourceLotId: "", totalCost: "", fees: "", manifestUrl: "", notes: "",
        manifestUnitCount: "", actualUnitCount: "", manifestRetailTotal: "",
        preBidEstimatedRecovery: "",
      }));
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
          <label className={labelCls}>Fees (premium, tax)</label>
          <input type="number" step="0.01" min="0" className={inputCls + " font-mono"} value={form.fees} onChange={set("fees")} placeholder="0.00" />
        </div>
        <div>
          <label className={labelCls}>Category</label>
          <select className={selectCls} value={form.category} onChange={set("category")}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Condition grade</label>
          <select className={selectCls} value={form.conditionGrade} onChange={set("conditionGrade")}>
            {CONDITION_GRADES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Pickup date</label>
          <input type="date" className={inputCls} value={form.pickupDate} onChange={set("pickupDate")} />
        </div>
        <div>
          <label className={labelCls}>Seller&apos;s lot ID</label>
          <input className={inputCls + " font-mono"} value={form.sourceLotId} onChange={set("sourceLotId")} placeholder="e.g. 40123d6b" />
        </div>

        {/* The bidding-calibration inputs. The estimate is the one that
            matters: without it, this lot never scores on estimate accuracy. */}
        <div className="col-span-2 md:col-span-4 border-t border-edge pt-2 text-[11px] text-muted">
          Record these before you bid — they are what makes the Lot Performance metrics work.
        </div>
        <div>
          <label className={labelCls}>Est. recovery (pre-bid)</label>
          <input
            type="number" step="0.01" min="0"
            className={inputCls + " font-mono"}
            value={form.preBidEstimatedRecovery}
            onChange={set("preBidEstimatedRecovery")}
            placeholder="what you expect to bank"
          />
        </div>
        <div>
          <label className={labelCls}>Manifest units</label>
          <input type="number" step="1" min="0" className={inputCls + " font-mono"} value={form.manifestUnitCount} onChange={set("manifestUnitCount")} placeholder="promised" />
        </div>
        <div>
          <label className={labelCls}>Actual units</label>
          <input type="number" step="1" min="0" className={inputCls + " font-mono"} value={form.actualUnitCount} onChange={set("actualUnitCount")} placeholder="turned up" />
        </div>
        <div>
          <label className={labelCls}>Manifest retail total</label>
          <input
            type="number" step="0.01" min="0"
            className={inputCls + " font-mono"}
            value={form.manifestRetailTotal}
            onChange={set("manifestRetailTotal")}
            placeholder="context only"
            title="Recorded for reference. Never used to price or value anything — manifest retail is not reliable."
          />
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
