import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, parseDate, serverError, unauthorized } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { LABOR_ACTIVITIES, type LaborActivityValue } from "@/lib/lotPerformanceMath";

/** A single session longer than this is almost certainly a typo (16.0 for 1.60). */
const MAX_HOURS_PER_ENTRY = 24;

/** GET /api/labor?palletId=… — the labor log, newest first. */
export async function GET(req: NextRequest) {
  if (!(await apiUser())) return unauthorized();
  try {
    const palletId = req.nextUrl.searchParams.get("palletId");
    const entries = await prisma.laborEntry.findMany({
      where: palletId ? { palletId } : undefined,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: { pallet: { select: { palletCode: true } } },
    });
    return NextResponse.json({
      entries: entries.map((e) => ({
        id: e.id,
        palletId: e.palletId,
        palletCode: e.pallet.palletCode,
        userName: e.userName,
        date: e.date.toISOString(),
        hours: e.hours.toNumber(),
        activity: e.activity,
        notes: e.notes,
      })),
    });
  } catch (e) {
    return serverError(e);
  }
}

/**
 * POST /api/labor { palletId, hours, activity?, date?, notes? }
 *
 * Logged after physical work, usually one-handed on a phone, so everything
 * except the lot and the number has a sensible default.
 */
export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  try {
    const b = await req.json().catch(() => null);

    const palletId = typeof b?.palletId === "string" ? b.palletId.trim() : "";
    if (!palletId) return badRequest("Pick a lot to log against");

    // Not parseMoney: hours are not money, and a bare "0" must be rejected
    // rather than quietly stored as a session that never happened.
    const raw = typeof b.hours === "number" ? b.hours : Number(String(b?.hours ?? "").trim());
    if (!Number.isFinite(raw) || raw <= 0) return badRequest("Enter how many hours you worked");
    if (raw > MAX_HOURS_PER_ENTRY) {
      return badRequest(`That's ${raw} hours in one session — log it as separate days`);
    }
    const hours = Math.round(raw * 100) / 100;

    const activity: LaborActivityValue = LABOR_ACTIVITIES.includes(b?.activity)
      ? b.activity
      : "TESTING_SORTING";

    // Defaults to now, so the common case is lot + hours and nothing else.
    const date = parseDate(b?.date) ?? new Date();

    const lot = await prisma.pallet.findUnique({
      where: { id: palletId },
      select: { id: true, palletCode: true },
    });
    if (!lot) return badRequest("That lot no longer exists");

    const entry = await prisma.laborEntry.create({
      data: {
        palletId: lot.id,
        userId: user.id,
        userName: user.name,
        date,
        hours,
        activity,
        notes: typeof b.notes === "string" ? b.notes.trim().slice(0, 500) || null : null,
      },
    });

    logActivity(user.name, "labor.log", `${hours}h ${activity} on ${lot.palletCode}`);

    // Return the running total so the phone can confirm the save landed
    // without a second round trip.
    const total = await prisma.laborEntry.aggregate({
      where: { palletId: lot.id },
      _sum: { hours: true },
    });

    return NextResponse.json({
      id: entry.id,
      palletCode: lot.palletCode,
      hours,
      totalHours: total._sum.hours?.toNumber() ?? hours,
    });
  } catch (e) {
    return serverError(e);
  }
}
