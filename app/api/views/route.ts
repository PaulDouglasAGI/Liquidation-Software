import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, serverError, unauthorized } from "@/lib/api";

/** GET /api/views — this user's saved queues plus any shared ones. */
export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();
  try {
    const views = await prisma.savedView.findMany({
      where: { OR: [{ userId: user.id }, { userId: null }] },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ views });
  } catch (e) {
    return serverError(e);
  }
}

/** POST /api/views { name, query, shared? } — save the current filter set. */
export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  try {
    const b = await req.json().catch(() => null);
    const name = typeof b?.name === "string" ? b.name.trim() : "";
    const query = typeof b?.query === "string" ? b.query.replace(/^\?/, "") : "";
    if (!name) return badRequest("Name this view");
    const view = await prisma.savedView.create({
      data: { name: name.slice(0, 60), query, userId: b?.shared ? null : user.id },
    });
    return NextResponse.json({ id: view.id });
  } catch (e) {
    return serverError(e);
  }
}

/** DELETE /api/views?id=... — remove one of your own (or a shared) view. */
export async function DELETE(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  try {
    const id = req.nextUrl.searchParams.get("id") ?? "";
    if (!id) return badRequest("Missing view id");
    // Scoped so one user cannot delete another's private queue.
    const { count } = await prisma.savedView.deleteMany({
      where: { id, OR: [{ userId: user.id }, { userId: null }] },
    });
    return NextResponse.json({ ok: true, deleted: count });
  } catch (e) {
    return serverError(e);
  }
}
