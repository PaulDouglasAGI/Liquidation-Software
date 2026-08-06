import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, notFound, parseMoney, serverError, unauthorized } from "@/lib/api";
import { normalizeBrand } from "@/lib/parse";
import { createItemBatches, isUniqueViolation, type ItemBatch } from "@/lib/skus";
import { recalcPalletStatus } from "@/lib/pallets";
import { getSettingNum } from "@/lib/settings";
import { CATEGORIES, CONDITIONS } from "@/lib/constants";
import { logActivity } from "@/lib/activity";

const MAX_ROWS = 500;
const MAX_QTY_PER_ROW = 50;
// A 500-row manifest at 50 units each is 25k inserts; give the batch room.
const TX_OPTS = { timeout: 60_000, maxWait: 10_000 };

interface ImportRow {
  name?: unknown;
  upc?: unknown;
  brand?: unknown;
  msrp?: unknown;
  qty?: unknown;
  condition?: unknown;
  category?: unknown;
  notes?: unknown;
}

/**
 * Bulk-create items on a pallet from a parsed manifest CSV.
 * Body: { rows: [{ name, upc?, brand?, msrp?, qty?, condition?, category?, notes? }] }
 * A row with qty N creates N individual items (unit-level inventory).
 *
 * The whole import is one transaction: it either lands completely or not at
 * all, so a failure halfway can't leave a pallet holding a partial manifest
 * that a retry would then duplicate.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  try {
    const { id } = await params;
    const pallet = await prisma.pallet.findUnique({ where: { id } });
    if (!pallet) return notFound("Pallet not found");

    const body = await req.json().catch(() => null);
    const rows: ImportRow[] = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) return badRequest("No rows to import");
    if (rows.length > MAX_ROWS) return badRequest(`Too many rows (max ${MAX_ROWS} per import)`);

    const pctOfMsrp = await getSettingNum("defaultPricePct");
    const batches: ItemBatch[] = [];
    const errors: string[] = [];

    for (const [idx, raw] of rows.entries()) {
      const name = typeof raw.name === "string" ? raw.name.trim() : "";
      if (!name) {
        errors.push(`Row ${idx + 1}: missing product name — skipped`);
        continue;
      }
      const qtyRaw = String(raw.qty ?? "").trim();
      const qtyNum = qtyRaw === "" ? 1 : parseInt(qtyRaw, 10);
      if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
        errors.push(`Row ${idx + 1}: quantity "${qtyRaw}" — skipped`);
        continue;
      }
      const qty = Math.min(qtyNum, MAX_QTY_PER_ROW);
      if (qtyNum > MAX_QTY_PER_ROW) {
        // Silently capping made 200 units become 50 with no indication.
        errors.push(`Row ${idx + 1}: quantity ${qtyNum} capped at ${MAX_QTY_PER_ROW}`);
      }
      const msrp = parseMoney(raw.msrp);
      // Decimal(12,2) tops out below 10^10; one absurd value would otherwise
      // abort the entire import with a raw database error.
      if (msrp !== null && msrp >= 1e10) {
        errors.push(`Row ${idx + 1}: MSRP ${msrp} is out of range — skipped`);
        continue;
      }
      const sellPrice = msrp !== null ? Math.round(msrp * pctOfMsrp) / 100 : null;
      const conditionRaw = typeof raw.condition === "string" ? raw.condition.trim().toUpperCase().replace(/[\s-]+/g, "_") : "";
      const condition = (CONDITIONS as readonly string[]).includes(conditionRaw) ? conditionRaw : "GOOD";
      const category = (CATEGORIES as readonly string[]).includes(String(raw.category)) ? String(raw.category) : pallet.category;

      batches.push({
        qty,
        data: {
          name,
          upc: typeof raw.upc === "string" && raw.upc.trim() ? raw.upc.replace(/\D/g, "") || null : null,
          brand: normalizeBrand(raw.brand),
          category: category as never,
          condition: condition as never,
          msrp,
          sellPrice,
          notes: typeof raw.notes === "string" && raw.notes.trim() ? raw.notes.trim() : null,
        },
      });
    }

    // Retry the whole transaction on a SKU race — a unique violation aborts the
    // transaction, so the retry has to restart it rather than resume inside.
    let created = 0;
    for (let attempt = 0; ; attempt++) {
      try {
        created = await prisma.$transaction(async (tx) => {
          const n = await createItemBatches(id, batches, tx);

          // Spread pallet cost across items (manifest imports usually happen
          // before per-item costs are known). SOLD items keep their booked
          // cost — changing it would retroactively rewrite P&L margins.
          const total = await tx.item.count({ where: { palletId: id } });
          if (total > 0) {
            const per = Math.round((pallet.totalCost.toNumber() / total) * 100) / 100;
            await tx.item.updateMany({
              where: { palletId: id, status: { not: "SOLD" } },
              data: { ourCost: per },
            });
          }
          await recalcPalletStatus(id, tx);
          return n;
        }, TX_OPTS);
        break;
      } catch (e) {
        if (isUniqueViolation(e) && attempt < 3) continue;
        throw e;
      }
    }

    if (created > 0) logActivity(user.name, "pallet.import", `${created} item(s) into ${pallet.palletCode}`);
    return NextResponse.json({ ok: true, created, skipped: errors.length, errors: errors.slice(0, 20) });
  } catch (e) {
    return serverError(e);
  }
}
