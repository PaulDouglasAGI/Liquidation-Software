import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num } from "@/lib/serialize";
import { money } from "@/lib/format";
import { label } from "@/lib/constants";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

/** A packing slip that goes in the box. Plain black-on-white for printing. */
export default async function PackingSlipPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: { select: { sku: true, name: true, soldPrice: true, storageLocation: true }, orderBy: { sku: "asc" } } },
  });
  if (!order) notFound();

  const total = order.items.reduce((s, i) => s + (num(i.soldPrice) ?? 0), 0);
  const ship = [order.shipToName, order.shipToLine1, order.shipToLine2,
    [order.shipToCity, order.shipToState, order.shipToPostal].filter(Boolean).join(", "),
    order.shipToCountry].filter(Boolean);

  return (
    <div className="bg-white p-6 text-black print:p-0">
      <style>{`@media print { .no-print { display: none } @page { margin: 12mm } }`}</style>

      <div className="no-print mb-4">
        <PrintButton label="Print packing slip" />
      </div>

      <div className="mx-auto max-w-2xl">
        <div className="flex items-start justify-between border-b-2 border-black pb-3">
          <div>
            <h1 className="text-xl font-bold">Packing Slip</h1>
            <p className="font-mono text-sm">{order.orderNumber}</p>
          </div>
          <div className="text-right text-sm">
            <p>{order.soldAt ? new Date(order.soldAt).toLocaleDateString() : ""}</p>
            {order.platform ? <p>{label(order.platform)}</p> : null}
            {order.externalId ? <p className="font-mono text-xs">{order.externalId}</p> : null}
          </div>
        </div>

        {ship.length > 0 ? (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider">Ship to</p>
            {ship.map((linePart, n) => <p key={n} className="text-sm">{linePart}</p>)}
          </div>
        ) : order.buyerName ? (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider">Buyer</p>
            <p className="text-sm">{order.buyerName}</p>
          </div>
        ) : null}

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="py-1">SKU</th>
              <th className="py-1">Item</th>
              <th className="py-1 text-right">Price</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((i) => (
              <tr key={i.sku} className="border-b border-gray-300">
                <td className="py-1 font-mono text-xs">{i.sku}</td>
                <td className="py-1">{i.name}</td>
                <td className="py-1 text-right">{money(num(i.soldPrice))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="py-2" colSpan={2}>Total ({order.items.length} item{order.items.length === 1 ? "" : "s"})</td>
              <td className="py-2 text-right">{money(total)}</td>
            </tr>
          </tfoot>
        </table>

        {order.trackingNumber ? (
          <p className="mt-4 text-sm">
            <span className="font-semibold">Tracking:</span> {order.carrier ? `${order.carrier} ` : ""}
            <span className="font-mono">{order.trackingNumber}</span>
          </p>
        ) : null}

        <p className="mt-8 border-t border-gray-300 pt-3 text-center text-xs">
          Thank you for your order. Questions? Reply through the marketplace message centre.
        </p>
      </div>
    </div>
  );
}
