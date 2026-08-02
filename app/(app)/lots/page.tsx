import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num } from "@/lib/serialize";
import { getSettingNum } from "@/lib/settings";
import { getBundleCandidates } from "@/lib/lots";
import LotsClient from "@/components/LotsClient";

export const dynamic = "force-dynamic";

export default async function LotsPage() {
  await requireUser();
  const agingDays = await getSettingNum("agingDays");
  // Bundling is for stock that individual repricing has already failed to move.
  const staleThreshold = Math.max(agingDays * 2, 60);

  const [lots, candidates] = await Promise.all([
    prisma.lot.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { _count: { select: { items: true } } },
    }),
    getBundleCandidates(staleThreshold),
  ]);

  return (
    <LotsClient
      staleThreshold={staleThreshold}
      candidates={candidates}
      lots={lots.map((l) => ({
        id: l.id,
        lotCode: l.lotCode,
        name: l.name,
        status: l.status,
        askingPrice: num(l.askingPrice),
        soldPrice: num(l.soldPrice),
        itemCount: l._count.items,
        createdAt: l.createdAt.toISOString(),
      }))}
    />
  );
}
