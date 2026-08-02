"use client";

import { useRef, useState } from "react";
import { btnCls, btnPrimaryCls, panelCls } from "@/components/ui";
import { label } from "@/lib/constants";
import { LOW_CONFIDENCE } from "@/lib/aiIntake";

export interface AiSuggestion {
  name: string;
  brand: string | null;
  category: string;
  condition: string;
  msrp: number | null;
  conditionNotes: string | null;
  confidence: number;
}

/**
 * Photo → draft listing. Never writes to the item directly: it proposes, the
 * person accepts. A wrong auto-fill costs more than a manual keystroke.
 */
export default function AiIdentify({
  upc, onApply,
}: { upc?: string; onApply: (s: AiSuggestion) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [disabled, setDisabled] = useState(false);
  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(null);

  async function identify(file: File) {
    setBusy(true); setMsg(""); setSuggestion(null);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("Could not read that photo"));
      r.readAsDataURL(file);
    }).catch(() => "");
    if (!dataUrl) { setBusy(false); setMsg("Could not read that photo"); return; }

    const res = await fetch("/api/ai/identify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataUrl, upc }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      if (data.disabled) setDisabled(true);
      setMsg(data.error ?? "Identification failed");
      return;
    }
    setSuggestion(data.suggestion);
  }

  if (disabled) {
    return (
      <p className="text-[12px] text-muted">
        AI intake is off — add an Anthropic API key in Settings to identify items from a photo.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void identify(f);
            e.target.value = "";
          }}
        />
        <button type="button" className={btnCls} disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? "Identifying…" : "📷 Identify from photo"}
        </button>
        {msg ? <span className="text-[12px] text-danger">{msg}</span> : null}
      </div>

      {suggestion ? (
        <div className={panelCls + " p-3"}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">Suggestion</span>
            <span className={`text-[12px] ${suggestion.confidence < LOW_CONFIDENCE ? "text-danger" : "text-ok"}`}>
              {suggestion.confidence}% confident
            </span>
            {suggestion.confidence < LOW_CONFIDENCE ? (
              <span className="text-[12px] text-muted">— check this carefully before accepting</span>
            ) : null}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] md:grid-cols-3">
            <Row k="Name" v={suggestion.name} />
            <Row k="Brand" v={suggestion.brand ?? "—"} />
            <Row k="Category" v={label(suggestion.category)} />
            <Row k="Condition" v={label(suggestion.condition)} />
            <Row k="Est. retail" v={suggestion.msrp === null ? "—" : `$${suggestion.msrp.toFixed(2)}`} />
            {suggestion.conditionNotes ? <Row k="Notes" v={suggestion.conditionNotes} /> : null}
          </dl>
          <div className="mt-2 flex gap-2">
            <button type="button" className={btnPrimaryCls} onClick={() => { onApply(suggestion); setSuggestion(null); }}>
              Use these values
            </button>
            <button type="button" className={btnCls} onClick={() => setSuggestion(null)}>Discard</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => (
  <div>
    <dt className="text-[11px] uppercase tracking-wider text-muted">{k}</dt>
    <dd className="text-zinc-200">{v}</dd>
  </div>
);
