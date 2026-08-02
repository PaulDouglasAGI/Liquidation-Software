import "server-only";
import { prisma } from "./db";
import { num } from "./serialize";
import { rankBundleCandidates, type LotCandidate } from "./lotMath";

/**
 * Listed stock stale enough to be worth bundling, stalest first.
 *
 * Lives here rather than in the page because reading the clock during a
 * component render is impure; lib functions are the right home for it.
 */
export async function getBundleCandidates(staleThreshold: number): Promise<LotCandidate[]> {
  const listed = await prisma.item.findMany({
    where: { status: "LISTED", lotId: null },
    select: {
      id: true, sku: true, name: true, ourCost: true, sellPrice: true,
      dateListed: true, category: true,
    },
    take: 1000,
  });

  const now = Date.now();
  const dayMs = 86_400_000;
  const candidates: LotCandidate[] = listed.map((i) => ({
    id: i.id,
    sku: i.sku,
    name: i.name,
    ourCost: i.ourCost.toNumber(),
    sellPrice: num(i.sellPrice),
    daysListed: i.dateListed ? Math.floor((now - i.dateListed.getTime()) / dayMs) : null,
    category: i.category as string,
  }));

  return rankBundleCandidates(candidates, staleThreshold);
}
