import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, notFound, parseMoney, serverError, unauthorized } from "@/lib/api";
import { estimateFees } from "@/lib/fees";
import { getFeeRates } from "@/lib/settings";
import { logActivity } from "@/lib/activity";

/**
 * PATCH /api/lots/[id] — { status, soldPrice?, platform? }
 *
 * Selling a lot settles every item in it: the sale price is split across the
 * units by their individual asking prices, so per-item and per-pallet P&L
 * stay meaningful instead of one unit carrying the whole lot's revenue.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  try {
    const { id } = await params;
    const lot = await prisma.lot.findUnique({ where: { id }, include: { items: true } });
    if (!lot) return notFound("Lot not found");
    const b = await req.json().catch(() => null);
    const status = typeof b?.status === "string" ? b.status : "";
    if (!["DRAFT", "LISTED", "SOLD", "CANCELLED"].includes(status)) return badRequest("Invalid status");

    const now = new Date();
    const rates = await getFeeRates();

    if (status === "SOLD") {
      const soldPrice = parseMoney(b.soldPrice) ?? (lot.askingPrice?.toNumber() ?? null);
      if (soldPrice === null) return badRequest("Set a sale price for the lot");
      const platform = (typeof b.platform === "string" ? b.platform : lot.platform) ?? "OTHER";

      // Split by asking price; fall back to an even split when prices are unset.
      const weights = lot.items.map((i) => i.sellPrice?.toNumber() ?? 0);
      const totalWeight = weights.reduce((a, w) => a + w, 0);
      const even = lot.items.length ? soldPrice / lot.items.length : 0;

      await prisma.$transaction(async (tx) => {
        for (const [idx, item] of lot.items.entries()) {
          const share = totalWeight > 0 ? (weights[idx] / totalWeight) * soldPrice : even;
          const rounded = Math.round(share * 100) / 100;
          await tx.item.update({
            where: { id: item.id },
            data: {
              status: "SOLD",
              soldPrice: rounded,
              platform: platform as never,
              dateSold: now,
              feesAmount: estimateFees(rounded, platform, rates),
            },
          });
        }
        await tx.lot.update({
          where: { id },
          data: { status: "SOLD", soldPrice, dateSold: now, platform: platform as never },
        });
      }, { timeout: 30_000 });

      logActivity(user.name, "lot.sold", `${lot.lotCode} sold for ${soldPrice}`);
      return NextResponse.json({ ok: true, status, itemsSettled: lot.items.length });
    }

    if (status === "CANCELLED") {
      // Break the bundle up and put the goods back on the market.
      await prisma.$transaction(async (tx) => {
        await tx.item.updateMany({
          where: { lotId: id },
          data: { lotId: null, status: "LISTED" },
        });
        await tx.lot.update({ where: { id }, data: { status: "CANCELLED" } });
      });
      logActivity(user.name, "lot.cancel", `${lot.lotCode} broken up`);
      return NextResponse.json({ ok: true, status });
    }

    await prisma.lot.update({
      where: { id },
      data: { status: status as never, dateListed: status === "LISTED" ? (lot.dateListed ?? now) : lot.dateListed },
    });
    logActivity(user.name, "lot.update", `${lot.lotCode} -> ${status}`);
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    return serverError(e);
  }
}
