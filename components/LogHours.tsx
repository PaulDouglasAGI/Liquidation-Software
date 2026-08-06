"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LABOR_ACTIVITIES, label } from "@/lib/constants";

export interface LaborTarget {
  id: string;
  code: string;
  source: string;
  status: string;
}

const LAST_LOT_KEY = "liq.lastLaborLot";
const LAST_ACTIVITY_KEY = "liq.lastLaborActivity";

/**
 * Persistent "Log hours" button, on every screen.
 *
 * Hours get logged after physical work, one-handed, usually on a phone with a
 * boxcutter in the other hand. If it takes more than a few seconds nobody does
 * it, and every labor-derived metric in the app quietly stops working. So:
 * the lot and the activity remember what you picked last time, the hours are
 * one tap from a preset, and Save is always reachable with a thumb.
 */
export default function LogHours({ targets }: { targets: LaborTarget[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [palletId, setPalletId] = useState(targets[0]?.id ?? "");
  const [activity, setActivity] = useState<string>("TESTING_SORTING");
  const [hours, setHours] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const hoursRef = useRef<HTMLInputElement>(null);

  /**
   * Same lot and same job as last time is right far more often than not — a
   * lot takes several sessions over several days. Restored when the sheet
   * opens rather than on mount: localStorage does not exist during SSR, and
   * this is the moment the values are actually needed.
   */
  function openSheet() {
    const lastLot = localStorage.getItem(LAST_LOT_KEY);
    if (lastLot && targets.some((t) => t.id === lastLot)) setPalletId(lastLot);
    const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (lastActivity && (LABOR_ACTIVITIES as readonly string[]).includes(lastActivity)) {
      setActivity(lastActivity);
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    hoursRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/labor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ palletId, hours, activity, notes: notes.trim() || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save those hours");
      return;
    }
    localStorage.setItem(LAST_LOT_KEY, palletId);
    localStorage.setItem(LAST_ACTIVITY_KEY, activity);
    // Confirm against the running total, so a double-tap is visible rather
    // than silently logging the same session twice.
    setDone(`Logged ${data.hours}h on ${data.palletCode} — ${data.totalHours}h total`);
    setHours("");
    setNotes("");
    setOpen(false);
    router.refresh();
    setTimeout(() => setDone(""), 4000);
  }

  if (targets.length === 0) return null;

  return (
    <>
      {done ? (
        <div className="fixed bottom-20 right-3 z-50 max-w-[92vw] border border-ok/60 bg-surface px-3 py-2 text-[13px] text-ok shadow-lg md:bottom-16">
          {done}
        </div>
      ) : null}

      {!open ? (
        <button
          onClick={openSheet}
          aria-label="Log hours"
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 border border-accent bg-surface px-4 py-3 text-[14px] font-medium text-accent shadow-lg hover:bg-accent/10 active:bg-accent/20 cursor-pointer"
        >
          <span aria-hidden>⏱</span> Log hours
        </button>
      ) : (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center">
          {/* Backdrop taps close, so a mis-tap costs nothing. */}
          <div className="absolute inset-0" onClick={() => setOpen(false)} />
          <form
            onSubmit={save}
            className="relative w-full max-w-md border border-edge bg-surface p-4 shadow-xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-zinc-100">Log hours</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="cursor-pointer px-2 text-[18px] leading-none text-muted hover:text-zinc-200"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">
              Lot
            </label>
            <select
              value={palletId}
              onChange={(e) => setPalletId(e.target.value)}
              className="mb-3 w-full appearance-none border border-edge bg-raised px-3 py-3 text-[15px] text-zinc-200 outline-none focus:border-accent"
            >
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} — {t.source}
                </option>
              ))}
            </select>

            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">
              What were you doing
            </label>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {LABOR_ACTIVITIES.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setActivity(a)}
                  className={`cursor-pointer border px-2.5 py-2 text-[13px] ${
                    activity === a
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-edge bg-raised text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {label(a)}
                </button>
              ))}
            </div>

            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">
              Hours
            </label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {["0.5", "1", "2", "3", "4", "6", "8"].map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHours(h)}
                  className={`min-w-11 cursor-pointer border px-3 py-2 font-mono text-[14px] ${
                    hours === h
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-edge bg-raised text-zinc-300 hover:text-zinc-100"
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
            <input
              ref={hoursRef}
              // decimal, not number: phone keyboards give a numeric pad without
              // the scroll-wheel and spinner nonsense of type="number".
              inputMode="decimal"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="or type it — 1.75"
              className="mb-3 w-full border border-edge bg-raised px-3 py-3 font-mono text-[16px] text-zinc-100 placeholder-muted outline-none focus:border-accent"
            />

            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Note (optional)"
              className="mb-3 w-full border border-edge bg-raised px-3 py-2.5 text-[14px] text-zinc-200 placeholder-muted outline-none focus:border-accent"
            />

            {error ? <div className="mb-2 text-[13px] text-danger">{error}</div> : null}

            <button
              type="submit"
              disabled={busy || !hours || !palletId}
              className="w-full cursor-pointer border border-accent bg-accent/15 py-3 text-[15px] font-medium text-accent hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
