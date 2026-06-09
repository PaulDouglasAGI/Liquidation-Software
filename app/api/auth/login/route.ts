import { NextRequest, NextResponse } from "next/server";
import { createSession, verifyLogin } from "@/lib/auth";
import { badRequest } from "@/lib/api";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) return badRequest("Email and password are required");

  const user = await verifyLogin(email, password);
  if (!user) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
