"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { btnCls, inputNarrowCls, selectNarrowCls } from "@/components/ui";
import { CATEGORIES, CONDITIONS, ITEM_STATUSES, PLATFORMS, label } from "@/lib/constants";

export default function InventoryFilters({
  pallets,
  params,
}: {
  pallets: { id: string; palletCode: string }[];
  params: Record<string, string>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(params.q ?? "");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function apply(updates: Record<string, string>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    router.push(`/inventory?${next.toString()}`);
  }

  // Debounced search
  useEffect(() => {
    if (q === (params.q ?? "")) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => apply({ q }), 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const sel = (key: string, options: { value: string; text: string }[], placeholder: string) => (
    <select
      className={selectNarrowCls + " w-auto"}
      value={params[key] ?? ""}
      onChange={(e) => apply({ [key]: e.target.value })}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.text}</option>
      ))}
    </select>
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        data-search
        className={inputNarrowCls + " w-52"}
        placeholder="Search SKU, name, UPC, brand…  ( / )"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {sel("palletId", pallets.map((p) => ({ value: p.id, text: p.palletCode })), "Pallet")}
      {sel("category", CATEGORIES.map((c) => ({ value: c, text: label(c) })), "Category")}
      {sel("condition", CONDITIONS.map((c) => ({ value: c, text: label(c) })), "Condition")}
      {sel("status", ITEM_STATUSES.map((s) => ({ value: s, text: label(s) })), "Status")}
      {sel("platform", PLATFORMS.map((p) => ({ value: p, text: label(p) })), "Platform")}
      <input type="date" className={inputNarrowCls + " w-auto"} value={params.dateFrom ?? ""} onChange={(e) => apply({ dateFrom: e.target.value })} title="Received from" />
      <input type="date" className={inputNarrowCls + " w-auto"} value={params.dateTo ?? ""} onChange={(e) => apply({ dateTo: e.target.value })} title="Received to" />
      <input type="number" className={inputNarrowCls + " w-20 font-mono"} placeholder="$ min" defaultValue={params.priceMin ?? ""} onBlur={(e) => apply({ priceMin: e.target.value })} />
      <input type="number" className={inputNarrowCls + " w-20 font-mono"} placeholder="$ max" defaultValue={params.priceMax ?? ""} onBlur={(e) => apply({ priceMax: e.target.value })} />
      <label className="flex cursor-pointer items-center gap-1 text-[12px] text-zinc-300">
        <input type="checkbox" checked={params.aging === "1"} onChange={(e) => apply({ aging: e.target.checked ? "1" : "" })} />
        Aging only
      </label>
      <button className={btnCls} onClick={() => router.push("/inventory")}>Clear</button>
      <a className={btnCls} href={`/api/items/export?${searchParams.toString()}`}>Export CSV</a>
    </div>
  );
}
