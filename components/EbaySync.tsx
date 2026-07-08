"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { btnCls } from "@/components/ui";

/** One-tap pull of recent eBay orders — sold items record themselves. */
export default function EbaySync() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function sync() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/ebay/sync-orders", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMsg(data.updated > 0 ? `${data.updated} sale(s) recorded` : "No new sales");
      if (data.updated > 0) router.refresh();
    } else {
      setMsg(data.error ?? "Sync failed");
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button className={btnCls} disabled={busy} onClick={() => void sync()}>
        {busy ? "Syncing…" : "Sync eBay orders"}
      </button>
      {msg ? <span className="text-[12px] text-amber-300">{msg}</span> : null}
    </span>
  );
}
