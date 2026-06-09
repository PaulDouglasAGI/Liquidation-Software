import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, serverError, unauthorized } from "@/lib/api";
import { hashPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  if (!(await apiUser())) return unauthorized();
  try {
    const b = await req.json().catch(() => null);
    const email = typeof b?.email === "string" ? b.email.toLowerCase().trim() : "";
    const name = typeof b?.name === "string" ? b.name.trim() : "";
    const password = typeof b?.password === "string" ? b.password : "";
    if (!email || !email.includes("@")) return badRequest("Valid email is required");
    if (!name) return badRequest("Name is required");
    if (password.length < 8) return badRequest("Password must be at least 8 characters");
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return badRequest("A user with that email already exists");
    const user = await prisma.user.create({
      data: { email, name, passwordHash: await hashPassword(password) },
    });
    return NextResponse.json({ id: user.id });
  } catch (e) {
    return serverError(e);
  }
}
