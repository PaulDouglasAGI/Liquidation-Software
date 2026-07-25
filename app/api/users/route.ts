import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, ownerOrResponse, serverError } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { ROLES } from "@/lib/constants";

/** Creating accounts is an owner action — staff cannot mint new logins. */
export async function POST(req: NextRequest) {
  const gate = await ownerOrResponse();
  if (gate instanceof NextResponse) return gate;
  try {
    const b = await req.json().catch(() => null);
    const email = typeof b?.email === "string" ? b.email.toLowerCase().trim() : "";
    const name = typeof b?.name === "string" ? b.name.trim() : "";
    const password = typeof b?.password === "string" ? b.password : "";
    const role = (ROLES as readonly string[]).includes(b?.role) ? b.role : "STAFF";
    if (!email || !email.includes("@")) return badRequest("Valid email is required");
    if (!name) return badRequest("Name is required");
    if (password.length < 8) return badRequest("Password must be at least 8 characters");
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return badRequest("A user with that email already exists");
    const user = await prisma.user.create({
      data: { email, name, role: role as never, passwordHash: await hashPassword(password) },
    });
    return NextResponse.json({ id: user.id, role: user.role });
  } catch (e) {
    return serverError(e);
  }
}
