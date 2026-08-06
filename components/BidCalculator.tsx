"use client";

import { useRef, useState } from "react";
import { panelCls, thCls, tdCls, monoCls, btnCls, btnPrimaryCls, inputNarrowCls, labelCls, Stat } from "@/components/ui";
import { money } from "@/lib/format";
import { CATEGORIES, label } from "@/lib/constants";
import { parseCsv } from "@/lib/csvParse";

interface CatStat { key: string; soldCount: number; avgRecoveryPct: number | null; avgDaysToSell: number | null }

interface Estimate {
  totalUnits: number; sellableUnits: number; totalMsrp: number;
  expectedRevenue: number; expectedFees: number; expectedShipping: number;
  netBeforeCost: number; maxBid: number;
  estimatedDaysToSell: number | null; confidencePct: number; warnings: string[];
  lines: { name: string; category: string; qty: number; msrp: number | null; recoveryPct: number; recoverySource: string; grossValue: number }[];
}

const SAMPLE = `name,category,brand,qty,msrp
Cordless Drill 20V,POWER_TOOLS,Dewalt,12,199
Socket Set 200pc,HAND_TOOLS,,8,89
Shop Vacuum,APPLIANCES,,4,129`;

export default function BidCalculator({ knownCategories, totalSales }: { knownCategories: CatStat[]; totalSales: number }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [askPrice, setAskPrice] = useState("");
  const [assumptions, setAssumptions] = useState({
    sellThroughPct: "85", targetMarginPct: "35", shippingPerUnit: "0", fallbackRecoveryPct: "30", platform: "EBAY",
  });
  const [est, setEst] = useState<Estimate | null>(null);
  const [atBid, setAtBid] = useState<{ profit: number; marginPct: number | null; roiPct: number | null } | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  /**
   * Load a manifest file straight from the supplier.
   *
   * Real sheets (Liquidation.com, B-Stock) are downloaded as .csv and often
   * carry a trailing totals row with a blank product name; that row is dropped
   * here so it cannot be valued as a line item.
   */
  async function loadFile(file: File) {
    setMsg("");
    const raw = await file.text().catch(() => "");
    if (!raw.trim()) { setMsg("That file looks empty."); return; }

    const rows = parseCsv(raw.trim()).filter((r) => r.some((c) => c.trim()));
    if (rows.length < 2) { setMsg("Need a header row and at least one product row."); return; }

    // Drop a trailing summary line: suppliers append one with no product name
    // but a populated total, which would otherwise be priced as a unit.
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const nameIdx = header.findIndex((h) => ["name", "description", "item", "product"].includes(h));
    const body = nameIdx >= 0 ? rows.slice(1).filter((r) => (r[nameIdx] ?? "").trim()) : rows.slice(1);
    const dropped = rows.length - 1 - body.length;

    // Re-serialise so the textarea shows exactly what will be valued.
    const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    setText([rows[0], ...body].map((r) => r.map(cell).join(",")).join("\n"));
    setFileName(file.name);
    setMsg(
      `Loaded ${body.length} row(s) from ${file.name}` +
        (dropped > 0 ? ` — skipped ${dropped} row(s) with no product name (usually the totals line)` : "")
    );
  }
  async function run() {
    setBusy(true); setMsg("");
    const rows = parseCsv(text.trim());
    if (rows.length < 2) { setBusy(false); setMsg("Paste a manifest with a header row and at least one line."); return; }

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const idx = (names: string[]) => header.findIndex((h) => names.includes(h));
    const iName = idx(["name", "description", "item", "product"]);
    const iCat = idx(["category", "cat", "type"]);
    const iBrand = idx(["brand", "manufacturer", "make", "mfr"]);
    const iQty = idx(["qty", "quantity", "units", "count", "qty."]);
    const iMsrp = idx(["msrp", "retail", "price", "unit retail", "retail price", "unit price", "list price"]);
    if (iName === -1) { setBusy(false); setMsg("Could not find a name/description column."); return; }

    const lines = rows
      .slice(1)
      // A supplier totals row has no product name but a populated total; it
      // would otherwise be valued as a line item.
      .filter((r) => r.some((c) => c.trim()) && (r[iName] ?? "").trim())
      .map((r) => ({
      name: r[iName] ?? "",
      category: iCat >= 0 ? (r[iCat] ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_") : "MIXED",
      brand: iBrand >= 0 ? r[iBrand] : null,
      qty: iQty >= 0 ? r[iQty] : "1",
      msrp: iMsrp >= 0 ? (r[iMsrp] ?? "").replace(/[$,]/g, "") : null,
      }));

    const res = await fetch("/api/bid", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines,
        bid: askPrice || undefined,
        assumptions: {
          sellThroughPct: Number(assumptions.sellThroughPct),
          targetMarginPct: Number(assumptions.targetMarginPct),
          shippingPerUnit: Number(assumptions.shippingPerUnit),
          fallbackRecoveryPct: Number(assumptions.fallbackRecoveryPct),
          platform: assumptions.platform,
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(data.error ?? "Could not value that manifest"); return; }
    setEst(data.estimate);
    setAtBid(data.atBid);
  }

  const set = (k: keyof typeof assumptions) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setAssumptions((a) => ({ ...a, [k]: e.target.value }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-base font-semibold text-zinc-100">Bid Calculator</h1>
        <span className="text-[12px] text-muted">
          Values a manifest against your own {totalSales} recorded sale{totalSales === 1 ? "" : "s"} — not generic retail.
        </span>
      </div>

      {totalSales < 10 ? (
        <div className={panelCls + " px-3 py-2 text-[12px] text-muted"}>
          You have {totalSales} sales on record. Estimates lean heavily on the fallback recovery rate until
          you have sold more; treat the max bid as a rough ceiling for now.
        </div>
      ) : null}

      <div className={panelCls + " p-3"}>
        <label className={labelCls}>Manifest (CSV or tab-separated, with a header row)</label>
        <textarea
          className={inputNarrowCls + " h-40 w-full font-mono text-[12px]"}
          placeholder={SAMPLE}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadFile(f);
              e.target.value = ""; // re-selecting the same file must re-fire
            }}
          />
          <button className={btnPrimaryCls} onClick={() => fileRef.current?.click()}>
            Upload manifest CSV
          </button>
          <button className={btnCls} onClick={() => setText(SAMPLE)}>Load a sample</button>
          {text ? (
            <button className={btnCls} onClick={() => { setText(""); setFileName(""); setEst(null); setAtBid(null); }}>
              Clear
            </button>
          ) : null}
          {fileName ? <span className="text-[12px] text-muted">{fileName}</span> : null}
        </div>
        <p className="mt-1 text-[11px] text-muted">
          Works with a supplier sheet as-is — recognises Product/Description, Make/Brand,
          Quantity, and Retail Price columns, and ignores a trailing totals row.
        </p>
      </div>

      <div className={panelCls + " p-3"}>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Sell-through %" value={assumptions.sellThroughPct} onChange={set("sellThroughPct")} />
          <Field label="Target margin %" value={assumptions.targetMarginPct} onChange={set("targetMarginPct")} />
          <Field label="Shipping / unit" value={assumptions.shippingPerUnit} onChange={set("shippingPerUnit")} />
          <Field label="Fallback recovery %" value={assumptions.fallbackRecoveryPct} onChange={set("fallbackRecoveryPct")} />
          <div>
            <label className={labelCls}>Platform</label>
            <select className={inputNarrowCls + " w-28"} value={assumptions.platform} onChange={set("platform")}>
              {["EBAY", "AMAZON", "FACEBOOK", "OTHER"].map((p) => <option key={p} value={p}>{label(p)}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Asking price (optional)</label>
            <input className={inputNarrowCls + " w-28"} value={askPrice} onChange={(e) => setAskPrice(e.target.value)} placeholder="1000" />
          </div>
          <button className={btnPrimaryCls} disabled={busy} onClick={() => void run()}>
            {busy ? "Valuing…" : "Value this pallet"}
          </button>
          {msg ? <span className="text-[12px] text-danger">{msg}</span> : null}
        </div>
      </div>

      {est ? (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="Max bid" value={money(est.maxBid)} tone="accent" sub={`at ${assumptions.targetMarginPct}% margin`} />
            <Stat label="Expected revenue" value={money(est.expectedRevenue)} sub={`${est.sellableUnits} of ${est.totalUnits} units`} />
            <Stat label="Net before goods cost" value={money(est.netBeforeCost)} tone="ok" />
            <Stat
              label="Confidence"
              value={`${est.confidencePct}%`}
              tone={est.confidencePct < 50 ? "danger" : undefined}
              sub={est.estimatedDaysToSell !== null ? `~${est.estimatedDaysToSell}d to sell` : undefined}
            />
          </div>

          {atBid ? (
            <div className={panelCls + " px-3 py-2"}>
              <span className="text-[13px]">
                At an asking price of <span className={monoCls}>{money(Number(askPrice))}</span>:{" "}
                <span className={atBid.profit >= 0 ? "text-ok" : "text-danger"}>
                  {money(atBid.profit)} profit
                </span>
                {atBid.marginPct !== null ? ` · ${atBid.marginPct}% margin` : ""}
                {atBid.roiPct !== null ? ` · ${atBid.roiPct}% ROI` : ""}
                {Number(askPrice) > est.maxBid ? (
                  <span className="ml-2 font-semibold text-danger">Above your max bid — walk away.</span>
                ) : (
                  <span className="ml-2 font-semibold text-ok">Within your max bid.</span>
                )}
              </span>
            </div>
          ) : null}

          {est.warnings.length > 0 ? (
            <div className={panelCls + " px-3 py-2"}>
              {est.warnings.map((w, n) => <p key={n} className="text-[12px] text-danger">⚠ {w}</p>)}
            </div>
          ) : null}

          <div className={panelCls}>
            <div className="border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
              Line by line — MSRP {money(est.totalMsrp)} on the manifest, {money(est.expectedRevenue)} realistic
            </div>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr>
                    <th className={thCls}>Item</th>
                    <th className={thCls}>Category</th>
                    <th className={thCls + " text-right"}>Qty</th>
                    <th className={thCls + " text-right"}>MSRP</th>
                    <th className={thCls + " text-right"}>Recovery</th>
                    <th className={thCls + " text-right"}>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {est.lines.map((l, n) => (
                    <tr key={n} className="hover:bg-raised/60">
                      <td className={tdCls + " max-w-64"}><div className="truncate">{l.name}</div></td>
                      <td className={tdCls}>{label(l.category)}</td>
                      <td className={`${tdCls} ${monoCls} text-right`}>{l.qty}</td>
                      <td className={`${tdCls} ${monoCls} text-right`}>{l.msrp === null ? "—" : money(l.msrp)}</td>
                      <td className={`${tdCls} ${monoCls} text-right ${l.recoverySource === "fallback" ? "text-danger" : "text-ok"}`}>
                        {l.recoveryPct.toFixed(0)}%
                        <span className="ml-1 text-[10px] text-muted">{l.recoverySource}</span>
                      </td>
                      <td className={`${tdCls} ${monoCls} text-right`}>{money(l.grossValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      <div className={panelCls}>
        <div className="border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
          Your recovery history — what these estimates are built on
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              <th className={thCls}>Category</th>
              <th className={thCls + " text-right"}>Sales</th>
              <th className={thCls + " text-right"}>% of MSRP recovered</th>
              <th className={thCls + " text-right"}>Days to sell</th>
            </tr>
          </thead>
          <tbody>
            {knownCategories.map((c) => (
              <tr key={c.key} className="hover:bg-raised/60">
                <td className={tdCls}>{label(c.key)}</td>
                <td className={`${tdCls} ${monoCls} text-right`}>{c.soldCount}</td>
                <td className={`${tdCls} ${monoCls} text-right`}>{c.avgRecoveryPct === null ? "—" : `${c.avgRecoveryPct.toFixed(0)}%`}</td>
                <td className={`${tdCls} ${monoCls} text-right`}>{c.avgDaysToSell === null ? "—" : `${c.avgDaysToSell.toFixed(0)}d`}</td>
              </tr>
            ))}
            {knownCategories.length === 0 ? (
              <tr><td className={tdCls + " text-muted"} colSpan={4}>
                No sales yet — every line will use the fallback recovery rate.
              </td></tr>
            ) : null}
          </tbody>
        </table>
        <p className="px-3 py-2 text-[11px] text-muted">
          Recognised categories: {CATEGORIES.map((c) => label(c)).join(", ")}. Anything else is treated as Mixed.
        </p>
      </div>
    </div>
  );
}

function Field({ label: text, value, onChange }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div>
      <label className={labelCls}>{text}</label>
      <input className={inputNarrowCls + " w-24"} value={value} onChange={onChange} />
    </div>
  );
}
