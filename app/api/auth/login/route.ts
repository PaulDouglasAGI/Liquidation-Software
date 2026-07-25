import { NextRequest, NextResponse } from "next/server";
import { createSession, verifyLogin } from "@/lib/auth";
import { badRequest } from "@/lib/api";
import { RateLimiter, clientIp, retryAfterSeconds } from "@/lib/rateLimit";

// Two independent limits. The per-account one is the meaningful defence:
// X-Forwarded-For can be rotated, but an attacker cannot change which account
// they are trying to break into. The per-IP one blunts spraying across many
// accounts from one source.
const PER_ACCOUNT = new RateLimiter({ limit: 5, windowMs: 15 * 60_000 });
const PER_IP = new RateLimiter({ limit: 20, windowMs: 15 * 60_000 });

const tooMany = (retryAfterMs: number) =>
  NextResponse.json(
    { error: "Too many sign-in attempts. Try again in a few minutes." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds(retryAfterMs)) } }
  );

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) return badRequest("Email and password are required");

  const account = email.toLowerCase().trim();
  const ip = clientIp(req.headers);

  // Check both before doing any bcrypt work — verifying a password is
  // deliberately expensive, so a blocked caller must not get to spend it.
  const ipLimit = PER_IP.check(ip);
  if (!ipLimit.allowed) return tooMany(ipLimit.retryAfterMs);
  const accountLimit = PER_ACCOUNT.check(account);
  if (!accountLimit.allowed) return tooMany(accountLimit.retryAfterMs);

  const user = await verifyLogin(email, password);
  if (!user) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  // A correct password clears the account's budget so a user who fumbled their
  // password a few times isn't locked out right after getting it right.
  PER_ACCOUNT.reset(account);
  PER_IP.reset(ip);

  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
