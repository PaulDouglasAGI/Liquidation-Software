import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettingNum } from "@/lib/settings";
import { buildItemOrderBy, buildItemWhere, type ItemFilterParams } from "@/lib/itemFilters";
import { num } from "@/lib/serialize";
import InventoryTable, { type InvRow } from "@/components/InventoryTable";
import InventoryFilters from "@/components/InventoryFilters";

export const dynamic = "force-dynamic";

const PER_PAGE = 50;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<ItemFilterParams> }) {
  await requireUser();
  const params = await searchParams;
  const agingDays = await getSettingNum("agingDays");
  const where = buildItemWhere(params, agingDays);
  const page = Math.max(1, parseInt(String(params.page ?? "1"), 10) || 1);

  const [items, total, pallets, locations] = await Promise.all([
    prisma.item.findMany({
      where,
      orderBy: buildItemOrderBy(params),
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: { pallet: { select: { palletCode: true } } },
    }),
    prisma.item.count({ where }),
    prisma.pallet.findMany({ orderBy: { palletCode: "desc" }, select: { id: true, palletCode: true } }),
    prisma.storageLocation.findMany({ orderBy: { code: "asc" }, select: { code: true } }),
  ]);

  const rows: InvRow[] = items.map((i) => ({
    id: i.id,
    sku: i.sku,
    name: i.name,
    brand: i.brand,
    condition: i.condition,
    ourCost: i.ourCost.toNumber(),
    sellPrice: num(i.sellPrice),
    soldPrice: num(i.soldPrice),
    msrp: num(i.msrp),
    status: i.status,
    platform: i.platform,
    storageLocation: i.storageLocation,
    palletCode: i.pallet.palletCode,
    dateListed: i.dateListed?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-3">
      <h1 className="text-base font-semibold text-zinc-100">Inventory</h1>
      <InventoryFilters
        pallets={pallets}
        params={Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v ?? ""]))}
      />
      <InventoryTable
        rows={rows}
        total={total}
        page={page}
        perPage={PER_PAGE}
        agingDays={agingDays}
        locations={locations.map((l) => l.code)}
      />
    </div>
  );
}
