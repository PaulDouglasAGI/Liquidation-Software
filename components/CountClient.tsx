"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { panelCls, thCls, tdCls, monoCls, btnCls, btnPrimaryCls, btnDangerCls, selectNarrowCls, inputNarrowCls, Stat } from "@/components/ui";
import { money } from "@/lib/format";

interface SessionRow {
  id: string; location: string; status: string;
  startedBy: string; startedAt: string; scanCount: number;
}

interface Recon {
  session: { id: string; location: string; status: string; startedBy: string };
  found: { id: string; sku: string; name: string }[];
  missing: { id: string; sku: string; name: string }[];
  misplaced: { sku: string; itemId: string; expectedLocation: string | null }[];
  unknown: string[];
  expectedCount: number;
  scannedCount: number;
  accuracyPct: number | null;
  missingValue: number;
}

export default function CountClient({ locations, sessions }: { locations: string[]; sessions: SessionRow[] }) {
  const router = useRouter();
  const [location, setLocation] = useState(locations[0] ?? "");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [recon, setRecon] = useState<Recon | null>(null);
  const [scan, setScan] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  async function refresh(id: string) {
    const res = await fetch(`/api/counts/${id}`);
    if (res.ok) setRecon(await res.json());
  }

  /** Opening a session loads its reconciliation; no effect needed. */
  async function open(id: string) {
    setActiveId(id);
    await refresh(id);
    scanRef.current?.focus();
  }

  async function start() {
    if (!location) return setMsg("Pick a location first");
    setBusy(true); setMsg("");
    const res = await fetch("/api/counts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      await open(data.id);
      if (data.resumed) setMsg("Resumed the count already open for this shelf");
      router.refresh();
    } else setMsg(data.error ?? "Could not start the count");
  }

  async function submitScan(sku: string) {
    if (!activeId || !sku.trim()) return;
    const res = await fetch(`/api/counts/${activeId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: sku.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    // Clear first, always. A scanner types straight into this box, so leaving
    // a failed SKU behind makes the next scan concatenate into a bogus code
    // and the item that was really on the shelf gets reported missing.
    setScan("");
    if (!res.ok) { setMsg(data.error ?? "Scan failed"); return; }
    // Immediate feedback matters most when someone is holding a scanner.
    if (!data.known) setMsg(`${data.sku}: not in the system`);
    else if (!data.expectedHere) setMsg(`${data.sku}: expected at ${data.expectedLocation ?? "no location"}`);
    else setMsg(`${data.sku} ✓`);
    void refresh(activeId);
  }

  async function act(action: string, confirmText?: string) {
    if (!activeId) return;
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    const res = await fetch(`/api/counts/${activeId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(false);
    if (res.ok) {
      if (action === "close") { setActiveId(null); setRecon(null); }
      else void refresh(activeId);
      router.refresh();
    }
  }

  return (
    <div className="space-y-3">
      <h1 className="text-base font-semibold text-zinc-100">Cycle Counts</h1>

      <div className={panelCls + " p-3"}>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">Location</label>
            <select className={selectNarrowCls + " w-40"} value={location} onChange={(e) => setLocation(e.target.value)}>
              {locations.length === 0 ? <option value="">No locations yet</option> : null}
              {locations.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button className={btnPrimaryCls} disabled={busy || !location} onClick={() => void start()}>
            {activeId ? "Switch shelf" : "Start count"}
          </button>
          {msg ? <span className="text-[12px] text-muted">{msg}</span> : null}
        </div>
      </div>

      {activeId && recon ? (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <Stat label="Shelf" value={recon.session.location} />
            <Stat label="Expected" value={String(recon.expectedCount)} />
            <Stat label="Scanned" value={String(recon.scannedCount)} />
            <Stat
              label="Accuracy"
              value={recon.accuracyPct === null ? "—" : `${recon.accuracyPct}%`}
              tone={recon.accuracyPct !== null && recon.accuracyPct < 95 ? "danger" : "ok"}
            />
            <Stat label="Missing value" value={money(recon.missingValue)} tone={recon.missingValue > 0 ? "danger" : undefined} />
          </div>

          <div className={panelCls + " p-3"}>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-accent">
              Scan every item on the shelf
            </label>
            <input
              ref={scanRef}
              className={inputNarrowCls + " w-72"}
              autoFocus
              placeholder="Scan SKU barcode…"
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void submitScan(scan); }}
            />
            <span className="ml-2 text-[12px] text-muted">Press Enter after each scan</span>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title={`Missing — ${recon.missing.length}`} tone="danger">
              {recon.missing.length === 0 ? <Empty text="Nothing missing." /> : (
                <>
                  <Table rows={recon.missing.map((m) => [m.sku, m.name])} />
                  <div className="px-3 py-2">
                    <button className={btnDangerCls} disabled={busy}
                      onClick={() => void act("resolveMissing", `Write off ${recon.missing.length} missing item(s)? They become SCRAPPED.`)}>
                      Write off missing
                    </button>
                  </div>
                </>
              )}
            </Panel>

            <Panel title={`Misplaced — ${recon.misplaced.length}`} tone="accent">
              {recon.misplaced.length === 0 ? <Empty text="Nothing shelved in the wrong place." /> : (
                <>
                  <Table rows={recon.misplaced.map((m) => [m.sku, `was ${m.expectedLocation ?? "unset"}`])} />
                  <div className="px-3 py-2">
                    <button className={btnCls} disabled={busy}
                      onClick={() => void act("resolveMisplaced", `Move ${recon.misplaced.length} item(s) to ${recon.session.location}?`)}>
                      Move them to this shelf
                    </button>
                  </div>
                </>
              )}
            </Panel>

            <Panel title={`Found — ${recon.found.length}`} tone="ok">
              {recon.found.length === 0 ? <Empty text="Nothing scanned yet." /> : (
                <Table rows={recon.found.map((f) => [f.sku, f.name])} />
              )}
            </Panel>

            <Panel title={`Unrecognised — ${recon.unknown.length}`} tone="muted">
              {recon.unknown.length === 0 ? <Empty text="Every scan matched an item." /> : (
                <Table rows={recon.unknown.map((u) => [u, "no matching item"])} />
              )}
            </Panel>
          </div>

          <button className={btnPrimaryCls} disabled={busy} onClick={() => void act("close", "Close this count?")}>
            Close count
          </button>
        </>
      ) : null}

      <div className={panelCls}>
        <div className="border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
          Recent counts
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              <th className={thCls}>Location</th>
              <th className={thCls}>Status</th>
              <th className={thCls}>By</th>
              <th className={thCls + " text-right"}>Scans</th>
              <th className={thCls}>Started</th>
              <th className={thCls} />
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="hover:bg-raised/60">
                <td className={`${tdCls} ${monoCls}`}>{s.location}</td>
                <td className={tdCls}>{s.status === "OPEN" ? <span className="text-accent">Open</span> : "Closed"}</td>
                <td className={tdCls}>{s.startedBy}</td>
                <td className={`${tdCls} ${monoCls} text-right`}>{s.scanCount}</td>
                <td className={tdCls + " text-muted"}>{new Date(s.startedAt).toLocaleString()}</td>
                <td className={tdCls}>
                  <button className={btnCls + " px-1.5 py-0.5 text-[11px]"} onClick={() => void open(s.id)}>Open</button>
                </td>
              </tr>
            ))}
            {sessions.length === 0 ? (
              <tr><td className={tdCls + " text-muted"} colSpan={6}>No counts yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="text-[12px] text-muted">
        Counting checks a shelf against what the system believes is on it. Missing items are probably
        misfiled elsewhere — check the misplaced list on other shelves before writing anything off.{" "}
        <Link href="/inventory?aging=1" className="text-accent hover:underline">Review aging stock</Link>
      </p>
    </div>
  );
}

function Panel({ title, tone, children }: { title: string; tone: string; children: React.ReactNode }) {
  const color = tone === "danger" ? "text-danger" : tone === "accent" ? "text-accent" : tone === "ok" ? "text-ok" : "text-muted";
  return (
    <div className={panelCls}>
      <div className={`border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wider ${color}`}>{title}</div>
      <div className="max-h-64 overflow-y-auto">{children}</div>
    </div>
  );
}

const Empty = ({ text }: { text: string }) => <div className="px-3 py-2 text-[13px] text-muted">{text}</div>;

function Table({ rows }: { rows: [string, string][] }) {
  return (
    <table className="w-full text-[13px]">
      <tbody>
        {rows.map(([a, b], n) => (
          <tr key={`${a}-${n}`} className="hover:bg-raised/60">
            <td className={`${tdCls} ${monoCls} w-40`}>{a}</td>
            <td className={tdCls + " text-muted"}><div className="truncate">{b}</div></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
