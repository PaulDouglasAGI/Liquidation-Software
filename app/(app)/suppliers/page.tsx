import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { num } from "@/lib/serialize";
import { money, pct, dateStr } from "@/lib/format";
import { panelCls, thCls, tdCls, monoCls } from "@/components/ui";
import SupplierForm, { DeletePurchaseButton } from "@/components/SupplierForm";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  await requireUser();
  const [purchases, pallets] = await Promise.all([
    prisma.supplierPurchase.findMany({ orderBy: { purchaseDate: "desc" } }),
    prisma.pallet.findMany({
      include: { items: { select: { status: true, soldPrice: true } } },
    }),
  ]);

  // ROI per supplier: pallet spend vs revenue from sold items, matched by supplier name.
  const suppliers = new Map<string, { spend: number; revenue: number; pallets: number; itemsSold: number }>();
  for (const p of pallets) {
    const key = p.supplier;
    const cur = suppliers.get(key) ?? { spend: 0, revenue: 0, pallets: 0, itemsSold: 0 };
    cur.spend += p.totalCost.toNumber();
    cur.pallets += 1;
    for (const i of p.items) {
      if (i.status === "SOLD") {
        cur.revenue += num(i.soldPrice) ?? 0;
        cur.itemsSold += 1;
      }
    }
    suppliers.set(key, cur);
  }
  const supplierRows = [...suppliers.entries()]
    .map(([name, v]) => ({ name, ...v, profit: v.revenue - v.spend, roi: v.spend > 0 ? ((v.revenue - v.spend) / v.spend) * 100 : 0 }))
    .sort((a, b) => b.roi - a.roi);

  return (
    <div className="space-y-3">
      <h1 className="text-base font-semibold text-zinc-100">Suppliers</h1>

      <div className={panelCls}>
        <div className="border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
          ROI by supplier (from pallet records)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className={thCls}>Supplier</th>
                <th className={thCls + " text-right"}>Pallets</th>
                <th className={thCls + " text-right"}>Spend</th>
                <th className={thCls + " text-right"}>Items sold</th>
                <th className={thCls + " text-right"}>Revenue</th>
                <th className={thCls + " text-right"}>Profit</th>
                <th className={thCls + " text-right"}>ROI %</th>
              </tr>
            </thead>
            <tbody>
              {supplierRows.map((r) => (
                <tr key={r.name} className="hover:bg-raised/60">
                  <td className={tdCls}>{r.name}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{r.pallets}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{money(r.spend)}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{r.itemsSold}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{money(r.revenue)}</td>
                  <td className={`${tdCls} ${monoCls} text-right ${r.profit >= 0 ? "text-ok" : "text-danger"}`}>{money(r.profit)}</td>
                  <td className={`${tdCls} ${monoCls} text-right ${r.roi >= 0 ? "text-ok" : "text-danger"}`}>{pct(r.roi)}</td>
                </tr>
              ))}
              {supplierRows.length === 0 ? (
                <tr><td className={tdCls + " text-muted"} colSpan={7}>No pallets yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className={panelCls}>
        <div className="border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Purchase log</div>
        <div className="p-3">
          <SupplierForm />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className={thCls}>Date</th>
                <th className={thCls}>Supplier</th>
                <th className={thCls}>Manifest</th>
                <th className={thCls}>Category</th>
                <th className={thCls + " text-right"}>Pallets</th>
                <th className={thCls + " text-right"}>Total paid</th>
                <th className={thCls}>Notes</th>
                <th className={thCls + " w-8"} />
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id} className="hover:bg-raised/60">
                  <td className={tdCls}>{dateStr(p.purchaseDate)}</td>
                  <td className={tdCls}>{p.supplierName}</td>
                  <td className={`${tdCls} ${monoCls}`}>{p.manifestId ?? "—"}</td>
                  <td className={tdCls}>{p.category ?? "—"}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{p.palletsBought}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{money(p.totalPaid.toNumber())}</td>
                  <td className={tdCls + " max-w-60 truncate"}>{p.notes ?? "—"}</td>
                  <td className={tdCls}><DeletePurchaseButton id={p.id} /></td>
                </tr>
              ))}
              {purchases.length === 0 ? (
                <tr><td className={tdCls + " text-muted"} colSpan={8}>No purchases logged.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
