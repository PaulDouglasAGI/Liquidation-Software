"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { inputCls, inputNarrowCls, selectCls, selectNarrowCls, btnCls, btnPrimaryCls, btnDangerCls, labelCls, monoCls, panelCls } from "@/components/ui";
import { CATEGORIES, CONDITIONS, ITEM_STATUSES, PLATFORMS, label } from "@/lib/constants";
import { money, pct, dateStr } from "@/lib/format";

export interface ItemData {
  id: string;
  sku: string;
  upc: string | null;
  name: string;
  brand: string | null;
  category: string;
  condition: string;
  conditionNotes: string | null;
  msrp: number | null;
  ourCost: number;
  sellPrice: number | null;
  soldPrice: number | null;
  photos: string[];
  serialNumber: string | null;
  weightLbs: number | null;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
  storageLocation: string | null;
  status: string;
  platform: string | null;
  listingUrl: string | null;
  listingIdEbay: string | null;
  dateListed: string | null;
  dateSold: string | null;
  dateReturned: string | null;
  returnReason: string | null;
  orderId: string | null;
  notes: string | null;
  palletId: string;
  palletCode: string;
  updatedAt: string;
}

interface MarketResult {
  source: "SOLD" | "ACTIVE";
  count: number;
  avg: number | null;
  low: number | null;
  high: number | null;
  samples: { title: string; price: number; url?: string }[];
}

const s = (v: string | number | null) => (v === null || v === undefined ? "" : String(v));

