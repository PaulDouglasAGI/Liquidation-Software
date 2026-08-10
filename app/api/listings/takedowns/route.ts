import { NextRequest, NextResponse } from "next/server";
import { apiUser, badRequest, serverError, unauthorized } from "@/lib/api";
import { confirmTakedown, pendingTakedowns } from "@/lib/listings";
import { logActivity } from "@/lib/activity";

/** GET /api/listings/takedowns — adverts still live for stock that is gone. */
export async function GET() {
  if (!(await apiUser())) return unauthorized();
  try {
    const rows = await pendingTakedowns();
    return NextResponse.json({
      takedowns: rows.map((r) => ({
        id: r.id,
        channel: r.channel,
        url: r.url,
        externalId: r.externalId,
        needsTakedownAt: r.needsTakedownAt?.toISOString() ?? null,
        sku: r.item.sku,
        name: r.item.name,
        itemStatus: r.item.status,
      })),
    });
  } catch (e) {
    return serverError(e);
  }
}

/** POST /api/listings/takedowns — { id } once someone has pulled it down. */
export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  try {
    const b = await req.json().catch(() => null);
    const id = typeof b?.id === "string" ? b.id : "";
    if (!id) return badRequest("Which listing?");
    await confirmTakedown(id);
    logActivity(user.name, "listing.takedown", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
