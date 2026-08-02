import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, serverError, unauthorized } from "@/lib/api";
import { logActivity } from "@/lib/activity";

/** GET /api/counts — recent count sessions. */
export async function GET() {
  if (!(await apiUser())) return unauthorized();
  try {
    const sessions = await prisma.countSession.findMany({
      orderBy: { startedAt: "desc" },
      take: 50,
      include: { _count: { select: { scans: true } } },
    });
    return NextResponse.json({ sessions });
  } catch (e) {
    return serverError(e);
  }
}

/** POST /api/counts { location } — open a stock-take for one shelf. */
export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  try {
    const b = await req.json().catch(() => null);
    const location = typeof b?.location === "string" ? b.location.trim() : "";
    if (!location) return badRequest("Pick a location to count");

    // One open session per shelf, so two people counting the same rack share
    // scans instead of each seeing half the shelf as missing.
    const existing = await prisma.countSession.findFirst({ where: { location, status: "OPEN" } });
    if (existing) return NextResponse.json({ id: existing.id, resumed: true });

    const session = await prisma.countSession.create({
      data: { location, startedBy: user.name },
    });
    logActivity(user.name, "count.start", `Counting ${location}`);
    return NextResponse.json({ id: session.id, resumed: false });
  } catch (e) {
    return serverError(e);
  }
}
