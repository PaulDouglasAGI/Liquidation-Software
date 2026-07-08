"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Html5Qrcode } from "html5-qrcode";
import { btnCls, btnPrimaryCls, inputCls } from "@/components/ui";

/**
 * Scan-to-find, reachable from anywhere: scan an item's SKU label or the
 * product's UPC and jump straight to it.
 */
export default function ScanFind() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState("");
  const [msg, setMsg] = useState("");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const openRef = useRef(false); // mirrors `open` for checks after awaits

  async function stopScanner() {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (s) {
      try {
        await s.stop();
        s.clear();
      } catch {
        // already stopped
      }
    }
  }

  async function close() {
    openRef.current = false;
    await stopScanner();
    setOpen(false);
    setMsg("");
    setManual("");
  }

  async function resolve(code: string) {
    setMsg("Looking up…");
    const res = await fetch(`/api/items/find?code=${encodeURIComponent(code)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error ?? "Lookup failed");
      return;
    }
    if (data.match === "item") {
      await close();
      router.push(`/items/${data.id}`);
    } else if (data.match === "many") {
      await close();
      router.push(`/inventory?q=${encodeURIComponent(data.q)}`);
    } else {
      setMsg(`No item found for "${code}" — try Inventory search`);
    }
  }

  async function openAndScan() {
    if (openRef.current || scannerRef.current) return; // double-tap guard
    openRef.current = true;
    setOpen(true);
    setMsg("");
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      // wait a tick for the overlay div to mount
      await new Promise((r) => setTimeout(r, 50));
      if (!openRef.current) return; // closed while loading
      const scanner = new Html5Qrcode("find-scanner");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 280, height: 160 } },
        (decoded) => {
          void stopScanner();
          void resolve(decoded.trim());
        },
        () => {}
      );
      // Overlay dismissed while the camera was still starting up? Shut it
      // down now — otherwise the camera stays on with no way to stop it.
      if (!openRef.current) await stopScanner();
    } catch {
      if (openRef.current) setMsg("Camera unavailable — type the SKU or UPC below");
    }
  }

  return (
    <>
      <button
        onClick={() => void openAndScan()}
        className="border border-edge bg-raised px-2 py-1 font-mono text-[11px] text-accent hover:border-accent cursor-pointer"
        title="Scan a label or barcode to find the item"
      >
        SCAN
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/85 p-4 pt-10" onClick={() => void close()}>
          <div className="w-full max-w-md border border-edge bg-surface p-3" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Scan to find item</span>
              <button className={btnCls + " px-2 py-0.5"} onClick={() => void close()}>×</button>
            </div>
            <div id="find-scanner" className="mb-2" />
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (manual.trim()) void resolve(manual.trim());
              }}
            >
              <input
                className={inputCls + " font-mono"}
                placeholder="…or type SKU / UPC"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
              />
              <button type="submit" className={btnPrimaryCls}>Find</button>
            </form>
            {msg ? <div className="mt-2 text-[12px] text-amber-300">{msg}</div> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
