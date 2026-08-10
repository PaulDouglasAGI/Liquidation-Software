import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { badRequest, ownerOrResponse, serverError } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { isCredentialKey } from "@/lib/credentials";

const MAX_ITEMS = 50_000;

const asArray = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v : []);

/**
 * Restores a backup produced by GET /api/backup, REPLACING all business data
 * (pallets, items, expenses, purchases, templates, locations, non-credential
 * settings). User accounts and saved API credentials are left untouched —
 * backups intentionally contain neither. Photo files are not restored; items
 * keep their photo paths so copying the uploads folder back completes it.
 *
 * Owner-only: this destroys every pallet, item, and expense in the install.
 */
export async function POST(req: NextRequest) {
  const user = await ownerOrResponse();
  if (user instanceof NextResponse) return user;
  try {
    const body = await req.json().catch(() => null);
    if (body?.confirm !== true) return badRequest("Missing confirmation flag");
    const b = body.backup;
    if (b?.app !== "liquidation-ops") return badRequest("Not a Liquidation Ops backup file");

    const pallets = asArray(b.pallets);
    const items = asArray(b.items);
    const expenses = asArray(b.expenses);
    const purchases = asArray(b.supplierPurchases);
    const settings = asArray(b.settings);
    const templates = asArray(b.listingTemplates);
    const locations = asArray(b.storageLocations);
    // v7 tables. Absent from version <= 2 backups, which is fine — the item
    // FKs pointing at them are stripped below so an old file still restores.
    const orders = asArray(b.orders);
    const lots = asArray(b.lots);
    const countSessions = asArray(b.countSessions);
    const countScans = asArray(b.countScans);
    // v9. Older backups have none; the fallback below rebuilds them from items
    // so an upgrade from an old file does not restore empty packing slips.
    const orderLines = asArray(b.orderLines);
    // v10. Older backups have none — the adverts simply are not known, which
    // is honest; inventing them would be worse.
    const listings = asArray(b.listings);
    const savedViews = asArray(b.savedViews);
    // v8. Absent from older backups, which just means no hours to restore.
    const laborEntries = asArray(b.laborEntries);
    if (items.length > MAX_ITEMS) return badRequest("Backup too large");
    if (pallets.length === 0 && items.length === 0) return badRequest("Backup contains no data");

    // An item's orderRecordId/lotId must reference a row that will exist after
    // the restore. A backup taken before v7 has no orders/lots arrays at all,
    // and any file can be edited, so drop references we cannot satisfy rather
    // than letting the whole restore die on a foreign-key violation.
    const orderIds = new Set(orders.map((o) => String(o.id)));
    const lotIds = new Set(lots.map((l) => String(l.id)));
    const itemIds = new Set(items.map((i) => String(i.id)));
    let droppedRefs = 0;
    for (const it of items) {
      if (it.orderRecordId && !orderIds.has(String(it.orderRecordId))) {
        it.orderRecordId = null;
        droppedRefs++;
      }
      if (it.lotId && !lotIds.has(String(it.lotId))) {
        it.lotId = null;
        droppedRefs++;
      }
    }

    // Same problem for labor: the entry points at a Pallet (must exist) and a
    // User (accounts are not restored from the file, so the id may be for
    // someone who does not exist here). userName is a snapshot, so dropping
    // the user link costs nothing — the entry stays attributed by name.
    const palletIds = new Set(pallets.map((p) => String(p.id)));
    const userIds = new Set(
      (await prisma.user.findMany({ select: { id: true } })).map((u) => u.id)
    );
    const restorableLabor = laborEntries.filter((l) => {
      if (!l.palletId || !palletIds.has(String(l.palletId))) {
        droppedRefs++;
        return false; // its lot is gone; the hours have nothing to attach to
      }
      if (l.userId && !userIds.has(String(l.userId))) {
        l.userId = null;
        droppedRefs++;
      }
      return true;
    });

    await prisma.$transaction(
      async (tx) => {
        // Delete children before parents; recreate in the reverse order.
        await tx.listing.deleteMany();
        await tx.orderLine.deleteMany();
        await tx.countScan.deleteMany();
        await tx.countSession.deleteMany();
        await tx.laborEntry.deleteMany();
        await tx.item.deleteMany();
        await tx.order.deleteMany();
        await tx.lot.deleteMany();
        await tx.pallet.deleteMany();
        await tx.expense.deleteMany();
        await tx.supplierPurchase.deleteMany();
        await tx.savedView.deleteMany();

        if (pallets.length) await tx.pallet.createMany({ data: pallets as unknown as Prisma.PalletCreateManyInput[] });
        if (orders.length) await tx.order.createMany({ data: orders as unknown as Prisma.OrderCreateManyInput[] });
        if (lots.length) await tx.lot.createMany({ data: lots as unknown as Prisma.LotCreateManyInput[] });
        if (items.length) await tx.item.createMany({ data: items as unknown as Prisma.ItemCreateManyInput[] });
        // Lines reference both, so they go in after orders and items.
        const restorableLines = orderLines.filter(
          (l) => orderIds.has(String(l.orderId)) && (l.itemId == null || itemIds.has(String(l.itemId)))
        );
        if (restorableLines.length) {
          await tx.orderLine.createMany({ data: restorableLines as unknown as Prisma.OrderLineCreateManyInput[] });
        } else if (items.length) {
          // Pre-v9 backup: reconstruct each order's contents from the items
          // that point at it, exactly as the schema migration does.
          const rebuilt = items
            .filter((i) => i.orderRecordId && orderIds.has(String(i.orderRecordId)))
            .map((i) => ({
              orderId: String(i.orderRecordId),
              itemId: String(i.id),
              sku: String(i.sku),
              name: String(i.name),
              soldPrice: (i.soldPrice ?? null) as never,
              feesAmount: (i.feesAmount ?? null) as never,
            }));
          if (rebuilt.length) await tx.orderLine.createMany({ data: rebuilt });
        }
        if (restorableLabor.length) await tx.laborEntry.createMany({ data: restorableLabor as unknown as Prisma.LaborEntryCreateManyInput[] });
        if (countSessions.length) await tx.countSession.createMany({ data: countSessions as unknown as Prisma.CountSessionCreateManyInput[] });
        if (countScans.length) await tx.countScan.createMany({ data: countScans as unknown as Prisma.CountScanCreateManyInput[] });
        if (savedViews.length) await tx.savedView.createMany({ data: savedViews as unknown as Prisma.SavedViewCreateManyInput[] });
        const restorableListings = listings.filter((l) => itemIds.has(String(l.itemId)));
        if (restorableListings.length) {
          await tx.listing.createMany({ data: restorableListings as unknown as Prisma.ListingCreateManyInput[] });
        }
        if (expenses.length) await tx.expense.createMany({ data: expenses as unknown as Prisma.ExpenseCreateManyInput[] });
        if (purchases.length) await tx.supplierPurchase.createMany({ data: purchases as unknown as Prisma.SupplierPurchaseCreateManyInput[] });

        for (const s of settings) {
          if (typeof s.key !== "string" || typeof s.value !== "string") continue;
          if (isCredentialKey(s.key)) continue; // never restore credentials from a file
          await tx.setting.upsert({ where: { key: s.key }, update: { value: s.value }, create: { key: s.key, value: s.value } });
        }
        for (const t of templates) {
          if (typeof t.category !== "string") continue;
          await tx.listingTemplate.upsert({
            where: { category: t.category as never },
            update: { titleTemplate: String(t.titleTemplate ?? ""), descriptionTemplate: String(t.descriptionTemplate ?? "") },
            create: {
              category: t.category as never,
              titleTemplate: String(t.titleTemplate ?? ""),
              descriptionTemplate: String(t.descriptionTemplate ?? ""),
            },
          });
        }
        for (const l of locations) {
          if (typeof l.code !== "string") continue;
          await tx.storageLocation.upsert({
            where: { code: l.code },
            update: { notes: (l.notes as string) ?? null },
            create: { code: l.code, notes: (l.notes as string) ?? null },
          });
        }
      },
      { timeout: 60_000 }
    );

    logActivity(user.name, "data.restore", `Restored backup from ${b.exportedAt ?? "unknown date"}: ${pallets.length} pallets, ${items.length} items`);
    return NextResponse.json({
      ok: true,
      restored: {
        pallets: pallets.length, items: items.length, expenses: expenses.length,
        purchases: purchases.length, orders: orders.length, lots: lots.length,
        laborEntries: restorableLabor.length,
      },
      // Surfaced so a pre-v7 restore explains why order links are gone.
      droppedRefs,
    });
  } catch (e) {
    return serverError(e);
  }
}
