import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, notFound, ownerOrResponse, serverError } from "@/lib/api";
import { ROLES } from "@/lib/constants";

/**
 * Deleting an account is owner-only. Guards the two ways an install could
 * lock itself out: removing the last user, or removing the last OWNER.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await ownerOrResponse();
  if (me instanceof NextResponse) return me;
  try {
    const { id } = await params;
    if (id === me.id) return badRequest("You cannot delete your own account");
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return notFound("User not found");
    const count = await prisma.user.count();
    if (count <= 1) return badRequest("Cannot delete the last user");
    if (target.role === "OWNER" && (await prisma.user.count({ where: { role: "OWNER" } })) <= 1) {
      return badRequest("Cannot delete the last owner");
    }
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}

/** Change a user's role. Owner-only, and never drops the last owner. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await ownerOrResponse();
  if (me instanceof NextResponse) return me;
  try {
    const { id } = await params;
    const b = await req.json().catch(() => null);
    const role = typeof b?.role === "string" ? b.role : "";
    if (!(ROLES as readonly string[]).includes(role)) return badRequest("Invalid role");

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return notFound("User not found");
    if (target.role === role) return NextResponse.json({ ok: true, role });

    // Demoting the last owner would leave nobody able to manage the install.
    if (target.role === "OWNER" && (await prisma.user.count({ where: { role: "OWNER" } })) <= 1) {
      return badRequest("Cannot demote the last owner");
    }
    await prisma.user.update({ where: { id }, data: { role: role as never } });
    return NextResponse.json({ ok: true, role });
  } catch (e) {
    return serverError(e);
  }
}
