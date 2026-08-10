import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { endFixedPriceItem } from "./ebay";

type Db = Prisma.TransactionClient | typeof prisma;

export type Channel = "EBAY" | "AMAZON" | "FACEBOOK" | "OTHER";

/**
 * Which channels we can take down ourselves, and which need a person.
 *
 * eBay has an API. Amazon listings here are a flat file someone uploads, and
 * Facebook Marketplace is a text block someone pastes into a browser — neither
 * can be ended from code, so the honest thing is to say so loudly and put the
 * job in front of whoever is standing there.
 */
export const AUTO_ENDABLE: Record<Channel, boolean> = {
  EBAY: true,
  AMAZON: false,
  FACEBOOK: false,
  OTHER: false,
};

/** Records that a unit is now advertised on a channel. Reused on relisting. */
export async function recordListing(
  db: Db,
  itemId: string,
  channel: Channel,
  opts: { externalId?: string | null; url?: string | null; price?: number | null } = {}
) {
  const data = {
    externalId: opts.externalId ?? null,
    url: opts.url ?? null,
    price: opts.price ?? null,
    listedAt: new Date(),
    // Relisting clears any previous ending, so the row means "live now".
    endedAt: null,
    endReason: null,
    needsTakedownAt: null,
  };
  await db.listing.upsert({
    where: { itemId_channel: { itemId, channel: channel as never } },
    create: { itemId, channel: channel as never, ...data },
    update: data,
  });
}

export interface TakedownOutcome {
  channel: Channel;
  sku: string;
  ok: boolean;
  /** Why it could not be ended automatically, or the error from the channel. */
  note?: string;
}

/**
 * Called the moment a unit is spoken for.
 *
 * Ends every OTHER live advert for it: the channel it sold on is marked
 * SOLD_HERE, channels with an API are ended immediately, and the rest are
 * flagged for a person. Never throws — a marketplace being down must not
 * prevent a sale from being recorded, so failures come back as outcomes and
 * the listing stays in the takedown queue.
 */
export async function takeDownOtherListings(
  itemIds: string[],
  soldOn: Channel | null
): Promise<TakedownOutcome[]> {
  if (itemIds.length === 0) return [];
  const live = await prisma.listing.findMany({
    where: { itemId: { in: itemIds }, endedAt: null },
    include: { item: { select: { sku: true } } },
  });
  if (live.length === 0) return [];

  const now = new Date();
  const outcomes: TakedownOutcome[] = [];

  for (const l of live) {
    const channel = l.channel as Channel;
    if (soldOn && channel === soldOn) {
      await prisma.listing.update({
        where: { id: l.id },
        data: { endedAt: now, endReason: "SOLD_HERE", needsTakedownAt: null },
      });
      continue;
    }

    if (AUTO_ENDABLE[channel] && l.externalId) {
      try {
        await endFixedPriceItem(l.externalId);
        await prisma.listing.update({
          where: { id: l.id },
          data: { endedAt: new Date(), endReason: "AUTO", needsTakedownAt: null },
        });
        outcomes.push({ channel, sku: l.item.sku, ok: true });
        continue;
      } catch (e) {
        // Leave it in the queue: a failed API call is exactly when a human
        // needs to know the advert is still up.
        await prisma.listing.update({ where: { id: l.id }, data: { needsTakedownAt: now } });
        outcomes.push({ channel, sku: l.item.sku, ok: false, note: (e as Error).message });
        continue;
      }
    }

    await prisma.listing.update({ where: { id: l.id }, data: { needsTakedownAt: now } });
    outcomes.push({
      channel, sku: l.item.sku, ok: false,
      note: `${channel} listings cannot be ended automatically — pull it down by hand`,
    });
  }
  return outcomes;
}

/** Adverts that are still live for stock that is no longer available. */
export async function pendingTakedowns(limit = 200) {
  return prisma.listing.findMany({
    where: { endedAt: null, needsTakedownAt: { not: null } },
    include: { item: { select: { id: true, sku: true, name: true, status: true, storageLocation: true } } },
    orderBy: { needsTakedownAt: "asc" },
    take: limit,
  });
}

/** Staff confirming they pulled an advert down by hand. */
export async function confirmTakedown(listingId: string) {
  await prisma.listing.update({
    where: { id: listingId },
    data: { endedAt: new Date(), endReason: "MANUAL", needsTakedownAt: null },
  });
}

/**
 * Live adverts for units that are still sellable, keyed by item.
 *
 * Used to warn before listing somewhere new: "this is already up on eBay" is
 * the difference between a deliberate multi-channel listing and an accident.
 */
export async function liveChannelsFor(itemIds: string[]): Promise<Map<string, Channel[]>> {
  const rows = await prisma.listing.findMany({
    where: { itemId: { in: itemIds }, endedAt: null },
    select: { itemId: true, channel: true },
  });
  const m = new Map<string, Channel[]>();
  for (const r of rows) {
    const list = m.get(r.itemId);
    if (list) list.push(r.channel as Channel);
    else m.set(r.itemId, [r.channel as Channel]);
  }
  return m;
}
