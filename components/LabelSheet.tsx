"use client";

import { useEffect } from "react";
import JsBarcode from "jsbarcode";
import { btnCls, btnPrimaryCls } from "@/components/ui";
import { label } from "@/lib/constants";
import { money } from "@/lib/format";

interface LabelItem {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  condition: string;
  sellPrice: number | null;
  storageLocation: string | null;
}

/**
 * 2.25" x 1.25" thermal-label-friendly sheet; also prints fine on plain paper
 * (multiple labels per page, cut lines via borders).
 */
export default function LabelSheet({ items }: { items: LabelItem[] }) {
  useEffect(() => {
    for (const item of items) {
      const el = document.getElementById(`bc-${item.id}`);
      if (el) {
        try {
          JsBarcode(el, item.sku, {
            format: "CODE128",
            width: 1.4,
            height: 34,
            margin: 0,
            displayValue: false,
            background: "#ffffff",
            lineColor: "#000000",
          });
        } catch {
          // invalid content for CODE128 — leave the SKU text as fallback
        }
      }
    }
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="p-4 text-[13px] text-muted">
        No items selected. Select items in the inventory table and choose &quot;Print labels&quot;.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 print:hidden">
        <h1 className="mr-2 text-base font-semibold text-zinc-100">Labels — {items.length} item(s)</h1>
        <button className={btnPrimaryCls} onClick={() => window.print()}>Print</button>
        <button className={btnCls} onClick={() => history.back()}>Back</button>
        <span className="text-[11px] text-muted">Scanning a label at Item Intake or in Inventory search finds the item by SKU.</span>
      </div>

      <style>{`
        @media print {
          body { background: #fff !important; }
          aside, nav { display: none !important; }
          main { padding: 0 !important; }
        }
        .label-card { break-inside: avoid; page-break-inside: avoid; }
      `}</style>

      <div className="flex flex-wrap gap-2 print:gap-1">
        {items.map((i) => (
          <div
            key={i.id}
            className="label-card flex h-[1.25in] w-[2.25in] flex-col justify-between border border-zinc-400 bg-white p-1.5 text-black"
          >
            <div className="truncate text-[10px] font-semibold leading-tight">
              {(i.brand ? i.brand + " " : "") + i.name}
            </div>
            <svg id={`bc-${i.id}`} className="w-full" />
            <div className="flex items-baseline gap-1 font-mono text-[9px] leading-tight">
              <span className="whitespace-nowrap font-bold">{i.sku}</span>
              <span className="min-w-0 flex-1 truncate text-center">
                {label(i.condition)}{i.storageLocation ? ` · ${i.storageLocation}` : ""}
              </span>
              <span className="whitespace-nowrap font-bold">{i.sellPrice !== null ? money(i.sellPrice) : ""}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
