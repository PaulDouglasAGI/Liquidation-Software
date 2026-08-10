"use client";

import { useState } from "react";
import { panelCls, thCls, tdCls, monoCls, btnCls } from "@/components/ui";
import { money } from "@/lib/format";
import { label } from "@/lib/constants";
import LineChart from "@/components/LineChart";
import type { SegmentStats } from "@/lib/buyNextMath";
import type { QuarterPoint, LotCurve } from "@/lib/rotationMath";

const C = {
  spend: "#f59e0b",
  revenue: "#22c55e",
  profit: "#38bdf8",
  shelf: "#a78bfa",
  cycle: "#f472b6",
  turn: "#facc15",
};

const pctText = (n: number | null) => (n == null ? "—" : `${n >= 0 ? "" : ""}${n.toFixed(0)}%`);
const dayText = (n: number | null) => (n == null ? "—" : `${n.toFixed(0)}d`);
const multText = (n: number | null) => (n == null ? "—" : `${n.toFixed(2)}×`);

function ConfidenceBar({ v }: { v: number }) {
  return (
    <span className="inline-flex items-center gap-1" title={`${Math.round(v * 100)}% of a full read`}>
      <span className="inline-block h-1.5 w-10 rounded bg-edge">
        <span className="block h-1.5 rounded bg-accent" style={{ width: `${Math.max(4, v * 100)}%` }} />
      </span>
    </span>
  );
}

