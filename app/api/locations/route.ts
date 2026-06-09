import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, serverError, unauthorized } from "@/lib/api";

export async function POST(req: NextRequest) {
  if (!(await apiUser())) return unauthorized();
  try {
    const b = await req.json().catch(() => null);
    const code = typeof b?.code === "string" ? b.code.trim().toUpperCase() : "";
    if (!code) return badRequest("Location code is required");
    await prisma.storageLocation.upsert({
      where: { code },
      update: { notes: b.notes?.trim() || null },
      create: { code, notes: b.notes?.trim() || null },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await apiUser())) return unauthorized();
  try {
    const code = req.nextUrl.searchParams.get("code") ?? "";
    if (!code) return badRequest("code query param required");
    await prisma.storageLocation.delete({ where: { code } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}

export async function GET() {
  if (!(await apiUser())) return unauthorized();
  const locations = await prisma.storageLocation.findMany({ orderBy: { code: "asc" } });
  return NextResponse.json(locations);
}
