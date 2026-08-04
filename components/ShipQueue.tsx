"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { panelCls, thCls, tdCls, monoCls, btnCls, btnPrimaryCls, inputNarrowCls, Stat } from "@/components/ui";
import { money } from "@/lib/format";
import { label } from "@/lib/constants";
import { allPicked, buildPickList, sortQueue, urgencyOf, type Urgency } from "@/lib/fulfillmentMath";

interface OrderRow {
  id: string;
  orderNumber: string;
  externalId: string | null;
  platform: string | null;
  buyerName: string | null;
  status: string;
  soldAt: string | null;
  shipByDate: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  shippingPaid: number | null;
  items: { id: string; sku: string; name: string; storageLocation: string | null; soldPrice: number | null }[];
}

const URGENCY_STYLE: Record<Urgency, string> = {
  late: "text-danger font-semibold",
  today: "text-accent font-semibold",
  soon: "text-zinc-200",
  ok: "text-muted",
  none: "text-muted",
};

const URGENCY_TEXT: Record<Urgency, string> = {
  late: "LATE", today: "Today", soon: "Tomorrow", ok: "", none: "—",
};

export default function ShipQueue({ orders, shippedToday }: { orders: OrderRow[]; shippedToday: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [showPick, setShowPick] = useState(false);
  // Picked state is per-session: the walk is a physical task, not a DB record
  // until the whole order advances.
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const now = new Date();
  const sorted = useMemo(
    () => sortQueue(orders.map((o) => ({ ...o, shipByDate: o.shipByDate ? new Date(o.shipByDate) : null, soldAt: o.soldAt ? new Date(o.soldAt) : null }))),
    [orders]
  );

  const pickList = useMemo(
    () =>
      buildPickList(
        orders.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status as never,
          shipByDate: o.shipByDate ? new Date(o.shipByDate) : null,
          soldAt: o.soldAt ? new Date(o.soldAt) : null,
          buyerName: o.buyerName,
          // picked:false for all — the list shows every line and tracks the
          // tick separately, otherwise a ticked row vanishes and can never be
          // un-ticked if it was checked by mistake.
          items: o.items.map((i) => ({
            itemId: i.id, sku: i.sku, name: i.name,
            storageLocation: i.storageLocation, picked: false,
          })),
        }))
      ),
    [orders]
  );

  const lateCount = sorted.filter((o) => urgencyOf(o.shipByDate, now) === "late").length;

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    setMsg("");
    const res = await fetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok) router.refresh();
    else setMsg(data.error ?? "Update failed");
  }

  function togglePick(itemId: string) {
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-base font-semibold text-zinc-100">Ship Today</h1>
        <button className={btnCls} onClick={() => setShowPick((s) => !s)}>
          {showPick ? "Hide pick list" : `Pick list (${pickList.length})`}
        </button>
        {msg ? <span className="text-[12px] text-danger">{msg}</span> : null}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Orders to ship" value={String(sorted.length)} />
        <Stat label="Late" value={String(lateCount)} tone={lateCount > 0 ? "danger" : undefined} />
        <Stat label="Items to pick" value={String(pickList.length)} />
        <Stat label="Shipped today" value={String(shippedToday)} tone="ok" />
      </div>

      {showPick ? (
        <div className={panelCls}>
          <div className="border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-accent">
            Pick list — walk the racks in this order
          </div>
          {pickList.length === 0 ? (
            <div className="px-3 py-3 text-[13px] text-muted">Nothing left to pick.</div>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  <th className={thCls + " w-8"} />
                  <th className={thCls}>Location</th>
                  <th className={thCls}>SKU</th>
                  <th className={thCls}>Item</th>
                  <th className={thCls}>Order</th>
                </tr>
              </thead>
              <tbody>
                {pickList.map((l) => (
                  <tr key={l.itemId} className="hover:bg-raised/60">
                    <td className={tdCls}>
                      <input type="checkbox" checked={picked.has(l.itemId)} onChange={() => togglePick(l.itemId)} />
                    </td>
                    <td className={`${tdCls} ${monoCls} ${l.storageLocation ? "text-accent" : "text-danger"}`}>
                      {l.storageLocation ?? "NO LOCATION"}
                    </td>
                    <td className={`${tdCls} ${monoCls}`}>{l.sku}</td>
                    <td className={tdCls + " max-w-64"}><div className="truncate">{l.name}</div></td>
                    <td className={`${tdCls} ${monoCls} text-muted`}>{l.orderNumber}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {sorted.length === 0 ? (
        <div className={panelCls + " px-3 py-3 text-[13px] text-muted"}>
          Nothing waiting to ship. Sales sync in from eBay, or record one from an item page.
        </div>
      ) : null}

      <div className="space-y-2">
        {sorted.map((o) => {
          const urgency = urgencyOf(o.shipByDate, now);
          // allPicked() is false for an empty order; Array.every would be true.
          const allLinesPicked = allPicked(o.items.map((i) => ({
            itemId: i.id, sku: i.sku, name: i.name,
            storageLocation: i.storageLocation, picked: picked.has(i.id),
          })));
          return (
            <div key={o.id} className={panelCls}>
              <div className="flex flex-wrap items-center gap-2 border-b border-edge px-3 py-2">
                <span className={`${monoCls} text-accent`}>{o.orderNumber}</span>
                <span className="text-[12px] text-muted">
                  {o.platform ? label(o.platform) : "Manual"}
                  {o.externalId ? ` · ${o.externalId}` : ""}
                  {o.buyerName ? ` · ${o.buyerName}` : ""}
                </span>
                <span className={`text-[12px] ${URGENCY_STYLE[urgency]}`}>
                  {URGENCY_TEXT[urgency] || (o.shipByDate ? `Ship by ${o.shipByDate.toLocaleDateString()}` : "")}
                </span>
                <span className="ml-auto text-[11px] uppercase tracking-wider text-muted">{label(o.status)}</span>
              </div>

              <table className="w-full text-[13px]">
                <tbody>
                  {o.items.map((i) => (
                    <tr key={i.id} className="hover:bg-raised/60">
                      <td className={tdCls + " w-8"}>
                        <input type="checkbox" checked={picked.has(i.id)} onChange={() => togglePick(i.id)} />
                      </td>
                      <td className={`${tdCls} ${monoCls} ${i.storageLocation ? "" : "text-danger"} w-28`}>
                        {i.storageLocation ?? "NO LOC"}
                      </td>
                      <td className={`${tdCls} ${monoCls} w-40`}>
                        <Link href={`/items/${i.id}`} className="text-accent hover:underline">{i.sku}</Link>
                      </td>
                      <td className={tdCls}><div className="truncate">{i.name}</div></td>
                      <td className={`${tdCls} ${monoCls} text-right w-20`}>{money(i.soldPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex flex-wrap items-center gap-2 border-t border-edge px-3 py-2">
                {o.status === "AWAITING_PICK" ? (
                  <button
                    className={btnCls}
                    disabled={busy === o.id || !allLinesPicked}
                    title={allLinesPicked ? "" : "Tick every line first"}
                    onClick={() => void patch(o.id, { status: "PICKED" })}
                  >
                    Mark picked
                  </button>
                ) : null}
                {o.status === "PICKED" ? (
                  <button className={btnCls} disabled={busy === o.id} onClick={() => void patch(o.id, { status: "PACKED" })}>
                    Mark packed
                  </button>
                ) : null}

                <input
                  className={inputNarrowCls + " w-56"}
                  placeholder="Scan or paste tracking number"
                  value={tracking[o.id] ?? o.trackingNumber ?? ""}
                  onChange={(e) => setTracking((t) => ({ ...t, [o.id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (tracking[o.id] ?? "").trim()) {
                      void patch(o.id, { trackingNumber: tracking[o.id].trim() });
                    }
                  }}
                />
                <button
                  className={btnPrimaryCls}
                  disabled={busy === o.id || !(tracking[o.id] ?? o.trackingNumber ?? "").trim()}
                  onClick={() => void patch(o.id, { trackingNumber: (tracking[o.id] ?? o.trackingNumber ?? "").trim() })}
                >
                  Mark shipped
                </button>
                {o.carrier ? <span className="text-[12px] text-muted">{o.carrier}</span> : null}

                <a className={btnCls + " ml-auto"} href={`/ship/${o.id}/slip`} target="_blank" rel="noreferrer">
                  Packing slip
                </a>
                <button
                  className={btnCls}
                  disabled={busy === o.id}
                  onClick={() => {
                    if (confirm(`Cancel ${o.orderNumber}? Items go back to stock.`)) void patch(o.id, { status: "CANCELLED" });
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
