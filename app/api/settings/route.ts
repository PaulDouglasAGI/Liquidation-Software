import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, forbidden, serverError, unauthorized } from "@/lib/api";
import { isOwner } from "@/lib/auth";
import { isCredentialKey, isKnownSettingKey } from "@/lib/credentials";



/**
 * POST { settings: { key: value, ... } } — upserts app settings.
 * An empty-string value DELETES the stored row, so credentials fall back to
 * their environment variables (or to unset).
 *
 * Writes apply as one transaction: a half-saved fee table would silently
 * misprice everything sold until someone noticed.
 */
export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  try {
    const b = await req.json().catch(() => null);
    const settings = b?.settings;
    if (!settings || typeof settings !== "object") return badRequest("settings object required");

    const entries = Object.entries(settings);
    for (const [key, value] of entries) {
      if (!isKnownSettingKey(key)) {
        return badRequest(`Unknown setting: ${key}`);
      }
      if (typeof value !== "string") return badRequest(`Setting ${key} must be a string`);
    }
    if (!isOwner(user) && entries.some(([key]) => isCredentialKey(key))) {
      return forbidden("Only an owner can change API credentials");
    }

    await prisma.$transaction(
      entries.map(([key, value]) =>
        value === ""
          ? prisma.setting.deleteMany({ where: { key } })
          : prisma.setting.upsert({
              where: { key },
              update: { value: value as string },
              create: { key, value: value as string },
            })
      )
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
