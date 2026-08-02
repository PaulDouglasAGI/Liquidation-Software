"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { inputCls, selectCls, btnCls, btnPrimaryCls, labelCls, monoCls, panelCls } from "@/components/ui";
import { CATEGORIES, CONDITIONS, label } from "@/lib/constants";
import type { Html5Qrcode } from "html5-qrcode";
import AiIdentify, { type AiSuggestion } from "@/components/AiIdentify";

interface PalletOpt {
  id: string;
  code: string;
  supplier: string;
  category: string;
  totalCost: number;
  itemCount: number;
}

interface QueuedItem {
  payload: Record<string, unknown>;
  queuedAt: string;
}

const QUEUE_KEY = "liq-intake-queue";

const emptyForm = {
  upc: "",
  name: "",
  brand: "",
  category: "",
  condition: "GOOD",
  conditionNotes: "",
  msrp: "",
  ourCost: "",
  sellPrice: "",
  serialNumber: "",
  weightLbs: "",
  lengthIn: "",
  widthIn: "",
  heightIn: "",
  storageLocation: "",
  notes: "",
};

function readQueue(): QueuedItem[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export default function IntakeClient({
  pallets,
  locations,
  defaultPricePct,
  preselectedPalletId,
}: {
  pallets: PalletOpt[];
  locations: string[];
  defaultPricePct: number;
  preselectedPalletId: string | null;
}) {
  const [palletId, setPalletId] = useState(
    preselectedPalletId && pallets.some((p) => p.id === preselectedPalletId)
      ? preselectedPalletId
      : pallets[0]?.id ?? ""
  );
  const [form, setForm] = useState(emptyForm);
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [qty, setQty] = useState(1);
  const [autoScan, setAutoScan] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [looking, setLooking] = useState(false);
  const [lookupMsg, setLookupMsg] = useState("");
  const [duplicate, setDuplicate] = useState<{
    count: number; inStockCount: number; soldCount: number;
    avgSoldPrice: number | null; lastSoldPrice: number | null;
    template: { name: string; storageLocation: string | null };
    recent: { id: string; sku: string; status: string; palletCode: string; storageLocation: string | null }[];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [queued, setQueued] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const pallet = pallets.find((p) => p.id === palletId);
  // Mirrors the server's spread: pallet cost ÷ (existing + this batch)
  const costEstimate = pallet ? pallet.totalCost / (pallet.itemCount + savedCount + qty) : 0;

  const set = (k: keyof typeof emptyForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  // ---- pricing preview ----
  const msrpNum = parseFloat(form.msrp);
  const autoPrice = Number.isFinite(msrpNum) ? Math.round(msrpNum * defaultPricePct) / 100 : null;
  const effPrice = form.sellPrice !== "" ? parseFloat(form.sellPrice) : autoPrice;
  const effCost = form.ourCost !== "" ? parseFloat(form.ourCost) : costEstimate;
  const profit = effPrice !== null && Number.isFinite(effPrice) ? effPrice - effCost : null;
  const margin = profit !== null && effPrice ? (profit / effPrice) * 100 : null;

  // ---- offline queue ----
  const flushing = useRef(false);
  const flushQueue = useCallback(async () => {
    // Guard against concurrent flushes (mount + 'online' event + manual tap
    // can coincide) — without this every queued scan gets created twice.
    if (flushing.current) return;
    flushing.current = true;
    try {
      // Pop one entry at a time and persist immediately, so an interrupted
      // flush (tab closed mid-sync) can never re-send an already-created item.
      for (;;) {
        const q = readQueue();
        if (q.length === 0) break;
        const [entry, ...rest] = q;
        try {
          const res = await fetch("/api/items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(entry.payload),
          });
          if (res.status === 401 || res.status === 403) break; // logged out — keep queue, sync after login
          if (res.status >= 500) break; // server trouble — retry later
          // Created (2xx) or unfixable (400/404: bad data, pallet deleted):
          // either way remove the entry so the queue can't jam forever.
        } catch {
          break; // still offline — leave the queue as-is
        }
        localStorage.setItem(QUEUE_KEY, JSON.stringify(rest));
      }
    } finally {
      flushing.current = false;
      setQueued(readQueue().length);
    }
  }, []);

  // "Scan next automatically" preference survives page reloads
  useEffect(() => {
    const t = setTimeout(() => setAutoScan(localStorage.getItem("liq-intake-autoscan") === "1"), 0);
    return () => clearTimeout(t);
  }, []);
  function toggleAutoScan(on: boolean) {
    setAutoScan(on);
    localStorage.setItem("liq-intake-autoscan", on ? "1" : "0");
  }

  function addPhotos(files: FileList | null) {
    if (!files) return;
    setPhotos((cur) => {
      const room = Math.max(0, 8 - cur.length);
      const accepted = Array.from(files).slice(0, room);
      return [...cur, ...accepted.map((file) => ({ file, url: URL.createObjectURL(file) }))];
    });
  }
  function removePhoto(url: string) {
    URL.revokeObjectURL(url);
    setPhotos((cur) => cur.filter((p) => p.url !== url));
  }
  function clearPhotos() {
    setPhotos((cur) => {
      cur.forEach((p) => URL.revokeObjectURL(p.url));
      return [];
    });
  }

  useEffect(() => {
    const onOnline = () => void flushQueue();
    window.addEventListener("online", onOnline);
    const initial = setTimeout(() => void flushQueue(), 0); // pick up anything queued from a previous session
    return () => {
      clearTimeout(initial);
      window.removeEventListener("online", onOnline);
    };
  }, [flushQueue]);

  // ---- barcode scanning ----
  async function startScan() {
    if (scannerRef.current) await stopScan(); // never stack a second instance on the same div
    setScanning(true);
    setLookupMsg("");
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("scanner-region");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 280, height: 160 } },
        (decoded) => {
          void stopScan();
          const code = decoded.replace(/\D/g, "");
          setForm((f) => ({ ...f, upc: code }));
          if (code.length >= 8) void lookup(code);
        },
        () => {} // per-frame decode misses are expected
      );
    } catch (e) {
      setScanning(false);
      setLookupMsg(e instanceof Error ? `Camera error: ${e.message}` : "Camera unavailable");
    }
  }

  async function stopScan() {
    const s = scannerRef.current;
    scannerRef.current = null;
    setScanning(false);
    if (s) {
      try {
        await s.stop();
        s.clear();
      } catch {
        // already stopped
      }
    }
  }

  useEffect(() => () => void stopScan(), []);

  // ---- UPC lookup ----
  async function lookup(code?: string) {
    const upc = (code ?? form.upc).replace(/\D/g, "");
    if (upc.length < 8) {
      setLookupMsg("Enter at least 8 digits");
      return;
    }
    setLooking(true);
    setLookupMsg("");
    try {
      // Have we handled this exact product before? Our own history beats an
      // external catalogue: it knows what the item actually sold for.
      const dupRes = await fetch(`/api/items/duplicate?upc=${upc}`);
      const dup = dupRes.ok ? await dupRes.json() : { found: false };
      setDuplicate(dup.found ? dup : null);

      const res = await fetch(`/api/upc?code=${upc}`);
      const data = await res.json();
      if (res.ok && data.found) {
        setForm((f) => ({
          ...f,
          upc,
          name: data.name ?? f.name,
          brand: data.brand ?? f.brand,
          msrp: data.msrp ? String(data.msrp) : f.msrp,
        }));
        setLookupMsg(`Found: ${data.name ?? "product"}${data.msrp ? ` · MSRP $${data.msrp}` : ""}`);
      } else if (dup.found) {
        // No catalogue match, but we have taken this in before — use that.
        setForm((f) => ({
          ...f,
          upc,
          name: dup.template.name ?? f.name,
          brand: dup.template.brand ?? f.brand,
          category: dup.template.category ?? f.category,
          msrp: dup.template.msrp ? String(dup.template.msrp) : f.msrp,
        }));
        setLookupMsg(`Matched your own history: ${dup.template.name}`);
      } else {
        setLookupMsg(data.error ? `Lookup failed: ${data.error}` : "No match — enter details manually");
        nameRef.current?.focus();
      }
    } catch {
      setLookupMsg("Lookup unavailable (offline?) — enter details manually");
      nameRef.current?.focus();
    }
    setLooking(false);
  }

  // ---- save ----
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!palletId) {
      setSaveMsg({ ok: false, text: "Create a pallet first" });
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    const payload: Record<string, unknown> = { ...form, palletId, qty };
    for (const k of Object.keys(payload)) if (payload[k] === "") delete payload[k];
    if (!form.category && pallet) payload.category = pallet.category;

    const resetForNext = () => {
      setForm((f) => ({ ...emptyForm, condition: f.condition, storageLocation: f.storageLocation }));
      clearPhotos();
      setQty(1);
    };

    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveMsg({ ok: false, text: data.error ?? "Save failed" });
        setSaving(false);
        return;
      }
      // Item is created from here on — a photo-upload failure must NOT fall
      // into the offline-queue catch (that would re-create the item on sync).
      let photoNote = "";
      if (photos.length > 0) {
        try {
          const fd = new FormData();
          photos.slice(0, 8).forEach((p) => fd.append("photos", p.file));
          const up = await fetch(`/api/items/${data.id}/photos`, { method: "POST", body: fd });
          photoNote = up.ok ? ` · ${photos.length} photo(s)` : " · photo upload FAILED — add them on the item page";
        } catch {
          photoNote = " · photos didn't upload (offline?) — add them on the item page";
        }
      }
      setSavedCount((c) => c + (data.count ?? 1));
      setSaveMsg({ ok: true, text: `Saved ${data.sku}${data.count > 1 ? ` ×${data.count}` : ""}${photoNote}` });
      resetForNext();
      if (autoScan) void startScan(); // straight into the next barcode
    } catch {
      // Offline: queue it (photos can't be queued)
      const q = readQueue();
      q.push({ payload, queuedAt: new Date().toISOString() });
      localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
      setQueued(q.length);
      setSaveMsg({ ok: true, text: `Offline — item queued (${q.length} pending). Photos not queued.` });
      resetForNext();
    }
    setSaving(false);
  }

  if (pallets.length === 0) {
    return (
      <div className={panelCls + " p-4 text-[13px]"}>
        No open pallets. <Link href="/pallets" className="text-accent hover:underline">Create a pallet</Link> before adding items.
      </div>
    );
  }

  return (
    <form onSubmit={save} className="mx-auto max-w-xl space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold text-zinc-100">Item Intake</h1>
        {queued > 0 ? (
          <button type="button" onClick={() => void flushQueue()} className="text-[12px] text-accent hover:underline">
            {queued} queued offline — tap to sync
          </button>
        ) : null}
      </div>

      <div>
        <label className={labelCls}>Pallet</label>
        <select className={selectCls + " py-2.5"} value={palletId} onChange={(e) => { setPalletId(e.target.value); setSavedCount(0); }}>
          {pallets.map((p) => (
            <option key={p.id} value={p.id}>{p.code} · {p.supplier} · {p.itemCount} items</option>
          ))}
        </select>
      </div>

      {/* Scanner front and center */}
      <div className={panelCls + " p-3"}>
        <div id="scanner-region" className={scanning ? "mb-2" : "hidden"} />
        <div className="flex gap-2">
          {!scanning ? (
            <button type="button" onClick={() => void startScan()} className={btnPrimaryCls + " flex-1 py-3 text-center text-sm"}>
              SCAN BARCODE
            </button>
          ) : (
            <button type="button" onClick={() => void stopScan()} className={btnCls + " flex-1 py-3 text-center"}>
              Stop camera
            </button>
          )}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            className={inputCls + " font-mono py-2.5"}
            inputMode="numeric"
            placeholder="UPC / barcode"
            value={form.upc}
            onChange={set("upc")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void lookup();
              }
            }}
          />
          <button type="button" disabled={looking} onClick={() => void lookup()} className={btnCls + " py-2.5"}>
            {looking ? "…" : "Lookup"}
          </button>
        </div>
        {lookupMsg ? <div className="mt-1.5 text-[12px] text-amber-300">{lookupMsg}</div> : null}

        {/* We have taken this exact product in before — reuse what we learned
            rather than re-keying it and re-guessing the price. */}
        {duplicate ? (
          <div className="mt-2 border border-accent/40 bg-accent/5 px-2 py-1.5 text-[12px]">
            <div className="font-semibold text-accent">
              Seen before — {duplicate.count} unit(s): {duplicate.inStockCount} on hand, {duplicate.soldCount} sold
            </div>
            {duplicate.avgSoldPrice !== null ? (
              <div className="text-zinc-300">
                Sold for an average of ${duplicate.avgSoldPrice.toFixed(2)}
                {duplicate.lastSoldPrice !== null ? ` (last: $${duplicate.lastSoldPrice.toFixed(2)})` : ""}
                <button
                  type="button"
                  className="ml-2 text-accent underline"
                  onClick={() => setForm((f) => ({ ...f, sellPrice: String(duplicate.avgSoldPrice) }))}
                >
                  use that price
                </button>
              </div>
            ) : null}
            {duplicate.template.storageLocation ? (
              <div className="text-muted">
                Usually shelved at {duplicate.template.storageLocation}
                <button
                  type="button"
                  className="ml-2 text-accent underline"
                  onClick={() => setForm((f) => ({ ...f, storageLocation: duplicate.template.storageLocation ?? "" }))}
                >
                  use it
                </button>
              </div>
            ) : null}
            <div className="mt-0.5 text-muted">
              {duplicate.recent.map((r) => (
                <Link key={r.id} href={`/items/${r.id}`} className={`${monoCls} mr-2 text-accent hover:underline`}>
                  {r.sku}
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {/* Photo → draft listing. Suggests; never overwrites without a tap. */}
        <div className="mt-2">
          <AiIdentify
            upc={form.upc}
            onApply={(s: AiSuggestion) =>
              setForm((f) => ({
                ...f,
                name: s.name || f.name,
                brand: s.brand ?? f.brand,
                category: s.category || f.category,
                condition: s.condition || f.condition,
                conditionNotes: s.conditionNotes ?? f.conditionNotes,
                msrp: s.msrp !== null ? String(s.msrp) : f.msrp,
              }))
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={labelCls}>Product name *</label>
          <input ref={nameRef} required className={inputCls + " py-2.5"} value={form.name} onChange={set("name")} />
        </div>
        <div>
          <label className={labelCls}>Brand</label>
          <input className={inputCls + " py-2.5"} value={form.brand} onChange={set("brand")} />
        </div>
        <div>
          <label className={labelCls}>Category</label>
          <select className={selectCls + " py-2.5"} value={form.category || (pallet?.category ?? "MIXED")} onChange={set("category")}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
          </select>
        </div>

        <div className="col-span-2">
          <label className={labelCls}>Condition</label>
          <div className="grid grid-cols-5 gap-1">
            {CONDITIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setForm((f) => ({ ...f, condition: c }))}
                className={`border px-1 py-2.5 text-[11px] cursor-pointer ${
                  form.condition === c ? "border-accent bg-accent/15 text-accent" : "border-edge bg-raised text-zinc-400"
                }`}
              >
                {label(c)}
              </button>
            ))}
          </div>
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Condition notes</label>
          <input className={inputCls + " py-2.5"} value={form.conditionNotes} onChange={set("conditionNotes")} placeholder="Scratches, missing battery, open box…" />
        </div>

        <div>
          <label className={labelCls}>MSRP ($)</label>
          <input type="number" step="0.01" min="0" inputMode="decimal" className={inputCls + " font-mono py-2.5"} value={form.msrp} onChange={set("msrp")} />
        </div>
        <div>
          <label className={labelCls}>Our cost ($)</label>
          <input
            type="number" step="0.01" min="0" inputMode="decimal"
            className={inputCls + " font-mono py-2.5"}
            value={form.ourCost}
            onChange={set("ourCost")}
            placeholder={costEstimate ? costEstimate.toFixed(2) + " auto" : "auto"}
          />
        </div>
        <div>
          <label className={labelCls}>Sell price ($)</label>
          <input
            type="number" step="0.01" min="0" inputMode="decimal"
            className={inputCls + " font-mono py-2.5"}
            value={form.sellPrice}
            onChange={set("sellPrice")}
            placeholder={autoPrice !== null ? `${autoPrice.toFixed(2)} (${defaultPricePct}% MSRP)` : `${defaultPricePct}% of MSRP`}
          />
        </div>
        <div className="flex flex-col justify-end pb-1">
          {profit !== null && Number.isFinite(profit) ? (
            <div className={`${monoCls} text-right ${profit >= 0 ? "text-ok" : "text-danger"}`}>
              {profit >= 0 ? "+" : ""}{profit.toFixed(2)} · {margin !== null ? margin.toFixed(0) : "—"}%
            </div>
          ) : (
            <div className="text-right text-[12px] text-muted">margin —</div>
          )}
        </div>

        <div>
          <label className={labelCls}>Serial #</label>
          <input className={inputCls + " font-mono py-2.5"} value={form.serialNumber} onChange={set("serialNumber")} />
        </div>
        <div>
          <label className={labelCls}>Weight (lbs)</label>
          <input type="number" step="0.1" min="0" inputMode="decimal" className={inputCls + " font-mono py-2.5"} value={form.weightLbs} onChange={set("weightLbs")} />
        </div>
        <div className="col-span-2 grid grid-cols-3 gap-2">
          {(["lengthIn", "widthIn", "heightIn"] as const).map((k, i) => (
            <div key={k}>
              <label className={labelCls}>{["L", "W", "H"][i]} (in)</label>
              <input type="number" step="0.1" min="0" inputMode="decimal" className={inputCls + " font-mono py-2.5"} value={form[k]} onChange={set(k)} />
            </div>
          ))}
        </div>
        <div>
          <label className={labelCls}>Location</label>
          <input list="locations" className={inputCls + " font-mono py-2.5"} value={form.storageLocation} onChange={set("storageLocation")} placeholder="SHELF-A3" />
          <datalist id="locations">
            {locations.map((l) => <option key={l} value={l} />)}
          </datalist>
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Notes</label>
          <input className={inputCls + " py-2.5"} value={form.notes} onChange={set("notes")} />
        </div>

        {/* Photos: repeat "Take photo" for shot-after-shot, thumbnails with remove */}
        <div className="col-span-2">
          <label className={labelCls}>Photos ({photos.length}/8)</label>
          <div className="flex flex-wrap items-center gap-2">
            <label className={btnCls + " cursor-pointer py-2.5"}>
              Take photo
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
            </label>
            <label className={btnCls + " cursor-pointer py-2.5"}>
              Gallery
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
            </label>
            {photos.map((p) => (
              <span key={p.url} className="relative inline-block h-12 w-12 border border-edge">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="h-full w-full object-cover" />
                <button type="button" onClick={() => removePhoto(p.url)} className="absolute -right-1.5 -top-1.5 h-4 w-4 bg-danger text-center text-[10px] leading-4 text-white cursor-pointer">×</button>
              </span>
            ))}
          </div>
        </div>
      </div>

      {saveMsg ? (
        <div className={`text-[13px] ${saveMsg.ok ? "text-ok" : "text-danger"}`}>{saveMsg.text}</div>
      ) : null}

      {/* Save row: quantity stepper for identical units + auto-rescan toggle */}
      <div className="flex items-stretch gap-2">
        <div className="flex shrink-0 items-center border border-edge bg-raised">
          <button type="button" className="px-3 py-3 text-lg text-zinc-300 cursor-pointer" onClick={() => setQty((n) => Math.max(1, n - 1))}>−</button>
          <span className="min-w-8 text-center font-mono text-sm">×{qty}</span>
          <button type="button" className="px-3 py-3 text-lg text-zinc-300 cursor-pointer" onClick={() => setQty((n) => Math.min(50, n + 1))}>+</button>
        </div>
        <button type="submit" disabled={saving} className={btnPrimaryCls + " flex-1 py-3 text-sm"}>
          {saving ? "Saving…" : qty > 1 ? `SAVE ${qty} IDENTICAL ITEMS` : "SAVE ITEM"}
        </button>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-[12px] text-zinc-400">
        <input type="checkbox" checked={autoScan} onChange={(e) => toggleAutoScan(e.target.checked)} />
        Continuous mode — reopen the scanner after each save
      </label>
    </form>
  );
}
