"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputCls, btnPrimaryCls, labelCls } from "@/components/ui";

export default function SetupWizard() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, email: form.email, password: form.password }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError(data.error ?? "Setup failed");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-md">
        <div className="mb-4 border border-edge bg-surface p-6">
          <div className="mb-1 flex items-baseline gap-2">
            <span className="font-mono text-lg font-bold text-accent">LIQ-OPS</span>
            <span className="text-[11px] uppercase tracking-wider text-muted">First-time setup</span>
          </div>
          <p className="mb-5 text-[13px] text-zinc-400">
            Welcome. Create the owner account to get started — this takes 30 seconds and only happens once.
          </p>
          <form onSubmit={submit}>
            <div className="mb-3">
              <label className={labelCls} htmlFor="name">Your name</label>
              <input id="name" required autoFocus className={inputCls + " py-2.5"} value={form.name} onChange={set("name")} />
            </div>
            <div className="mb-3">
              <label className={labelCls} htmlFor="email">Email (this is your login)</label>
              <input id="email" type="email" required className={inputCls + " py-2.5"} value={form.email} onChange={set("email")} />
            </div>
            <div className="mb-3">
              <label className={labelCls} htmlFor="password">Password (8+ characters)</label>
              <input id="password" type="password" required minLength={8} className={inputCls + " py-2.5"} value={form.password} onChange={set("password")} />
            </div>
            <div className="mb-4">
              <label className={labelCls} htmlFor="confirm">Confirm password</label>
              <input id="confirm" type="password" required className={inputCls + " py-2.5"} value={form.confirm} onChange={set("confirm")} />
            </div>
            {error ? <div className="mb-3 text-[12px] text-danger">{error}</div> : null}
            <button type="submit" disabled={busy} className={btnPrimaryCls + " w-full py-3"}>
              {busy ? "Setting up…" : "Create account & open the app"}
            </button>
          </form>
        </div>
        <div className="border border-edge bg-surface p-4 text-[12px] text-muted">
          <div className="mb-1 font-semibold uppercase tracking-wider text-[11px]">What happens next</div>
          <ul className="list-inside list-disc space-y-0.5">
            <li>Pricing defaults, listing templates, and shelf codes are created for you</li>
            <li>Add teammates any time in Settings — everyone shares the same inventory</li>
            <li>On your phone, use the browser menu → &quot;Add to Home Screen&quot; to install this as an app</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
