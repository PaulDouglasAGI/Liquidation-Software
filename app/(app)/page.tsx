import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettingNum } from "@/lib/settings";
import { num } from "@/lib/serialize";
import { money, pct, dateStr, daysSince, marginPct } from "@/lib/format";
import { label } from "@/lib/constants";
import { Stat, panelCls, thCls, tdCls, monoCls } from "@/components/ui";
import EbaySync from "@/components/EbaySync";

export const dynamic = "force-dynamic";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(n: number) {
  return new Date(new Date().getTime() - n * 86_400_000);
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const w = max > 0 ? Math.max(1, (value / max) * 100) : 0;
  return <div className={`h-3 ${color}`} style={{ width: `${w}%` }} />;
}

export default async function Dashboard() {
  await requireUser();
  const [agingDays, lowMarginPct] = await Promise.all([
    getSettingNum("agingDays"),
    getSettingNum("lowMarginPct"),
  ]);
  const today = startOfToday();
  const agingCutoff = daysAgo(agingDays);
  const eightWeeksAgo = daysAgo(8 * 7);

  const [soldToday, listedToday, inStock, listed, agingCount, allItems, pallets, soldRecent] =
    await Promise.all([
      prisma.item.findMany({ where: { status: "SOLD", dateSold: { gte: today } }, select: { soldPrice: true, ourCost: true, feesAmount: true, shippingCost: true } }),
      prisma.item.count({ where: { dateListed: { gte: today } } }),
      prisma.item.count({ where: { status: "IN_STOCK" } }),
      prisma.item.count({ where: { status: "LISTED" } }),
      prisma.item.count({ where: { status: "LISTED", dateListed: { lte: agingCutoff } } }),
      prisma.item.findMany({
        where: { status: { in: ["IN_STOCK", "LISTED", "SOLD"] } },
        select: { id: true, sku: true, name: true, category: true, status: true, ourCost: true, sellPrice: true, soldPrice: true, feesAmount: true, shippingCost: true, dateListed: true, createdAt: true },
      }),
      prisma.pallet.findMany({
        where: { status: { not: "CLOSED" } },
        include: { items: { select: { status: true, soldPrice: true, ourCost: true, feesAmount: true, shippingCost: true } } },
      }),
      prisma.item.findMany({
        where: { status: "SOLD", dateSold: { gte: eightWeeksAgo } },
        select: { soldPrice: true, ourCost: true, feesAmount: true, shippingCost: true, dateSold: true },
      }),
    ]);

  const revToday = soldToday.reduce((a, i) => a + (num(i.soldPrice) ?? 0), 0);
  // Net of platform fees and shipping — the number that actually hits the bank
  const netOf = (i: { soldPrice: unknown; ourCost: { toNumber(): number }; feesAmount: unknown; shippingCost: unknown }) =>
    (num(i.soldPrice as never) ?? 0) - i.ourCost.toNumber() - (num(i.feesAmount as never) ?? 0) - (num(i.shippingCost as never) ?? 0);
  const profitToday = soldToday.reduce((a, i) => a + netOf(i), 0);

  // Pallet ROI rows
  const palletRows = pallets
    .map((p) => {
      const cost = p.totalCost.toNumber();
      const sold = p.items.filter((i) => i.status === "SOLD");
      const revenue = sold.reduce((a, i) => a + (num(i.soldPrice) ?? 0), 0);
      const feesAndShip = sold.reduce((a, i) => a + (num(i.feesAmount) ?? 0) + (num(i.shippingCost) ?? 0), 0);
      const profit = revenue - feesAndShip - cost;
      return {
        id: p.id,
        code: p.palletCode,
        cost,
        items: p.items.length,
        listed: p.items.filter((i) => i.status === "LISTED").length,
        sold: sold.length,
        revenue,
        profit,
        roi: cost > 0 ? (profit / cost) * 100 : 0,
      };
    })
    .sort((a, b) => b.roi - a.roi);

  // Weekly revenue/profit, last 8 weeks
  const weeks: { label: string; revenue: number; profit: number }[] = [];
  for (let w = 7; w >= 0; w--) {
    const start = new Date(today.getTime() - (today.getDay() === 0 ? 6 : today.getDay() - 1) * 86_400_000 - w * 7 * 86_400_000);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 7 * 86_400_000);
    const inWeek = soldRecent.filter((i) => i.dateSold && i.dateSold >= start && i.dateSold < end);
    weeks.push({
      label: `${start.getMonth() + 1}/${start.getDate()}`,
      revenue: inWeek.reduce((a, i) => a + (num(i.soldPrice) ?? 0), 0),
      profit: inWeek.reduce((a, i) => a + netOf(i), 0),
    });
  }
  const maxWeek = Math.max(1, ...weeks.map((w) => w.revenue));

  // Sell-through by category
  const categories = ["POWER_TOOLS", "HAND_TOOLS", "HARDWARE", "APPLIANCES", "MIXED"];
  const sellThrough = categories
    .map((c) => {
      const inCat = allItems.filter((i) => i.category === c);
      const sold = inCat.filter((i) => i.status === "SOLD").length;
      return { category: c, total: inCat.length, sold, rate: inCat.length ? (sold / inCat.length) * 100 : 0 };
    })
    .filter((r) => r.total > 0);

  // Top 10 sold items by margin
  const topMargin = allItems
    .filter((i) => i.status === "SOLD" && num(i.soldPrice))
    .map((i) => ({ ...i, margin: marginPct(num(i.soldPrice), i.ourCost.toNumber() + (num(i.feesAmount) ?? 0) + (num(i.shippingCost) ?? 0)) ?? 0, profit: netOf(i) }))
    .sort((a, b) => b.margin - a.margin)
    .slice(0, 10);

  // Alerts
  const agingItems = allItems
    .filter((i) => i.status === "LISTED" && i.dateListed && i.dateListed <= agingCutoff)
    .sort((a, b) => (a.dateListed?.getTime() ?? 0) - (b.dateListed?.getTime() ?? 0))
    .slice(0, 12);
  const unlisted = allItems
    .filter((i) => i.status === "IN_STOCK")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, 12);
  const lowMargin = allItems
    .filter((i) => i.status === "LISTED" && (marginPct(num(i.sellPrice), i.ourCost.toNumber()) ?? 100) < lowMarginPct)
    .slice(0, 12);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-base font-semibold text-zinc-100">Dashboard</h1>
        <div className="flex items-center gap-3">
          <EbaySync />
          <span className="text-[11px] text-muted">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span>
        </div>
      </div>

      {/* Row 1: today */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Sold today" value={String(soldToday.length)} />
        <Stat label="Revenue today" value={money(revToday)} tone="ok" />
        <Stat label="Profit today" value={money(profitToday)} tone={profitToday >= 0 ? "ok" : "danger"} />
        <Stat label="Listed today" value={String(listedToday)} />
      </div>

      {/* Row 2: active inventory */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="In stock (unlisted)" value={String(inStock)} />
        <Stat label="Listed" value={String(listed)} tone="accent" />
        <Stat label="Total active" value={String(inStock + listed)} />
        <Stat label={`Aging (${agingDays}+ days)`} value={String(agingCount)} tone={agingCount > 0 ? "danger" : undefined} />
      </div>

      {/* Row 3: pallet ROI */}
      <div className={panelCls}>
        <div className="border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Pallet ROI — active pallets</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className={thCls}>Pallet</th>
                <th className={thCls + " text-right"}>Cost</th>
                <th className={thCls + " text-right"}>Items</th>
                <th className={thCls + " text-right"}>Listed</th>
                <th className={thCls + " text-right"}>Sold</th>
                <th className={thCls + " text-right"}>Revenue</th>
                <th className={thCls + " text-right"}>Net profit</th>
                <th className={thCls + " text-right"}>ROI %</th>
              </tr>
            </thead>
            <tbody>
              {palletRows.map((p) => (
                <tr key={p.id} className="hover:bg-raised/60">
                  <td className={tdCls + " whitespace-nowrap"}>
                    <Link href={`/pallets/${p.id}`} className={`${monoCls} text-accent hover:underline`}>{p.code}</Link>
                  </td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{money(p.cost)}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{p.items}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{p.listed}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{p.sold}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{money(p.revenue)}</td>
                  <td className={`${tdCls} ${monoCls} text-right ${p.profit >= 0 ? "text-ok" : "text-danger"}`}>{money(p.profit)}</td>
                  <td className={`${tdCls} ${monoCls} text-right ${p.roi >= 0 ? "text-ok" : "text-danger"}`}>{pct(p.roi)}</td>
                </tr>
              ))}
              {palletRows.length === 0 ? (
                <tr><td className={tdCls + " text-muted"} colSpan={8}>No active pallets. <Link href="/pallets" className="text-accent hover:underline">Create one</Link>.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row 4: charts */}
      <div className="grid gap-2 lg:grid-cols-3">
        <div className={panelCls + " p-3"}>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Revenue / profit by week</div>
          <div className="space-y-1.5">
            {weeks.map((w) => (
              <div key={w.label} className="flex items-center gap-2">
                <span className={`${monoCls} w-10 shrink-0 text-right text-muted`}>{w.label}</span>
                <div className="flex-1">
                  <Bar value={w.revenue} max={maxWeek} color="bg-accent/70" />
                  <Bar value={Math.max(0, w.profit)} max={maxWeek} color="bg-ok/70" />
                </div>
                <span className={`${monoCls} w-16 shrink-0 text-right`}>{money(w.revenue)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-3 text-[11px] text-muted">
            <span><span className="inline-block h-2 w-2 bg-accent/70" /> Revenue</span>
            <span><span className="inline-block h-2 w-2 bg-ok/70" /> Profit</span>
          </div>
        </div>

        <div className={panelCls + " p-3"}>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Sell-through by category</div>
          <div className="space-y-2">
            {sellThrough.map((r) => (
              <div key={r.category}>
                <div className="mb-0.5 flex justify-between text-[12px]">
                  <span>{label(r.category)}</span>
                  <span className={monoCls}>{r.sold}/{r.total} · {pct(r.rate, 0)}</span>
                </div>
                <div className="h-3 bg-raised"><Bar value={r.rate} max={100} color="bg-accent/70" /></div>
              </div>
            ))}
            {sellThrough.length === 0 ? <div className="text-[12px] text-muted">No items yet.</div> : null}
          </div>
        </div>

        <div className={panelCls + " p-3"}>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Top items by profit margin (sold)</div>
          <table className="w-full text-[12px]">
            <tbody>
              {topMargin.map((i) => (
                <tr key={i.id} className="border-b border-edge/60 last:border-0">
                  <td className="py-1 pr-2">
                    <Link href={`/items/${i.id}`} className="hover:text-accent">{i.name.slice(0, 38)}</Link>
                  </td>
                  <td className={`${monoCls} py-1 pr-2 text-right text-ok`}>{money(i.profit)}</td>
                  <td className={`${monoCls} py-1 text-right`}>{pct(i.margin, 0)}</td>
                </tr>
              ))}
              {topMargin.length === 0 ? <tr><td className="py-1 text-muted">No sales yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row 5: alerts */}
      <div className="grid gap-2 lg:grid-cols-3">
        <AlertPanel title={`Aging — listed ${agingDays}+ days`} empty="Nothing aging.">
          {agingItems.map((i) => (
            <AlertRow key={i.id} id={i.id} sku={i.sku} name={i.name} right={`${daysSince(i.dateListed)}d`} rightClass="text-danger" />
          ))}
        </AlertPanel>
        <AlertPanel title="Received, not yet listed" empty="Everything is listed.">
          {unlisted.map((i) => (
            <AlertRow key={i.id} id={i.id} sku={i.sku} name={i.name} right={dateStr(i.createdAt)} rightClass="text-muted" />
          ))}
        </AlertPanel>
        <AlertPanel title={`Low margin — under ${lowMarginPct}%`} empty="No low-margin listings.">
          {lowMargin.map((i) => (
            <AlertRow key={i.id} id={i.id} sku={i.sku} name={i.name} right={pct(marginPct(num(i.sellPrice), i.ourCost.toNumber()), 0)} rightClass="text-danger" />
          ))}
        </AlertPanel>
      </div>
    </div>
  );
}

function AlertPanel({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className={panelCls}>
      <div className="border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</div>
      <div className="max-h-64 overflow-y-auto px-3 py-1">
        {hasRows ? children : <div className="py-2 text-[12px] text-muted">{empty}</div>}
      </div>
    </div>
  );
}

function AlertRow({ id, sku, name, right, rightClass }: { id: string; sku: string; name: string; right: string; rightClass: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-edge/60 py-1 text-[12px] last:border-0">
      <Link href={`/items/${id}`} className="min-w-0 truncate hover:text-accent">
        <span className={`${monoCls} mr-2 text-muted`}>{sku}</span>
        {name}
      </Link>
      <span className={`${monoCls} shrink-0 ${rightClass}`}>{right}</span>
    </div>
  );
}
