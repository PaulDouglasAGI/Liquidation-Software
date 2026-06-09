"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputCls, btnCls, btnPrimaryCls, labelCls, monoCls, panelCls, thCls, tdCls, inputNarrowCls, selectNarrowCls } from "@/components/ui";
import { CATEGORIES, label } from "@/lib/constants";

type CredStatus = "db" | "env" | "unset";

interface Props {
  numbers: { defaultPricePct: string; agingDays: string; lowMarginPct: string };
  credStatus: Record<string, CredStatus>;
  templates: { category: string; titleTemplate: string; descriptionTemplate: string }[];
  locations: { code: string; notes: string | null }[];
  users: { id: string; email: string; name: string; createdAt: string }[];
  myUserId: string;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={panelCls}>
      <div className="border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function credPlaceholder(status: CredStatus) {
  if (status === "db") return "•••••••• (saved)";
  if (status === "env") return "from environment variable";
  return "not set";
}

export default function SettingsClient({ numbers, credStatus, templates, locations, users, myUserId }: Props) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function saveSettings(settings: Record<string, string>) {
    // Only send non-empty values so masked credential fields are untouched.
    const filtered = Object.fromEntries(Object.entries(settings).filter(([, v]) => v !== ""));
    if (Object.keys(filtered).length === 0) {
      setMsg({ ok: false, text: "Nothing to save" });
      return;
    }
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: filtered }),
    });
    const data = await res.json().catch(() => ({}));
    setMsg(res.ok ? { ok: true, text: "Settings saved" } : { ok: false, text: data.error ?? "Save failed" });
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold text-zinc-100">Settings</h1>
        {msg ? <span className={`text-[12px] ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</span> : null}
      </div>

      <PricingSection numbers={numbers} onSave={saveSettings} />
      <CredsSection
        title="eBay API credentials"
        fields={[
          ["ebay.appId", "App ID (Client ID)"],
          ["ebay.certId", "Cert ID (Client Secret)"],
          ["ebay.devId", "Dev ID"],
          ["ebay.authToken", "Auth Token (Trading API)"],
        ]}
        credStatus={credStatus}
        onSave={saveSettings}
      />
      <CredsSection
        title="Amazon SP-API credentials"
        fields={[
          ["amazon.accessKey", "Access Key"],
          ["amazon.secretKey", "Secret Key"],
          ["amazon.sellerId", "Seller ID"],
          ["amazon.marketplaceId", "Marketplace ID"],
        ]}
        credStatus={credStatus}
        onSave={saveSettings}
      />
      <CredsSection
        title="UPC lookup (upcitemdb.com)"
        fields={[["upc.apiKey", "API key (optional — trial endpoint used when empty)"]]}
        credStatus={credStatus}
        onSave={saveSettings}
      />
      <TemplatesSection templates={templates} />
      <LocationsSection locations={locations} />
      <UsersSection users={users} myUserId={myUserId} />
    </div>
  );
}

function PricingSection({ numbers, onSave }: { numbers: Props["numbers"]; onSave: (s: Record<string, string>) => Promise<void> }) {
  const [form, setForm] = useState(numbers);
  return (
    <Section title="Pricing & alerts">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className={labelCls}>Default price (% of MSRP)</label>
          <input type="number" min="1" max="100" className={inputNarrowCls + " w-28 font-mono"} value={form.defaultPricePct} onChange={(e) => setForm((f) => ({ ...f, defaultPricePct: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>Aging threshold (days)</label>
          <input type="number" min="1" className={inputNarrowCls + " w-28 font-mono"} value={form.agingDays} onChange={(e) => setForm((f) => ({ ...f, agingDays: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>Low-margin alert (%)</label>
          <input type="number" min="0" max="100" className={inputNarrowCls + " w-28 font-mono"} value={form.lowMarginPct} onChange={(e) => setForm((f) => ({ ...f, lowMarginPct: e.target.value }))} />
        </div>
        <button className={btnPrimaryCls} onClick={() => void onSave(form)}>Save</button>
      </div>
    </Section>
  );
}

function CredsSection({
  title,
  fields,
  credStatus,
  onSave,
}: {
  title: string;
  fields: [string, string][];
  credStatus: Record<string, CredStatus>;
  onSave: (s: Record<string, string>) => Promise<void>;
}) {
  const [form, setForm] = useState<Record<string, string>>(Object.fromEntries(fields.map(([k]) => [k, ""])));
  return (
    <Section title={title}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {fields.map(([key, labelText]) => (
          <div key={key}>
            <label className={labelCls}>
              {labelText}{" "}
              <span className={credStatus[key] === "unset" ? "text-danger" : "text-ok"}>
                [{credStatus[key] === "db" ? "saved" : credStatus[key] === "env" ? "env" : "not set"}]
              </span>
            </label>
            <input
              type="password"
              autoComplete="off"
              className={inputCls + " font-mono"}
              placeholder={credPlaceholder(credStatus[key])}
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <button className={btnPrimaryCls + " mt-3"} onClick={() => void onSave(form)}>Save credentials</button>
    </Section>
  );
}

function TemplatesSection({ templates }: { templates: Props["templates"] }) {
  const router = useRouter();
  const [category, setCategory] = useState(templates[0]?.category ?? "POWER_TOOLS");
  const current = templates.find((t) => t.category === category);
  const [title, setTitle] = useState(current?.titleTemplate ?? "{brand} {name} - {condition}");
  const [desc, setDesc] = useState(current?.descriptionTemplate ?? "");
  const [msg, setMsg] = useState("");

  function pick(cat: string) {
    setCategory(cat);
    const t = templates.find((x) => x.category === cat);
    setTitle(t?.titleTemplate ?? "{brand} {name} - {condition}");
    setDesc(t?.descriptionTemplate ?? "");
  }

  async function save() {
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, titleTemplate: title, descriptionTemplate: desc }),
    });
    const data = await res.json().catch(() => ({}));
    setMsg(res.ok ? "Template saved" : data.error ?? "Save failed");
    if (res.ok) router.refresh();
  }

  return (
    <Section title="Listing templates (per category)">
      <div className="mb-2 flex flex-wrap items-end gap-2">
        <div>
          <label className={labelCls}>Category</label>
          <select className={selectNarrowCls + " w-auto"} value={category} onChange={(e) => pick(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
          </select>
        </div>
        <span className="text-[11px] text-muted">
          Tokens: {"{name} {brand} {condition} {conditionNotes} {msrp} {price} {sku} {weight} {dimensions} {serial} {category}"}
        </span>
      </div>
      <div className="mb-2">
        <label className={labelCls}>Title template</label>
        <input className={inputCls + " font-mono"} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="mb-2">
        <label className={labelCls}>Description template</label>
        <textarea className={inputCls + " font-mono"} rows={8} value={desc} onChange={(e) => setDesc(e.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <button className={btnPrimaryCls} onClick={() => void save()}>Save template</button>
        {msg ? <span className="text-[12px] text-ok">{msg}</span> : null}
      </div>
    </Section>
  );
}

function LocationsSection({ locations }: { locations: Props["locations"] }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");

  async function add() {
    setErr("");
    const res = await fetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, notes }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setCode("");
      setNotes("");
      router.refresh();
    } else {
      setErr(data.error ?? "Failed");
    }
  }

  async function remove(c: string) {
    if (!confirm(`Remove location ${c}? Items keep their location text.`)) return;
    await fetch(`/api/locations?code=${encodeURIComponent(c)}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <Section title="Storage locations (bins / shelves)">
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div>
          <label className={labelCls}>Code</label>
          <input className={inputNarrowCls + " w-32 font-mono"} placeholder="SHELF-A3" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </div>
        <div className="min-w-40 flex-1">
          <label className={labelCls}>Notes</label>
          <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <button className={btnPrimaryCls} onClick={() => void add()}>Add</button>
        {err ? <span className="text-[12px] text-danger">{err}</span> : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {locations.map((l) => (
          <span key={l.code} className={`${monoCls} inline-flex items-center gap-1.5 border border-edge bg-raised px-2 py-1`} title={l.notes ?? ""}>
            {l.code}
            <button className="text-muted hover:text-danger cursor-pointer" onClick={() => void remove(l.code)}>×</button>
          </span>
        ))}
        {locations.length === 0 ? <span className="text-[12px] text-muted">No locations defined.</span> : null}
      </div>
    </Section>
  );
}

function UsersSection({ users, myUserId }: { users: Props["users"]; myUserId: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setForm({ name: "", email: "", password: "" });
      router.refresh();
    } else {
      setErr(data.error ?? "Failed to add user");
    }
  }

  async function remove(id: string, email: string) {
    if (!confirm(`Remove team member ${email}?`)) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setErr(data.error ?? "Failed");
    router.refresh();
  }

  return (
    <Section title="Team members">
      <form onSubmit={add} className="mb-3 flex flex-wrap items-end gap-2">
        <div>
          <label className={labelCls}>Name</label>
          <input required className={inputNarrowCls + " w-32"} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input type="email" required className={inputNarrowCls + " w-48"} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>Password (min 8 chars)</label>
          <input type="password" required minLength={8} className={inputNarrowCls + " w-40"} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
        </div>
        <button type="submit" className={btnPrimaryCls}>Add member</button>
        {err ? <span className="text-[12px] text-danger">{err}</span> : null}
      </form>
      <table className="w-full max-w-xl text-[13px]">
        <thead>
          <tr>
            <th className={thCls}>Name</th>
            <th className={thCls}>Email</th>
            <th className={thCls}>Added</th>
            <th className={thCls + " w-8"} />
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td className={tdCls}>{u.name}{u.id === myUserId ? <span className="ml-1 text-[11px] text-muted">(you)</span> : null}</td>
              <td className={tdCls}>{u.email}</td>
              <td className={tdCls}>{new Date(u.createdAt).toLocaleDateString()}</td>
              <td className={tdCls}>
                {u.id !== myUserId ? (
                  <button className={btnCls + " px-1.5 py-0.5 text-[11px]"} onClick={() => void remove(u.id, u.email)}>×</button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
