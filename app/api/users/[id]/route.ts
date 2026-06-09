import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, serverError, unauthorized } from "@/lib/api";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await apiUser();
  if (!me) return unauthorized();
  try {
    const { id } = await params;
    if (id === me.id) return badRequest("You cannot delete your own account");
    const count = await prisma.user.count();
    if (count <= 1) return badRequest("Cannot delete the last user");
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
