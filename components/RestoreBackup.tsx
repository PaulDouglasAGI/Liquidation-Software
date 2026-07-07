"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { btnDangerCls } from "@/components/ui";

export default function RestoreBackup() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    let backup: unknown;
    try {
      backup = JSON.parse(await file.text());
    } catch {
      setMsg({ ok: false, text: "That file is not valid JSON" });
      return;
    }
    const counts = (backup as { counts?: { pallets?: number; items?: number } })?.counts;
    if (
      !confirm(
        `REPLACE all current data with this backup (${counts?.pallets ?? "?"} pallets, ${counts?.items ?? "?"} items)?\n\nThis deletes every existing pallet, item, expense, and purchase. User accounts and saved API credentials are kept. This cannot be undone.`
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true, backup }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMsg({ ok: true, text: `Restored ${data.restored.items} items across ${data.restored.pallets} pallets` });
      router.refresh();
    } else {
      setMsg({ ok: false, text: data.error ?? "Restore failed" });
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <label className={btnDangerCls + " cursor-pointer"}>
        {busy ? "Restoring…" : "Restore from backup…"}
        <input type="file" accept=".json,application/json" className="hidden" disabled={busy} onChange={(e) => void onFile(e)} />
      </label>
      {msg ? <span className={`text-[12px] ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</span> : null}
    </span>
  );
}
