import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, parseDate, parseMoney, serverError, unauthorized } from "@/lib/api";

export async function POST(req: NextRequest) {
  if (!(await apiUser())) return unauthorized();
  try {
    const b = await req.json().catch(() => null);
    if (!b) return badRequest("Invalid JSON body");
    const date = parseDate(b.date);
    const amount = parseMoney(b.amount);
    const category = typeof b.category === "string" ? b.category.trim() : "";
    const description = typeof b.description === "string" ? b.description.trim() : "";
    if (!date) return badRequest("Date is required");
    if (amount === null || amount <= 0) return badRequest("Amount must be positive");
    if (!category) return badRequest("Category is required");
    if (!description) return badRequest("Description is required");
    const expense = await prisma.expense.create({ data: { date, amount, category, description } });
    return NextResponse.json({ id: expense.id });
  } catch (e) {
    return serverError(e);
  }
}
