import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { num } from "@/lib/serialize";
import { money, pct, dateStr, daysSince } from "@/lib/format";
import { label, STATUS_COLORS } from "@/lib/constants";
import { Stat, panelCls, thCls, tdCls, monoCls, StatusBadge, btnPrimaryCls } from "@/components/ui";
import PalletEditor from "@/components/PalletEditor";
import ManifestImport from "@/components/ManifestImport";

export const dynamic = "force-dynamic";

export default async function PalletDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const pallet = await prisma.pallet.findUnique({
    where: { id },
    include: { items: { orderBy: { sku: "asc" } } },
  });
  if (!pallet) notFound();

  const cost = pallet.totalCost.toNumber();
  const sold = pallet.items.filter((i) => i.status === "SOLD");
  const listed = pallet.items.filter((i) => i.status === "LISTED");
  const revenue = sold.reduce((a, i) => a + (num(i.soldPrice) ?? 0), 0);
  const costAllocated = pallet.items.reduce((a, i) => a + i.ourCost.toNumber(), 0);
  const estProfit = revenue - cost;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className={`${monoCls} text-base font-bold text-accent`}>{pallet.palletCode}</h1>
          <StatusBadge value={pallet.status} labelText={label(pallet.status)} color={STATUS_COLORS[pallet.status] ?? ""} />
          <span className="text-[12px] text-muted">{pallet.supplier} · {dateStr(pallet.purchaseDate)}</span>
        </div>
        <Link href={`/intake?pallet=${pallet.id}`} className={btnPrimaryCls}>+ Add items (scan)</Link>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <Stat label="Items" value={String(pallet.items.length)} />
        <Stat label="Listed" value={String(listed.length)} tone="accent" />
        <Stat label="Sold" value={String(sold.length)} />
        <Stat label="Cost allocated" value={money(costAllocated)} sub={`of ${money(cost)} paid`} />
        <Stat label="Revenue" value={money(revenue)} tone="ok" />
        <Stat label="Est. profit" value={money(estProfit)} sub={cost > 0 ? `ROI ${pct((estProfit / cost) * 100)}` : undefined} tone={estProfit >= 0 ? "ok" : "danger"} />
      </div>

      <ManifestImport palletId={pallet.id} />

      <PalletEditor
        pallet={{
          id: pallet.id,
          supplier: pallet.supplier,
          purchaseDate: pallet.purchaseDate.toISOString(),
          totalCost: cost,
          manifestUrl: pallet.manifestUrl,
          category: pallet.category,
          status: pallet.status,
          notes: pallet.notes,
          itemCount: pallet.items.length,
        }}
      />

      <div className={panelCls}>
        <div className="flex items-center justify-between border-b border-edge px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Items on this pallet</span>
          <Link href={`/inventory?palletId=${pallet.id}`} className="text-[12px] text-accent hover:underline">Open in inventory →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className={thCls}>SKU</th>
                <th className={thCls}>Name</th>
                <th className={thCls}>Condition</th>
                <th className={thCls + " text-right"}>Cost</th>
                <th className={thCls + " text-right"}>List</th>
                <th className={thCls + " text-right"}>Sold</th>
                <th className={thCls}>Status</th>
                <th className={thCls}>Location</th>
                <th className={thCls + " text-right"}>Days listed</th>
              </tr>
            </thead>
            <tbody>
              {pallet.items.map((i) => (
                <tr key={i.id} className="hover:bg-raised/60">
                  <td className={tdCls + " whitespace-nowrap"}>
                    <Link href={`/items/${i.id}`} className={`${monoCls} text-accent hover:underline`}>{i.sku}</Link>
                  </td>
                  <td className={tdCls}>{i.name}</td>
                  <td className={tdCls}>{label(i.condition)}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{money(i.ourCost.toNumber())}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{money(num(i.sellPrice))}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{money(num(i.soldPrice))}</td>
                  <td className={tdCls}><StatusBadge value={i.status} labelText={label(i.status)} color={STATUS_COLORS[i.status] ?? ""} /></td>
                  <td className={`${tdCls} ${monoCls}`}>{i.storageLocation ?? "—"}</td>
                  <td className={`${tdCls} ${monoCls} text-right`}>{i.status === "LISTED" ? daysSince(i.dateListed) ?? "—" : "—"}</td>
                </tr>
              ))}
              {pallet.items.length === 0 ? (
                <tr><td className={tdCls + " text-muted"} colSpan={9}>No items yet — start scanning.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
