import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { num } from "@/lib/serialize";
import LabelSheet from "@/components/LabelSheet";

export const dynamic = "force-dynamic";

/** Printable barcode labels for the items in ?ids=a,b,c */
export default async function LabelsPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  await requireUser();
  const { ids } = await searchParams;
  const idList = (ids ?? "").split(",").filter(Boolean).slice(0, 200);
  const items = idList.length
    ? await prisma.item.findMany({ where: { id: { in: idList } }, orderBy: { sku: "asc" } })
    : [];

  return (
    <LabelSheet
      items={items.map((i) => ({
        id: i.id,
        sku: i.sku,
        name: i.name,
        brand: i.brand,
        condition: i.condition,
        sellPrice: num(i.sellPrice),
        storageLocation: i.storageLocation,
      }))}
    />
  );
}