export default function ItemEditor({ item, locations }: { item: ItemData; locations: string[] }) {
  const router = useRouter();
  const [form, setForm] = useState({
    upc: s(item.upc),
    name: item.name,
    brand: s(item.brand),
    category: item.category,
    condition: item.condition,
    conditionNotes: s(item.conditionNotes),
    msrp: s(item.msrp),
    ourCost: s(item.ourCost),
    sellPrice: s(item.sellPrice),
    soldPrice: s(item.soldPrice),
    serialNumber: s(item.serialNumber),
    weightLbs: s(item.weightLbs),
    lengthIn: s(item.lengthIn),
    widthIn: s(item.widthIn),
    heightIn: s(item.heightIn),
    storageLocation: s(item.storageLocation),
    returnReason: s(item.returnReason),
    status: item.status,
    platform: s(item.platform),
    listingUrl: s(item.listingUrl),
    orderId: s(item.orderId),
    notes: s(item.notes),
  });
  const [photos, setPhotos] = useState(item.photos);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [market, setMarket] = useState<MarketResult | null>(null);
  const [marketMsg, setMarketMsg] = useState("");
  const [fbText, setFbText] = useState("");
  const [selling, setSelling] = useState(false);
  const [sellForm, setSellForm] = useState({ soldPrice: "", platform: "" });

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  // Live margin
  const price = parseFloat(form.sellPrice);
  const cost = parseFloat(form.ourCost) || 0;
  const profit = Number.isFinite(price) ? price - cost : null;
  const margin = profit !== null && price > 0 ? (profit / price) * 100 : null;

  async function save() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // expectedUpdatedAt: refuse to overwrite changes made elsewhere
      body: JSON.stringify({ ...form, expectedUpdatedAt: item.updatedAt }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: "Saved" } : { ok: false, text: data.error ?? "Save failed" });
    if (res.ok) router.refresh();
  }

  // S = save shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [form]); // eslint-disable-line react-hooks/exhaustive-deps

  async function remove() {
    if (!confirm(`Delete ${item.sku}? This cannot be undone.`)) return;
    const res = await fetch(`/api/items/${item.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push(`/pallets/${item.palletId}`);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setMsg({ ok: false, text: data.error ?? "Delete failed" });
    }
  }

  function openQuickSell() {
    setSellForm({
      soldPrice: form.sellPrice || "",
      platform: form.platform || "EBAY",
    });
    setSelling(true);
  }

  async function confirmQuickSell() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "SOLD", soldPrice: sellForm.soldPrice, platform: sellForm.platform }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setSelling(false);
      setMsg({ ok: true, text: "Marked sold" });
      router.refresh();
      setForm((f) => ({ ...f, status: "SOLD", soldPrice: sellForm.soldPrice, platform: sellForm.platform }));
    } else {
      setMsg({ ok: false, text: data.error ?? "Failed to mark sold" });
    }
  }

  async function marketCheck() {
    setMarketMsg("Checking eBay…");
    setMarket(null);
    const qs = form.upc ? `upc=${encodeURIComponent(form.upc)}` : `q=${encodeURIComponent(`${form.brand} ${form.name}`.trim())}`;
    const res = await fetch(`/api/market-check?${qs}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMarket(data);
      setMarketMsg("");
    } else {
      setMarketMsg(data.error ?? "Market check failed");
    }
  }

  async function pushEbay() {
    if (!confirm("Push a live fixed-price listing to eBay now?")) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/items/${item.id}/list/ebay`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: `Listed on eBay: ${data.itemId}` } : { ok: false, text: data.error ?? "eBay push failed" });
    if (res.ok) router.refresh();
  }

  async function facebookExport() {
    const res = await fetch(`/api/items/${item.id}/facebook`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setFbText(data.text);
      try {
        await navigator.clipboard.writeText(data.text);
        setMsg({ ok: true, text: "Facebook post text copied to clipboard" });
      } catch {
        setMsg({ ok: true, text: "Facebook text generated below (clipboard unavailable)" });
      }
    }
  }

  async function uploadPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    const fd = new FormData();
    Array.from(files).slice(0, 8).forEach((f) => fd.append("photos", f));
    const res = await fetch(`/api/items/${item.id}/photos`, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setPhotos(data.photos);
    else setMsg({ ok: false, text: data.error ?? "Upload failed" });
  }

  async function deletePhoto(p: string) {
    if (!confirm("Delete this photo?")) return;
    const res = await fetch(`/api/items/${item.id}/photos?photo=${encodeURIComponent(p)}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setPhotos(data.photos);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className={`${monoCls} text-base font-bold text-accent`}>{item.sku}</h1>
        <Link href={`/pallets/${item.palletId}`} className={`${monoCls} text-[12px] text-muted hover:text-accent`}>{item.palletCode}</Link>
        {item.listingUrl ? (
          <a href={item.listingUrl} target="_blank" rel="noreferrer" className="text-[12px] text-accent hover:underline">View listing ↗</a>
        ) : null}
        <span className="text-[12px] text-muted">
          {item.dateListed ? `Listed ${dateStr(item.dateListed)}` : "Not listed"}
          {item.dateSold ? ` · Sold ${dateStr(item.dateSold)}` : ""}
          {item.dateReturned ? ` · Returned ${dateStr(item.dateReturned)}` : ""}
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {/* Left: main fields */}
        <div className={panelCls + " p-3 lg:col-span-2"}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="col-span-2 md:col-span-3">
              <label className={labelCls}>Product name</label>
              <input className={inputCls} value={form.name} onChange={set("name")} />
            </div>
            <div>
              <label className={labelCls}>UPC</label>
              <input className={inputCls + " font-mono"} value={form.upc} onChange={set("upc")} />
            </div>
            <div>
              <label className={labelCls}>Brand</label>
              <input className={inputCls} value={form.brand} onChange={set("brand")} />
            </div>
            <div>
              <label className={labelCls}>Category</label>
              <select className={selectCls} value={form.category} onChange={set("category")}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Condition</label>
              <select className={selectCls} value={form.condition} onChange={set("condition")}>
                {CONDITIONS.map((c) => <option key={c} value={c}>{label(c)}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Serial #</label>
              <input className={inputCls + " font-mono"} value={form.serialNumber} onChange={set("serialNumber")} />
            </div>
            <div className="col-span-2 md:col-span-4">
              <label className={labelCls}>Condition notes</label>
              <input className={inputCls} value={form.conditionNotes} onChange={set("conditionNotes")} />
            </div>

            <div>
              <label className={labelCls}>Weight (lbs)</label>
              <input type="number" step="0.1" className={inputCls + " font-mono"} value={form.weightLbs} onChange={set("weightLbs")} />
            </div>
            {(["lengthIn", "widthIn", "heightIn"] as const).map((k, i) => (
              <div key={k}>
                <label className={labelCls}>{["L", "W", "H"][i]} (in)</label>
                <input type="number" step="0.1" className={inputCls + " font-mono"} value={form[k]} onChange={set(k)} />
              </div>
            ))}

            <div>
              <label className={labelCls}>Status</label>
              <select className={selectCls} value={form.status} onChange={set("status")}>
                {ITEM_STATUSES.map((st) => <option key={st} value={st}>{label(st)}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Platform</label>
              <select className={selectCls} value={form.platform} onChange={set("platform")}>
                <option value="">—</option>
                {PLATFORMS.map((p) => <option key={p} value={p}>{label(p)}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Location</label>
              <input list="item-locations" className={inputCls + " font-mono"} value={form.storageLocation} onChange={set("storageLocation")} />
              <datalist id="item-locations">
                {locations.map((l) => <option key={l} value={l} />)}
              </datalist>
            </div>
            <div>
              <label className={labelCls}>Order ID</label>
              <input className={inputCls + " font-mono"} value={form.orderId} onChange={set("orderId")} />
            </div>
            <div className="col-span-2 md:col-span-2">
              <label className={labelCls}>Listing URL</label>
              <input className={inputCls} value={form.listingUrl} onChange={set("listingUrl")} />
            </div>
            <div className="col-span-2 md:col-span-2">
              <label className={labelCls}>Notes</label>
              <input className={inputCls} value={form.notes} onChange={set("notes")} />
            </div>
            {form.status === "RETURNED" || item.returnReason ? (
              <div className="col-span-2 md:col-span-4">
                <label className={labelCls}>Return reason</label>
                <input className={inputCls} value={form.returnReason} onChange={set("returnReason")} placeholder="Defective, buyer remorse, wrong item…" />
              </div>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button disabled={busy} className={btnPrimaryCls} onClick={() => void save()}>Save <span className="font-mono text-[10px]">(S)</span></button>
            {form.status !== "SOLD" ? (
              <button disabled={busy} className={btnPrimaryCls} onClick={openQuickSell}>Mark Sold</button>
            ) : null}
            <button disabled={busy} className={btnCls} onClick={() => void pushEbay()}>Push to eBay</button>
            <a className={btnCls} href={`/api/listings/amazon?ids=${item.id}`}>Amazon flat file</a>
            <button disabled={busy} className={btnCls} onClick={() => void facebookExport()}>Facebook export</button>
            <Link className={btnCls} href={`/labels?ids=${item.id}`}>Print label</Link>
            <button disabled={busy} className={btnDangerCls} onClick={() => void remove()}>Delete</button>
            {msg ? <span className={`text-[12px] ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</span> : null}
          </div>

          {selling ? (
            <div className="mt-3 flex flex-wrap items-end gap-2 border border-accent/50 bg-accent/5 p-2">
              <div>
                <label className={labelCls}>Sold price ($)</label>
                <input
                  autoFocus
                  type="number" step="0.01" min="0"
                  className={inputNarrowCls + " w-28 font-mono"}
                  value={sellForm.soldPrice}
                  onChange={(e) => setSellForm((f) => ({ ...f, soldPrice: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void confirmQuickSell())}
                />
              </div>
              <div>
                <label className={labelCls}>Platform</label>
                <select className={selectNarrowCls + " w-auto"} value={sellForm.platform} onChange={(e) => setSellForm((f) => ({ ...f, platform: e.target.value }))}>
                  {PLATFORMS.map((p) => <option key={p} value={p}>{label(p)}</option>)}
                </select>
              </div>
              <button disabled={busy} className={btnPrimaryCls} onClick={() => void confirmQuickSell()}>Confirm sale</button>
              <button className={btnCls} onClick={() => setSelling(false)}>Cancel</button>
            </div>
          ) : null}

          {fbText ? (
            <pre className="mt-3 whitespace-pre-wrap border border-edge bg-raised p-2 font-mono text-[12px] text-zinc-300">{fbText}</pre>
          ) : null}
        </div>

        {/* Right: pricing + market + photos */}
        <div className="space-y-3">
          <div className={panelCls + " p-3"}>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Pricing</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={labelCls}>MSRP</label>
                <input type="number" step="0.01" className={inputCls + " font-mono"} value={form.msrp} onChange={set("msrp")} />
              </div>
              <div>
                <label className={labelCls}>Cost</label>
                <input type="number" step="0.01" className={inputCls + " font-mono"} value={form.ourCost} onChange={set("ourCost")} />
              </div>
              <div>
                <label className={labelCls}>Sell price</label>
                <input type="number" step="0.01" className={inputCls + " font-mono"} value={form.sellPrice} onChange={set("sellPrice")} />
              </div>
            </div>
            <div className="mt-2 flex justify-between border-t border-edge pt-2 text-[13px]">
              <span className="text-muted">Est. profit / margin</span>
              <span className={`${monoCls} ${profit !== null && profit >= 0 ? "text-ok" : "text-danger"}`}>
                {profit !== null ? `${money(profit)} · ${pct(margin)}` : "—"}
              </span>
            </div>
            {form.status === "SOLD" || item.soldPrice !== null ? (
              <div className="mt-2">
                <label className={labelCls}>Sold price</label>
                <input type="number" step="0.01" className={inputCls + " font-mono"} value={form.soldPrice} onChange={set("soldPrice")} />
              </div>
            ) : null}
            <button className={btnCls + " mt-3 w-full"} onClick={() => void marketCheck()}>Market Check (eBay)</button>
            {marketMsg ? <div className="mt-2 text-[12px] text-amber-300">{marketMsg}</div> : null}
            {market ? (
              <div className="mt-2 text-[12px]">
                <div className="mb-1 text-muted">
                  {market.source === "SOLD" ? "Sold listings, last 90 days" : "Active listings (sold data needs Marketplace Insights access)"} · {market.count} found
                </div>
                <div className={`${monoCls} mb-2 flex justify-between`}>
                  <span>Low {money(market.low)}</span>
                  <span className="text-accent">Avg {money(market.avg)}</span>
                  <span>High {money(market.high)}</span>
                </div>
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {market.samples.map((sm, i) => (
                    <div key={i} className="flex justify-between gap-2 border-b border-edge/60 pb-1">
                      {sm.url ? (
                        <a href={sm.url} target="_blank" rel="noreferrer" className="truncate hover:text-accent">{sm.title}</a>
                      ) : (
                        <span className="truncate">{sm.title}</span>
                      )}
                      <span className={monoCls}>{money(sm.price)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className={panelCls + " p-3"}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Photos ({photos.length}/8)</span>
              <label className={btnCls + " cursor-pointer"}>
                + Add
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => void uploadPhotos(e.target.files)} />
              </label>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {photos.map((p) => (
                <div key={p} className="group relative aspect-square border border-edge bg-raised">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/uploads/${p}`} alt="" className="h-full w-full object-cover" />
                  <button
                    onClick={() => void deletePhoto(p)}
                    className="absolute right-0 top-0 hidden bg-danger px-1.5 text-[11px] text-white group-hover:block cursor-pointer"
                  >
                    ×
                  </button>
                </div>
              ))}
              {photos.length === 0 ? <div className="col-span-3 py-4 text-center text-[12px] text-muted">No photos</div> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
