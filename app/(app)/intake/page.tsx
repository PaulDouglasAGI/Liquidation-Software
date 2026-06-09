import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettingNum } from "@/lib/settings";
import IntakeClient from "@/components/IntakeClient";

export const dynamic = "force-dynamic";

export default async function IntakePage({ searchParams }: { searchParams: Promise<{ pallet?: string }> }) {
  await requireUser();
  const { pallet } = await searchParams;
  const [pallets, locations, defaultPricePct] = await Promise.all([
    prisma.pallet.findMany({
      where: { status: { not: "CLOSED" } },
      orderBy: { palletCode: "desc" },
      select: {
        id: true,
        palletCode: true,
        supplier: true,
        category: true,
        totalCost: true,
        _count: { select: { items: true } },
      },
    }),
    prisma.storageLocation.findMany({ orderBy: { code: "asc" }, select: { code: true } }),
    getSettingNum("defaultPricePct"),
  ]);

  return (
    <IntakeClient
      pallets={pallets.map((p) => ({
        id: p.id,
        code: p.palletCode,
        supplier: p.supplier,
        category: p.category,
        totalCost: p.totalCost.toNumber(),
        itemCount: p._count.items,
      }))}
      locations={locations.map((l) => l.code)}
      defaultPricePct={defaultPricePct}
      preselectedPalletId={pallet ?? null}
    />
  );
}
