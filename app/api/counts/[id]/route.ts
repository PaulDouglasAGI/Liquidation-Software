import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, notFound, serverError, unauthorized } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { ON_HAND_STATUSES, reconcileCount, missingValue, type ExpectedItem } from "@/lib/countMath";

async function loadReconciliation(sessionId: string) {
  const session = await prisma.countSession.findUnique({
    where: { id: sessionId },
    include: { scans: true },
  });
  if (!session) return null;

  const expectedRows = await prisma.item.findMany({
    where: { storageLocation: session.location, status: { in: ON_HAND_STATUSES as never } },
    select: { id: true, sku: true, name: true, storageLocation: true, status: true, ourCost: true },
  });
  const expected: ExpectedItem[] = expectedRows.map((i) => ({
    id: i.id, sku: i.sku, name: i.name, storageLocation: i.storageLocation, status: i.status as string,
  }));

  // Look up scanned codes that aren't on this shelf so they can be reported as
  // misplaced (system knows the item, wrong shelf) rather than unknown.
  const scannedSkus = session.scans.map((s) => s.sku.trim().toUpperCase());
  const others = scannedSkus.length
    ? await prisma.item.findMany({
        where: { sku: { in: scannedSkus, mode: "insensitive" } },
        select: { id: true, sku: true, name: true, storageLocation: true, status: true },
      })
    : [];
  const allBySku = new Map(others.map((i) => [i.sku.toUpperCase(), i as ExpectedItem]));

  const result = reconcileCount(
    session.location,
    expected,
    session.scans.map((s) => ({ sku: s.sku, itemId: s.itemId })),
    allBySku
  );
  const costBySku = new Map(expectedRows.map((i) => [i.sku, i.ourCost.toNumber()]));
  return { session, result, missingValue: missingValue(result.missing, costBySku) };
}

/** GET /api/counts/[id] — live reconciliation for the open shelf. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await apiUser())) return unauthorized();
  try {
    const { id } = await params;
    const data = await loadReconciliation(id);
    if (!data) return notFound("Count session not found");
    return NextResponse.json({
      session: {
        id: data.session.id, location: data.session.location, status: data.session.status,
        startedBy: data.session.startedBy, startedAt: data.session.startedAt,
      },
      ...data.result,
      missingValue: data.missingValue,
    });
  } catch (e) {
    return serverError(e);
  }
}

/**
 * POST /api/counts/[id] — record a scan, or close / resolve the session.
 * { sku } | { action: "close" } | { action: "resolveMissing" | "resolveMisplaced" }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  try {
    const { id } = await params;
    const session = await prisma.countSession.findUnique({ where: { id } });
    if (!session) return notFound("Count session not found");
    const b = await req.json().catch(() => null);

    // Every mutating action needs the closed guard, not just scanning. A
    // closed count reflects the shelf as it was; re-running its resolutions
    // later would scrap or relocate stock that has since legitimately moved.
    if (session.status === "CLOSED" && b?.action !== "close") {
      return badRequest("This count is closed — start a new one for this shelf");
    }

    if (b?.action === "close") {
      await prisma.countSession.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date() } });
      const data = await loadReconciliation(id);
      logActivity(
        user.name, "count.close",
        `${session.location}: ${data?.result.found.length ?? 0} found, ${data?.result.missing.length ?? 0} missing`
      );
      return NextResponse.json({ ok: true, closed: true });
    }

    // Move everything scanned-but-shelved-elsewhere onto this shelf: the
    // physical location is the truth, the database is what's wrong.
    if (b?.action === "resolveMisplaced") {
      const data = await loadReconciliation(id);
      const ids = (data?.result.misplaced ?? []).map((m) => m.itemId);
      if (ids.length) {
        await prisma.item.updateMany({ where: { id: { in: ids } }, data: { storageLocation: session.location } });
        logActivity(user.name, "count.relocate", `${ids.length} item(s) moved to ${session.location}`);
      }
      return NextResponse.json({ ok: true, moved: ids.length });
    }

    // Missing stock is written off rather than left to be "sold" and hunted for.
    if (b?.action === "resolveMissing") {
      const data = await loadReconciliation(id);
      const ids = (data?.result.missing ?? []).map((m) => m.id);
      if (ids.length) {
        await prisma.$transaction(async (tx) => {
          await tx.item.updateMany({ where: { id: { in: ids } }, data: { status: "SCRAPPED" } });
          // Append the audit line instead of replacing whatever was there.
          await tx.$executeRaw`
            UPDATE "Item"
            SET "notes" = COALESCE(NULLIF("notes", '') || E'\n', '') ||
                          ${"Not found in count of " + session.location}
            WHERE "id" = ANY(${ids})`;
        });
        logActivity(user.name, "count.writeoff", `${ids.length} item(s) written off from ${session.location}`);
      }
      return NextResponse.json({ ok: true, writtenOff: ids.length });
    }

    const sku = typeof b?.sku === "string" ? b.sku.trim().toUpperCase() : "";
    if (!sku) return badRequest("Scan a SKU");
    const item = await prisma.item.findFirst({ where: { sku: { equals: sku, mode: "insensitive" } } });

    // Upsert so a double-scan is idempotent instead of an error in someone's face.
    await prisma.countScan.upsert({
      where: { sessionId_sku: { sessionId: id, sku } },
      update: { scannedAt: new Date() },
      create: { sessionId: id, sku, itemId: item?.id ?? null },
    });

    return NextResponse.json({
      ok: true,
      sku,
      known: Boolean(item),
      name: item?.name ?? null,
      expectedHere: item?.storageLocation === session.location,
      expectedLocation: item?.storageLocation ?? null,
    });
  } catch (e) {
    return serverError(e);
  }
}
