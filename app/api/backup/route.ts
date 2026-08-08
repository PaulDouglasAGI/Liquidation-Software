import { prisma } from "@/lib/db";
import { ownerOrResponse } from "@/lib/api";
import { NextResponse } from "next/server";
import { toPlain } from "@/lib/serialize";
import { isCredentialKey } from "@/lib/credentials";

/**
 * One-click full data backup as JSON (Settings → Download backup).
 * Includes all business data; excludes password hashes and API credentials.
 * Item photo FILES are not embedded — back up the uploads directory alongside.
 */
export async function GET() {
  // Owner only, to match restore. A backup is the whole book of business in
  // one file — every pallet cost and sale price, every buyer's name and
  // shipping address, every user's email. Any signed-in account could
  // download it, so a temp with a login could walk off with the lot.
  const owner = await ownerOrResponse();
  if (owner instanceof NextResponse) return owner;

  const [pallets, items, expenses, supplierPurchases, settings, templates, locations, users,
         orders, lots, countSessions, countScans, savedViews, laborEntries, orderLines] =
    await Promise.all([
      prisma.pallet.findMany({ orderBy: { palletCode: "asc" } }),
      prisma.item.findMany({ orderBy: { sku: "asc" } }),
      prisma.expense.findMany({ orderBy: { date: "asc" } }),
      prisma.supplierPurchase.findMany({ orderBy: { purchaseDate: "asc" } }),
      prisma.setting.findMany(),
      prisma.listingTemplate.findMany(),
      prisma.storageLocation.findMany(),
      prisma.user.findMany({ select: { id: true, email: true, name: true, createdAt: true } }),
      // v7 tables. Items carry FKs to Order and Lot, so a backup without these
      // cannot be restored — the item INSERT fails on a dangling reference.
      prisma.order.findMany({ orderBy: { orderNumber: "asc" } }),
      prisma.lot.findMany({ orderBy: { lotCode: "asc" } }),
      prisma.countSession.findMany({ orderBy: { startedAt: "asc" } }),
      prisma.countScan.findMany(),
      prisma.savedView.findMany(),
      // v8. Hours are typed in by hand and exist nowhere else — leaving them
      // out would make a restore quietly erase every labor-derived metric.
      prisma.laborEntry.findMany({ orderBy: { date: "asc" } }),
      // v9. What each order actually contained. Item.orderRecordId only points
      // at the order holding a unit right now, so a backup without these loses
      // the contents of every order a returned unit was later resold off.
      prisma.orderLine.findMany({ orderBy: { createdAt: "asc" } }),
    ]);

  const backup = {
    app: "liquidation-ops",
    version: 5,
    exportedAt: new Date().toISOString(),
    counts: {
      pallets: pallets.length, items: items.length, expenses: expenses.length,
      orders: orders.length, lots: lots.length, laborEntries: laborEntries.length,
    },
    pallets: toPlain(pallets),
    items: toPlain(items),
    expenses: toPlain(expenses),
    supplierPurchases: toPlain(supplierPurchases),
    // API credentials stay out of backups on purpose. Matched against the
    // shared credential list rather than an ad-hoc regex, so a newly added
    // key cannot silently start leaking into every downloaded backup.
    settings: settings.filter((s) => !isCredentialKey(s.key)),
    listingTemplates: templates,
    storageLocations: locations,
    users: toPlain(users),
    orders: toPlain(orders),
    lots: toPlain(lots),
    countSessions: toPlain(countSessions),
    countScans: toPlain(countScans),
    savedViews: toPlain(savedViews),
    laborEntries: toPlain(laborEntries),
    orderLines: toPlain(orderLines),
  };

  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="liqops-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
