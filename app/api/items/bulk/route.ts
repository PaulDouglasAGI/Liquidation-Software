import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, parseMoney, serverError, unauthorized } from "@/lib/api";
import { recalcPalletStatus } from "@/lib/pallets";
import { logActivity } from "@/lib/activity";
import { estimateFees } from "@/lib/fees";
import { getFeeRates } from "@/lib/settings";

/** Thrown to abort the transaction with a 400 rather than a 500. */
class BadAction extends Error {}

// A bulk repricing of a big pallet can run past Prisma's 5s interactive
// default, and a timeout mid-batch is exactly what the transaction exists to
// prevent, so allow real time to finish.
const TX_OPTS = { timeout: 30_000, maxWait: 10_000 };

/**
 * Bulk actions over selected items.
 * { ids: string[], action: "markSold" | "relist" | "markListed" | "changeLocation" | "scrap"
 *                        | "setPrices" | "repricePctMsrp" | "repriceDiscountPct" | "repriceDiscountFlat",
 *   payload?: { location?, pct?, amount?, platform?, prices? } }
 *
 * The whole batch runs in one transaction: a failure partway through rolls
 * everything back rather than leaving half the items repriced or sold.
 */
export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  try {
    const b = await req.json().catch(() => null);
    const ids: string[] = Array.isArray(b?.ids) ? b.ids.filter((x: unknown) => typeof x === "string") : [];
    if (ids.length === 0) return badRequest("No items selected");
    const action = b.action as string;
    const payload = b.payload ?? {};

    // Read fee rates before opening the transaction — it's an unrelated lookup
    // and holding the transaction open for it only adds contention.
    const rates = action === "markSold" ? await getFeeRates() : null;

    const { updated, touchedPallets } = await prisma.$transaction(async (tx) => {
      const items = await tx.item.findMany({ where: { id: { in: ids } } });
      if (items.length === 0) throw new BadAction("Items not found");

      let updated = 0;
      switch (action) {
        case "markSold": {
          for (const item of items) {
            const soldPrice = parseMoney(payload.soldPrice) ?? item.soldPrice?.toNumber() ?? item.sellPrice?.toNumber() ?? null;
            const feesAmount = item.feesAmount?.toNumber() ?? estimateFees(soldPrice, item.platform, rates!);
            await tx.item.update({
              where: { id: item.id },
              data: { status: "SOLD", soldPrice, feesAmount, dateSold: item.dateSold ?? new Date() },
            });
            updated++;
          }
          break;
        }
        case "markListed": {
          // Non-destructive: only lifts unlisted stock to LISTED. Never touches
          // SOLD items (that would erase sale history) or restamps items already
          // listed (that would reset their aging clock).
          const res = await tx.item.updateMany({
            where: { id: { in: ids }, status: "IN_STOCK" },
            data: { status: "LISTED", dateListed: new Date() },
          });
          updated = res.count;
          break;
        }
        case "relist": {
          // Explicitly destructive: puts items back on the market as a fresh
          // listing, clearing any previous sale.
          const res = await tx.item.updateMany({
            where: { id: { in: ids } },
            data: { status: "LISTED", dateListed: new Date(), dateSold: null, soldPrice: null, feesAmount: null, shippingCost: null },
          });
          updated = res.count;
          break;
        }
        case "changeLocation": {
          const location = typeof payload.location === "string" ? payload.location.trim() : "";
          const res = await tx.item.updateMany({ where: { id: { in: ids } }, data: { storageLocation: location || null } });
          updated = res.count;
          break;
        }
        case "scrap": {
          const res = await tx.item.updateMany({ where: { id: { in: ids } }, data: { status: "SCRAPPED" } });
          updated = res.count;
          break;
        }
        case "setPrices": {
          // Per-item prices, e.g. applying the Insights repricing suggestions:
          // payload.prices = { itemId: newPrice }
          const prices = payload.prices ?? {};
          for (const item of items) {
            const price = parseMoney(prices[item.id]);
            if (price === null) continue;
            await tx.item.update({ where: { id: item.id }, data: { sellPrice: price } });
            updated++;
          }
          break;
        }
        case "repricePctMsrp": {
          const pctOfMsrp = parseMoney(payload.pct);
          if (pctOfMsrp === null || pctOfMsrp <= 0) throw new BadAction("Invalid % of MSRP");
          for (const item of items) {
            if (item.msrp === null) continue;
            const price = Math.round(item.msrp.toNumber() * pctOfMsrp) / 100;
            await tx.item.update({ where: { id: item.id }, data: { sellPrice: price } });
            updated++;
          }
          break;
        }
        case "repriceDiscountPct": {
          const off = parseMoney(payload.pct);
          if (off === null || off <= 0 || off >= 100) throw new BadAction("Invalid discount %");
          for (const item of items) {
            if (item.sellPrice === null) continue;
            const price = Math.round(item.sellPrice.toNumber() * (100 - off)) / 100;
            await tx.item.update({ where: { id: item.id }, data: { sellPrice: price } });
            updated++;
          }
          break;
        }
        case "repriceDiscountFlat": {
          const amount = parseMoney(payload.amount);
          if (amount === null || amount <= 0) throw new BadAction("Invalid discount amount");
          for (const item of items) {
            if (item.sellPrice === null) continue;
            const price = Math.max(0, Math.round((item.sellPrice.toNumber() - amount) * 100) / 100);
            await tx.item.update({ where: { id: item.id }, data: { sellPrice: price } });
            updated++;
          }
          break;
        }
        default:
          throw new BadAction(`Unknown action: ${action}`);
      }

      // Inside the transaction so pallet status can never reflect a batch that
      // later rolls back.
      const touchedPallets = [...new Set(items.map((i) => i.palletId))];
      for (const palletId of touchedPallets) {
        await recalcPalletStatus(palletId, tx);
      }
      return { updated, touchedPallets };
    }, TX_OPTS);

    if (updated > 0) logActivity(user.name, "items.bulk", `${action}: ${updated} item(s)`);
    return NextResponse.json({ ok: true, updated, pallets: touchedPallets.length });
  } catch (e) {
    if (e instanceof BadAction) return badRequest(e.message);
    return serverError(e);
  }
}