function SegmentTable({ rows, houseReturn }: { rows: SegmentStats[]; houseReturn: number | null }) {
  const [open, setOpen] = useState<string | null>(null);
  if (rows.length === 0) {
    return <div className="px-3 py-4 text-[13px] text-muted">Not enough history in this cut yet — five sold units minimum.</div>;
  }
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr>
          <th className={thCls}>Segment</th>
          <th className={thCls + " text-right"} title="Annualised return on the money, after risk, shrunk toward the house average by how much history stands behind it">Score</th>
          <th className={thCls + " text-right"} title="Net proceeds divided by what the stock cost">Net ×</th>
          <th className={thCls + " text-right"} title="Median days from the pallet arriving to the unit selling">Cash cycle</th>
          <th className={thCls + " text-right"}>Sell-through</th>
          <th className={thCls + " text-right"}>Dud</th>
          <th className={thCls + " text-right"}>Units</th>
          <th className={thCls}>Confidence</th>
          <th className={thCls} />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const strong = r.recommended && (r.score ?? 0) > (houseReturn ?? 0);
          const weak = r.recommended && (r.score ?? 0) < (houseReturn ?? 0) * 0.6;
          return (
            <>
              <tr key={r.key} className="hover:bg-raised/60">
                <td className={tdCls}>
                  <span className={strong ? "font-semibold text-ok" : weak ? "text-danger" : ""}>
                    {r.label.split(" · ").map((p) => label(p)).join(" · ")}
                  </span>
                </td>
                <td className={`${tdCls} ${monoCls} text-right font-semibold ${r.recommended ? "" : "text-muted"}`}>
                  {pctText(r.score)}
                  {!r.recommended ? (
                    <span className="ml-1 text-[10px] font-normal text-muted" title="One lot is one bet — needs a second before it should drive a purchase">
                      thin
                    </span>
                  ) : null}
                </td>
                <td className={`${tdCls} ${monoCls} text-right`}>{multText(r.netMultiple)}</td>
                <td className={`${tdCls} ${monoCls} text-right`}>{dayText(r.medianCashCycleDays)}</td>
                <td className={`${tdCls} ${monoCls} text-right`}>{pctText(r.sellThroughPct)}</td>
                <td className={`${tdCls} ${monoCls} text-right ${r.dudRatePct >= 20 ? "text-danger" : ""}`}>{r.dudRatePct.toFixed(0)}%</td>
                <td className={`${tdCls} ${monoCls} text-right`}>{r.unitsSold}/{r.unitsBought}</td>
                <td className={tdCls}><ConfidenceBar v={r.confidence} /></td>
                <td className={tdCls + " text-right"}>
                  <button className="text-[11px] text-accent hover:underline" onClick={() => setOpen(open === r.key ? null : r.key)}>
                    {open === r.key ? "less" : "all 30"}
                  </button>
                </td>
              </tr>
              {open === r.key ? (
                <tr key={r.key + "-d"}>
                  <td colSpan={9} className="border-b border-edge bg-raised/40 px-3 py-3">
                    <p className="mb-2 text-[12px] text-zinc-300">{r.verdict}</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] md:grid-cols-4">
                      {([
                        ["Units bought", r.unitsBought], ["Units sold", r.unitsSold],
                        ["Still unsold", r.unitsUnsold], ["Unsold past 60d", r.unitsAgedUnsold],
                        ["Lots", r.lots], ["Cost", money(r.cost)],
                        ["Gross revenue", money(r.grossRevenue)], ["Platform fees", money(r.fees)],
                        ["Postage paid", money(r.postagePaid)], ["Postage collected", money(r.postageCollected)],
                        ["Net proceeds", money(r.netProceeds)], ["Net profit", money(r.netProfit)],
                        ["Net margin", pctText(r.netMarginPct)], ["Net multiple", multText(r.netMultiple)],
                        ["Profit / unit bought", money(r.profitPerUnitBought)], ["Profit / unit sold", money(r.profitPerUnitSold)],
                        ["Median sale price", money(r.medianSalePrice)], ["Days to list", dayText(r.medianDaysToList)],
                        ["Days on shelf", dayText(r.medianDaysOnShelf)], ["Cash cycle", dayText(r.medianCashCycleDays)],
                        ["Sell-through", pctText(r.sellThroughPct)], ["Sold within 30d", pctText(r.sellThrough30Pct)],
                        ["Sold within 90d", pctText(r.sellThrough90Pct)], ["Dud rate", `${r.dudRatePct}%`],
                        ["Scrap rate", `${r.scrapRatePct}%`], ["Return rate", pctText(r.returnRatePct)],
                        ["Marked down", pctText(r.markdownRatePct)], ["Avg markdown", pctText(r.avgMarkdownPct)],
                        ["Labour hours", `${r.hours}h`], ["Profit / hour", money(r.profitPerHour)],
                        ["Units / hour", r.unitsPerHour ?? "—"], ["Annualised return", pctText(r.annualisedReturnPct)],
                        ["After risk", pctText(r.riskAdjustedReturnPct)], ["Confidence", `${Math.round(r.confidence * 100)}%`],
                        ["Safe to act on", r.recommended ? "yes" : "not yet"],
                      ] as [string, unknown][]).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-2 border-b border-edge/50 py-0.5">
                          <span className="text-muted">{k}</span>
                          <span className={monoCls + " text-zinc-200"}>{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ) : null}
            </>
          );
        })}
      </tbody>
    </table>
  );
}

export interface BuyNextPanelProps {
  cuts: { key: string; title: string; rows: SegmentStats[] }[];
  houseReturnPct: number | null;
  quarters: QuarterPoint[];
  curves: LotCurve[];
  totalUnits: number;
}

