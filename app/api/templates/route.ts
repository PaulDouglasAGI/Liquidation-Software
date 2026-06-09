import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, serverError, unauthorized } from "@/lib/api";
import { CATEGORIES } from "@/lib/constants";

/** POST { category, titleTemplate, descriptionTemplate } — upsert per-category listing template. */
export async function POST(req: NextRequest) {
  if (!(await apiUser())) return unauthorized();
  try {
    const b = await req.json().catch(() => null);
    if (!b || !CATEGORIES.includes(b.category)) return badRequest("Valid category is required");
    const titleTemplate = typeof b.titleTemplate === "string" ? b.titleTemplate.trim() : "";
    const descriptionTemplate = typeof b.descriptionTemplate === "string" ? b.descriptionTemplate.trim() : "";
    if (!titleTemplate || !descriptionTemplate) return badRequest("Title and description templates are required");
    await prisma.listingTemplate.upsert({
      where: { category: b.category },
      update: { titleTemplate, descriptionTemplate },
      create: { category: b.category, titleTemplate, descriptionTemplate },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
