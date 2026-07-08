import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, serverError, unauthorized } from "@/lib/api";
import { estimateFees } from "@/lib/fees";
import { getFeeRates } from "@/lib/settings";
import { num } from "@/lib/serialize";
import { logActivity } from "@/lib/activity";

/**
 * One-time helper: stamps estimated platform fees onto SOLD items that
 * predate fee tracking (feesAmount is null). Idempotent — items that already
 * have a fee amount are never touched.
 */
export async function POST() {
  const user = await apiUser();
  if (!user) return unauthorized();
  try {
    const rates = await getFeeRates();
    const candidates = await prisma.item.findMany({
      where: { status: "SOLD", feesAmount: null, soldPrice: { not: null } },
      select: { id: true, soldPrice: true, platform: true },
    });

    let updated = 0;
    for (const item of candidates) {
      const fees = estimateFees(num(item.soldPrice), item.platform, rates);
      if (fees === null) continue;
      await prisma.item.update({ where: { id: item.id }, data: { feesAmount: fees } });
      updated++;
    }
    if (updated > 0) {
      logActivity(user.name, "fees.backfill", `Estimated fees stamped on ${updated} past sale(s)`);
    }
    return NextResponse.json({ ok: true, updated });
  } catch (e) {
    return serverError(e);
  }
}
