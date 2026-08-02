import { requireUser } from "@/lib/auth";
import { computeInsights } from "@/lib/insights";
import BidCalculator from "@/components/BidCalculator";

export const dynamic = "force-dynamic";

export default async function BidPage() {
  await requireUser();
  const ins = await computeInsights();

  return (
    <BidCalculator
      knownCategories={ins.byCategory.map((c) => ({
        key: c.key,
        soldCount: c.soldCount,
        avgRecoveryPct: c.avgRecoveryPct,
        avgDaysToSell: c.avgDaysToSell,
      }))}
      totalSales={ins.overall.soldCount}
    />
  );
}