export default function BuyNextPanel({ cuts, houseReturnPct, quarters, curves, totalUnits }: BuyNextPanelProps) {
  const [cut, setCut] = useState(cuts[0]?.key ?? "");
  const active = cuts.find((c) => c.key === cut) ?? cuts[0];
  const qLabels = quarters.map((q) => q.label);
  // Ten lots is already a busy chart; beyond that the lines stop being readable.
  const topCurves = curves.slice(0, 10);
  const curveLabels = topCurves.length
    ? topCurves.reduce((a, b) => (a.points.length > b.points.length ? a : b)).points.map((p) => `d${p.day}`)
    : [];
  const palette = ["#f59e0b", "#22c55e", "#38bdf8", "#a78bfa", "#f472b6", "#facc15", "#fb7185", "#4ade80", "#60a5fa", "#c084fc"];

  return (
    <div className="space-y-3">
      <div className={panelCls}>
        <div className="flex flex-wrap items-center gap-2 border-b border-edge px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">What to buy next</span>
          <span className="text-[11px] text-muted">
            ranked by annualised return on capital — margin and speed together, after duds and dead stock
          </span>
          {houseReturnPct != null ? (
            <span className="ml-auto text-[11px] text-muted">
              house average <span className={monoCls + " text-zinc-200"}>{houseReturnPct.toFixed(0)}%</span>
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1 border-b border-edge px-3 py-2">
          {cuts.map((c) => (
            <button key={c.key} onClick={() => setCut(c.key)}
              className={`${btnCls} ${c.key === (active?.key ?? "") ? "border-accent text-accent" : ""}`}>
              {c.title}
            </button>
          ))}
        </div>
        {active ? <SegmentTable rows={active.rows} houseReturn={houseReturnPct} /> : null}
        <p className="border-t border-edge px-3 py-2 text-[11px] text-muted">
          Score is the annualised return on capital after risk, with thin segments pulled toward the house average.
          Rows marked <span className="text-zinc-300">thin</span> sit below the rest however well they scored — one lot
          is one bet, and it takes a second before a result should move money. Open{" "}
          <span className="text-zinc-300">all 30</span> on any row for the full set of measures behind it. Built from{" "}
          {totalUnits} units.
        </p>
      </div>

      <div className={panelCls}>
        <div className="border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
          Money in, money out — by quarter
        </div>
        <LineChart
          labels={qLabels}
          height={260}
          formatLeft={(n) => (Math.abs(n) >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`)}
          series={[
            { label: "Spent on stock", values: quarters.map((q) => q.spend), color: C.spend },
            { label: "Net proceeds", values: quarters.map((q) => q.netProceeds), color: C.revenue },
            { label: "Net profit", values: quarters.map((q) => q.netProfit), color: C.profit },
            { label: "Capital on the shelf", values: quarters.map((q) => q.capitalOnShelf), color: C.shelf, dashed: true },
          ]}
        />
      </div>

      <div className={panelCls}>
        <div className="border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
          Rotation — how fast the money comes back
        </div>
        <LineChart
          labels={qLabels}
          height={220}
          formatLeft={(n) => `${n.toFixed(1)}×`}
          formatRight={(n) => `${Math.round(n)}d`}
          markLeft={{ value: 1, label: "one full turn" }}
          series={[
            { label: "Turns per quarter", values: quarters.map((q) => q.turnRate), color: C.turn },
            { label: "Cash cycle (days)", values: quarters.map((q) => q.medianCashCycleDays), color: C.cycle, axis: "right" },
          ]}
        />
        <p className="border-t border-edge px-3 py-2 text-[11px] text-muted">
          Turns is net proceeds against the average capital held that quarter — above one full turn means the shelf paid
          for itself and then some. Cash cycle is the median days from a pallet arriving to a unit selling.
        </p>
      </div>

      {topCurves.length ? (
        <div className={panelCls}>
          <div className="border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Cost recovery per pallet — days since it arrived
          </div>
          <LineChart
            labels={curveLabels}
            height={260}
            formatLeft={(n) => `${n.toFixed(1)}×`}
            markLeft={{ value: 1, label: "paid for itself" }}
            series={topCurves.map((c, i) => ({
              label: `${c.code}${c.breakEvenDay != null ? ` (even @ ${c.breakEvenDay}d)` : ""}`,
              values: curveLabels.map((_, idx) => c.points[idx]?.recovered ?? null),
              color: palette[i % palette.length],
            }))}
          />
          <p className="border-t border-edge px-3 py-2 text-[11px] text-muted">
            Each line is one pallet earning its own cost back. Where it crosses the dashed line, that pallet stopped
            being a risk. A line that flattens below it is money still sitting on a shelf.
          </p>
        </div>
      ) : null}
    </div>
  );
}
