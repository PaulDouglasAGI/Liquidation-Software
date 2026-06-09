import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { num } from "@/lib/serialize";
import ItemEditor from "@/components/ItemEditor";

export const dynamic = "force-dynamic";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const [item, locations] = await Promise.all([
    prisma.item.findUnique({ where: { id }, include: { pallet: { select: { id: true, palletCode: true } } } }),
    prisma.storageLocation.findMany({ orderBy: { code: "asc" }, select: { code: true } }),
  ]);
  if (!item) notFound();

  return (
    <ItemEditor
      item={{
        id: item.id,
        sku: item.sku,
        upc: item.upc,
        name: item.name,
        brand: item.brand,
        category: item.category,
        condition: item.condition,
        conditionNotes: item.conditionNotes,
        msrp: num(item.msrp),
        ourCost: item.ourCost.toNumber(),
        sellPrice: num(item.sellPrice),
        soldPrice: num(item.soldPrice),
        photos: item.photos,
        serialNumber: item.serialNumber,
        weightLbs: num(item.weightLbs),
        lengthIn: num(item.lengthIn),
        widthIn: num(item.widthIn),
        heightIn: num(item.heightIn),
        storageLocation: item.storageLocation,
        status: item.status,
        platform: item.platform,
        listingUrl: item.listingUrl,
        listingIdEbay: item.listingIdEbay,
        dateListed: item.dateListed?.toISOString() ?? null,
        dateSold: item.dateSold?.toISOString() ?? null,
        orderId: item.orderId,
        notes: item.notes,
        palletId: item.pallet.id,
        palletCode: item.pallet.palletCode,
      }}
      locations={locations.map((l) => l.code)}
    />
  );
}
