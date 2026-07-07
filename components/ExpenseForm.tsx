"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputCls, btnCls, btnPrimaryCls, labelCls, inputNarrowCls, selectNarrowCls } from "@/components/ui";
import { localDateStr } from "@/lib/format";

const EXPENSE_CATEGORIES = ["Shipping supplies", "Storage", "Platform fees", "Fuel / transport", "Equipment", "Other"];

export default function ExpenseForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    date: localDateStr(new Date()),
    category: EXPENSE_CATEGORIES[0],
    description: "",
    amount: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setForm((f) => ({ ...f, description: "", amount: "" }));
      router.refresh();
    } else {
      setError(data.error ?? "Failed to add expense");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <div>
        <label className={labelCls}>Date</label>
        <input type="date" required className={inputNarrowCls + " w-auto"} value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
      </div>
      <div>
        <label className={labelCls}>Category</label>
        <select className={selectNarrowCls + " w-auto"} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
          {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="min-w-44 flex-1">
        <label className={labelCls}>Description</label>
        <input required className={inputCls} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </div>
      <div>
        <label className={labelCls}>Amount ($)</label>
        <input type="number" step="0.01" min="0.01" required className={inputNarrowCls + " w-24 font-mono"} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
      </div>
      <button type="submit" disabled={busy} className={btnPrimaryCls}>Add expense</button>
      {error ? <span className="text-[12px] text-danger">{error}</span> : null}
    </form>
  );
}

export function DeleteExpenseButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button
      className={btnCls + " px-1.5 py-0.5 text-[11px]"}
      onClick={async () => {
        if (!confirm("Delete this expense?")) return;
        await fetch(`/api/expenses/${id}`, { method: "DELETE" });
        router.refresh();
      }}
    >
      ×
    </button>
  );
}
