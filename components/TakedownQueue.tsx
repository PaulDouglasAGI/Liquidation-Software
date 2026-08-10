"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { panelCls, tdCls, monoCls, btnCls } from "@/components/ui";
import { label } from "@/lib/constants";

export interface TakedownRow {
  id: string;
  channel: string;
  url: string | null;
  externalId: string | null;
  needsTakedownAt: string | null;
  sku: string;
  name: string;
  itemStatus: string;
}

/**
 * Adverts still live for stock that has already gone.
 *
 * This sits above the ship queue on purpose. Every minute one of these stays
 * up is a minute a second buyer can pay for something that is already in
 * someone else's box — which costs the refund, the postage back, and a defect
 * on the seller account. It is more urgent than anything below it.
 */
export default function TakedownQueue({ rows }: { rows: TakedownRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  // Read the clock once per render, not per row: calling Date.now() inside the
  // map makes the component impure and the rows disagree with each other.
  const [now] = useState(() => Date.now());

  if (rows.length === 0) return null;

  async function done(id: string) {
    setBusy(id);
    setMsg("");
    const res = await fetch("/api/listings/takedowns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setBusy(null);
    if (res.ok) router.refresh();
    else setMsg("Could not mark it down — try again");
  }

  const age = (iso: string | null) => {
    if (!iso) return "";
    const mins = Math.floor((now - new Date(iso).getTime()) / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    return hrs < 48 ? `${hrs}h` : `${Math.floor(hrs / 24)}d`;
  };

  return (
    <div className={panelCls + " border-danger/60"}>
      <div className="flex flex-wrap items-center gap-2 border-b border-edge px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-danger">
          Still advertised — {rows.length} to pull down
        </span>
        <span className="text-[11px] text-muted">
          this stock is sold or scrapped, and someone can still buy it
        </span>
        {msg ? <span className="ml-auto text-[12px] text-danger">{msg}</span> : null}
      </div>
      <table className="w-full text-[13px]">
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-raised/60">
              <td className={`${tdCls} ${monoCls} w-16 text-danger`}>{age(r.needsTakedownAt)}</td>
              <td className={`${tdCls} w-24 text-[11px] uppercase tracking-wider`}>{label(r.channel)}</td>
              <td className={`${tdCls} ${monoCls} w-40`}>{r.sku}</td>
              <td className={tdCls}><div className="truncate">{r.name}</div></td>
              <td className={`${tdCls} w-24 text-[11px] text-muted`}>{label(r.itemStatus)}</td>
              <td className={tdCls + " w-28 text-right"}>
                {r.url ? (
                  <a className="text-[12px] text-accent hover:underline" href={r.url} target="_blank" rel="noreferrer">
                    open listing
                  </a>
                ) : r.externalId ? (
                  <span className={monoCls + " text-[11px] text-muted"}>{r.externalId}</span>
                ) : null}
              </td>
              <td className={tdCls + " w-32 text-right"}>
                <button className={btnCls} disabled={busy === r.id} onClick={() => void done(r.id)}>
                  Pulled it down
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-edge px-3 py-2 text-[11px] text-muted">
        eBay listings are ended automatically when a unit sells elsewhere; anything here either failed that or is on a
        channel with no API — Amazon and Facebook Marketplace both have to be done by hand.
      </p>
    </div>
  );
}
