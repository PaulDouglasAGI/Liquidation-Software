"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputCls, btnPrimaryCls, labelCls } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Login failed");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <form onSubmit={submit} className="w-full max-w-sm border border-edge bg-surface p-6">
        <div className="mb-6 flex items-baseline gap-2">
          <span className="font-mono text-lg font-bold text-accent">LIQ-OPS</span>
          <span className="text-[11px] uppercase tracking-wider text-muted">Liquidation Operations</span>
        </div>
        <div className="mb-3">
          <label className={labelCls} htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            autoFocus
            className={inputCls}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="mb-4">
          <label className={labelCls} htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            className={inputCls}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error ? <div className="mb-3 text-[12px] text-danger">{error}</div> : null}
        <button type="submit" disabled={busy} className={btnPrimaryCls + " w-full"}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
