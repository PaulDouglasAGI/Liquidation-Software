import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { num } from "@/lib/serialize";
import { money, pct, dateStr } from "@/lib/format";
import { label, STATUS_COLORS } from "@/lib/constants";
import { panelCls, thCls, tdCls, monoCls, StatusBadge } from "@/components/ui";
import PalletForm from "@/components/PalletForm";

export const dynamic = "force-dynamic";

export default async function PalletsPage() {
  await requireUser();
  const pallets = await prisma.pallet.findMany({
    orderBy: { palletCode: "desc" },
    include: { items: { select: { status: true, soldPrice: true, ourCost: true } } },
  });

  const rows = pallets.map((p) => {
    const cost = p.totalCost.toNumber();
    const sold = p.items.filter((i) => i.status === "SOLD");
    const revenue = sold.reduce((a, i) => a + (num(i.soldPrice) ?? 0), 0);
    return {
      id: p.id,
      code: p.palletCode,
      supplier: p.supplier,
      date: p.purchaseDate,
      category: p.category,
      status: p.status,
      cost,
      items: p.items.length,
      listed: p.items.filter((i) => i.status === "LISTED").length,
      sold: sold.length,
      revenue,
      profit: revenue - cost,
      roi: cost > 0 ? ((revenue - cost) / cost) * 100 : 0,
    };
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold text-zinc-100">Pallets</h1>
        <PalletForm />
      </div>

      <div className={panelCls + " overflow-x-auto"}>
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              <th className={thCls}>Pallet</th>
              <th className={thCls}>Supplier</th>
              <th className={thCls}>Purchased</th>
              <th className={thCls}>Category</th>
              <th className={thCls}>Status</th>
              <th className={thCls + " text-right"}>Cost</th>
              <th className={thCls + " text-right"}>Items</th>
              <th className={thCls + " text-right"}>Listed</th>
              <th className={thCls + " text-right"}>Sold</th>
              <th className={thCls + " text-right"}>Revenue</th>
              <th className={thCls + " text-right"}>Profit</th>
              <th className={thCls + " text-right"}>ROI %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-raised/60">
                <td className={tdCls + " whitespace-nowrap"}>
                  <Link href={`/pallets/${p.id}`} className={`${monoCls} text-accent hover:underline`}>{p.code}</Link>
                </td>
                <td className={tdCls}>{p.supplier}</td>
                <td className={tdCls}>{dateStr(p.date)}</td>
                <td className={tdCls}>{label(p.category)}</td>
                <td className={tdCls}><StatusBadge value={p.status} labelText={label(p.status)} color={STATUS_COLORS[p.status] ?? ""} /></td>
                <td className={`${tdCls} ${monoCls} text-right`}>{money(p.cost)}</td>
                <td className={`${tdCls} ${monoCls} text-right`}>{p.items}</td>
                <td className={`${tdCls} ${monoCls} text-right`}>{p.listed}</td>
                <td className={`${tdCls} ${monoCls} text-right`}>{p.sold}</td>
                <td className={`${tdCls} ${monoCls} text-right`}>{money(p.revenue)}</td>
                <td className={`${tdCls} ${monoCls} text-right ${p.profit >= 0 ? "text-ok" : "text-danger"}`}>{money(p.profit)}</td>
                <td className={`${tdCls} ${monoCls} text-right ${p.roi >= 0 ? "text-ok" : "text-danger"}`}>{pct(p.roi)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td className={tdCls + " text-muted"} colSpan={12}>No pallets yet. Create your first one above.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
