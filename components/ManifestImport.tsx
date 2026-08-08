"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { btnCls, btnPrimaryCls, monoCls, panelCls, selectNarrowCls, thCls, tdCls } from "@/components/ui";
import { parseCsv } from "@/lib/csvParse";

const FIELDS = [
  { key: "", label: "— ignore —" },
  { key: "name", label: "Product name *" },
  { key: "upc", label: "UPC / barcode" },
  { key: "brand", label: "Brand" },
  { key: "msrp", label: "MSRP ($)" },
  { key: "qty", label: "Quantity" },
  { key: "condition", label: "Condition" },
  { key: "notes", label: "Notes" },
] as const;

// Header-name guesses for automatic column mapping
const AUTO: [RegExp, string][] = [
  [/^(item|product|description|title|name|product.?name|item.?description)$/i, "name"],
  [/^(upc|ean|gtin|barcode)$/i, "upc"],
  [/^(brand|manufacturer|mfr)$/i, "brand"],
  [/^(msrp|retail|retail.?price|list.?price|unit.?retail)$/i, "msrp"],
  [/^(qty|quantity|units|count)$/i, "qty"],
  [/^(condition|cond)$/i, "condition"],
  [/^(notes?|comments?)$/i, "notes"],
];

export default function ManifestImport({ palletId }: { palletId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<string[]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const parsed = parseCsv(await file.text());
    if (parsed.length === 0) {
      setResult("File appears to be empty");
      return;
    }
    const cols = parsed[0].length;
    const auto = parsed[0].map((header) => {
      const hit = AUTO.find(([re]) => re.test(header.trim()));
      return hit ? hit[1] : "";
    });
    // If nothing auto-mapped, the file probably has no header row
    const looksHeaderless = auto.every((m) => m === "");
    setHasHeader(!looksHeaderless);
    setMapping(looksHeaderless ? Array(cols).fill("") : auto);
    setRows(parsed);
    setResult("");
  }

  const dataRows = useMemo(() => (hasHeader ? rows.slice(1) : rows), [rows, hasHeader]);
  const nameMapped = mapping.includes("name");

  async function runImport() {
    setBusy(true);
    setResult("");
    const payload = dataRows.map((r) => {
      const obj: Record<string, string> = {};
      mapping.forEach((field, i) => {
        if (field && r[i] !== undefined) obj[field] = r[i];
      });
      return obj;
    });
    const res = await fetch(`/api/pallets/${palletId}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: payload }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      // The row-level notes were being collected server-side and thrown away
      // here, so a capped quantity or an unrecognised condition landed in the
      // data with nothing on screen to say it had been changed.
      const notes: string[] = Array.isArray(data.errors) ? data.errors : [];
      setResult(
        [
          `Imported ${data.created} item(s)${data.skipped ? `, skipped ${data.skipped} row(s)` : ""}.`,
          ...notes,
        ].join("\n")
      );
      setRows([]);
      setMapping([]);
      router.refresh();
    } else {
      setResult(data.error ?? "Import failed");
    }
  }

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <button className={btnCls} onClick={() => setOpen(true)}>Import manifest CSV</button>
        {result ? <span className="whitespace-pre-line text-[12px] text-ok">{result}</span> : null}
      </div>
    );
  }

  return (
    <div className={panelCls + " p-3"}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Import manifest CSV</span>
        <input type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e)} className="text-[12px]" />
        {rows.length > 0 ? (
          <label className="flex items-center gap-1 text-[12px] text-zinc-300">
            <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
            First row is a header
          </label>
        ) : null}
        <button className={btnCls + " ml-auto"} onClick={() => { setOpen(false); setRows([]); setResult(""); }}>Close</button>
      </div>

      {rows.length > 0 ? (
        <>
          <div className="mb-2 overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr>
                  {rows[0].map((_, colIdx) => (
                    <th key={colIdx} className={thCls}>
                      <select
                        className={selectNarrowCls + " w-full min-w-28 py-1 text-[11px]"}
                        value={mapping[colIdx] ?? ""}
                        onChange={(e) => setMapping((m) => m.map((v, i) => (i === colIdx ? e.target.value : v)))}
                      >
                        {FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.slice(0, 5).map((r, i) => (
                  <tr key={i}>
                    {rows[0].map((_, colIdx) => (
                      <td key={colIdx} className={`${tdCls} ${monoCls} max-w-48 truncate`}>{r[colIdx] ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className={btnPrimaryCls} disabled={busy || !nameMapped} onClick={() => void runImport()}>
              {busy ? "Importing…" : `Import ${dataRows.length} row(s)`}
            </button>
            {!nameMapped ? <span className="text-[12px] text-danger">Map one column to &quot;Product name&quot; to continue</span> : null}
            <span className="text-[11px] text-muted">
              Rows with a Quantity create that many individual items. Pallet cost is re-spread across all items after import. Sell prices default from MSRP.
            </span>
          </div>
        </>
      ) : (
        <div className="text-[12px] text-muted">
          Pick the manifest CSV you downloaded from Liquidation.com / B-Stock. You&apos;ll map its columns before anything is imported.
        </div>
      )}
      {result ? <div className="mt-2 whitespace-pre-line text-[12px] text-amber-300">{result}</div> : null}
    </div>
  );
}
