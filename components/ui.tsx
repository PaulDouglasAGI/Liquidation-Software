// Shared class strings — deliberately not a component library.
// Use the *NarrowCls variants when appending an explicit width (w-20, w-auto, …);
// mixing w-full with another width utility resolves by stylesheet order, not append order.
export const inputNarrowCls =
  "bg-raised border border-edge px-2 py-1.5 text-[13px] text-zinc-200 placeholder-muted outline-none focus:border-accent";
export const inputCls = inputNarrowCls + " w-full";
export const selectNarrowCls = inputNarrowCls + " appearance-none";
export const selectCls = selectNarrowCls + " w-full";
export const btnCls =
  "border border-edge bg-raised px-3 py-1.5 text-[13px] text-zinc-200 hover:border-zinc-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap";
export const btnPrimaryCls =
  "border border-accent bg-accent/10 px-3 py-1.5 text-[13px] font-medium text-accent hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap";
export const btnDangerCls =
  "border border-danger/60 bg-danger/10 px-3 py-1.5 text-[13px] text-danger hover:bg-danger/20 disabled:opacity-40 cursor-pointer whitespace-nowrap";
export const thCls =
  "text-left px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-edge whitespace-nowrap";
export const tdCls = "px-2 py-1.5 border-b border-edge/60 align-middle";
export const labelCls = "block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1";
export const panelCls = "bg-surface border border-edge";
export const monoCls = "font-mono text-[12px]";

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "ok" | "danger" | "accent" }) {
  const color =
    tone === "ok" ? "text-ok" : tone === "danger" ? "text-danger" : tone === "accent" ? "text-accent" : "text-zinc-100";
  return (
    <div className="bg-surface border border-edge px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className={`font-mono text-xl leading-7 ${color}`}>{value}</div>
      {sub ? <div className="text-[11px] text-muted">{sub}</div> : null}
    </div>
  );
}

export function StatusBadge({ value, labelText, color }: { value: string; labelText: string; color: string }) {
  return (
    <span className={`inline-block border border-edge bg-raised px-1.5 py-0.5 text-[11px] font-medium ${color}`} data-status={value}>
      {labelText}
    </span>
  );
}
