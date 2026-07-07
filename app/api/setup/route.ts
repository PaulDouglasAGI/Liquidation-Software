import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, serverError } from "@/lib/api";
import { createSession, hashPassword } from "@/lib/auth";
import { ensureDefaults } from "@/lib/defaults";

/**
 * First-run setup: creates the owner account and the app's default settings.
 * Only works while the app has zero users, then locks itself forever.
 */
export async function POST(req: NextRequest) {
  try {
    const existingUsers = await prisma.user.count();
    if (existingUsers > 0) {
      return NextResponse.json({ error: "Setup has already been completed" }, { status: 403 });
    }

    const b = await req.json().catch(() => null);
    const name = typeof b?.name === "string" ? b.name.trim() : "";
    const email = typeof b?.email === "string" ? b.email.toLowerCase().trim() : "";
    const password = typeof b?.password === "string" ? b.password : "";
    if (!name) return badRequest("Your name is required");
    if (!email || !email.includes("@")) return badRequest("A valid email is required");
    if (password.length < 8) return badRequest("Password must be at least 8 characters");

    // Re-check inside a serializable transaction: two concurrent first-run
    // submissions must not both become the owner account.
    const passwordHash = await hashPassword(password);
    const user = await prisma.$transaction(
      async (tx) => {
        if ((await tx.user.count()) > 0) throw new Error("SETUP_DONE");
        return tx.user.create({ data: { name, email, passwordHash } });
      },
      { isolationLevel: "Serializable" }
    ).catch((e) => {
      if (e instanceof Error && e.message === "SETUP_DONE") return null;
      throw e;
    });
    if (!user) {
      return NextResponse.json({ error: "Setup has already been completed" }, { status: 403 });
    }
    await ensureDefaults(prisma);
    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}

/** Lets the client check whether setup is still needed. */
export async function GET() {
  const users = await prisma.user.count();
  return NextResponse.json({ needsSetup: users === 0 });
}
