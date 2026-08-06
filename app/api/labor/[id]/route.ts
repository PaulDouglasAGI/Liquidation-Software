import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, notFound, serverError, unauthorized } from "@/lib/api";
import { isOwner } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

/**
 * DELETE /api/labor/:id — remove a mis-logged session.
 *
 * Anyone can fix their own slip; only an owner can remove someone else's, so
 * one person cannot quietly erase another's hours from the record.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  try {
    const { id } = await params;
    const entry = await prisma.laborEntry.findUnique({
      where: { id },
      include: { pallet: { select: { palletCode: true } } },
    });
    if (!entry) return notFound("That entry is already gone");

    const mine = entry.userId === user.id || entry.userName === user.name;
    if (!mine && !isOwner(user)) {
      return NextResponse.json(
        { error: `That entry is ${entry.userName}'s — ask an owner to remove it` },
        { status: 403 }
      );
    }

    await prisma.laborEntry.delete({ where: { id } });
    logActivity(
      user.name,
      "labor.delete",
      `${entry.hours.toNumber()}h ${entry.activity} on ${entry.pallet.palletCode} (${entry.userName})`
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
