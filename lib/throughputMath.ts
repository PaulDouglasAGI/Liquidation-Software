// Pure team-throughput aggregation (no DB). Turns the existing activity log
// into "who did how much of what", with no new tracking to maintain.

export interface ActivityRecord {
  actor: string;
  action: string;
  createdAt: Date;
}

/** Activity actions grouped into the jobs people actually do. */
export const WORK_KINDS = ["intake", "listing", "fulfillment", "counting", "admin"] as const;
export type WorkKind = (typeof WORK_KINDS)[number];

export function classifyAction(action: string): WorkKind {
  if (action.startsWith("item.create") || action.startsWith("pallet.import")) return "intake";
  if (action.startsWith("item.list") || action.startsWith("listing.") || action.startsWith("lot.")) return "listing";
  if (action.startsWith("order.") || action.startsWith("item.sold") || action.startsWith("item.status")) return "fulfillment";
  if (action.startsWith("count.")) return "counting";
  return "admin";
}

export interface PersonThroughput {
  actor: string;
  total: number;
  byKind: Record<WorkKind, number>;
  /** Days on which this person recorded any activity. */
  activeDays: number;
  /** total / activeDays — average output on days actually worked. */
  perActiveDay: number;
  firstAt: Date;
  lastAt: Date;
}

// Local date key so a late-evening shift is not split across two days.
function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const emptyKinds = (): Record<WorkKind, number> =>
  ({ intake: 0, listing: 0, fulfillment: 0, counting: 0, admin: 0 });

/** Per-person totals, busiest first. */
export function throughputByPerson(records: ActivityRecord[]): PersonThroughput[] {
  const acc = new Map<string, { rows: ActivityRecord[]; days: Set<string> }>();
  for (const r of records) {
    const e = acc.get(r.actor) ?? { rows: [], days: new Set<string>() };
    e.rows.push(r);
    e.days.add(dayKey(r.createdAt));
    acc.set(r.actor, e);
  }

  return [...acc.entries()]
    .map(([actor, { rows, days }]) => {
      const byKind = emptyKinds();
      for (const r of rows) byKind[classifyAction(r.action)]++;
      const times = rows.map((r) => r.createdAt.getTime());
      return {
        actor,
        total: rows.length,
        byKind,
        activeDays: days.size,
        perActiveDay: days.size ? Math.round((rows.length / days.size) * 10) / 10 : 0,
        firstAt: new Date(Math.min(...times)),
        lastAt: new Date(Math.max(...times)),
      };
    })
    .sort((a, b) => b.total - a.total);
}

export interface DayThroughput {
  day: string;
  total: number;
  byKind: Record<WorkKind, number>;
}

/** Daily totals oldest-first, with empty days included so gaps are visible. */
export function throughputByDay(records: ActivityRecord[], days = 14, now = new Date()): DayThroughput[] {
  const buckets = new Map<string, DayThroughput>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = dayKey(d);
    buckets.set(key, { day: key, total: 0, byKind: emptyKinds() });
  }
  for (const r of records) {
    const b = buckets.get(dayKey(r.createdAt));
    if (!b) continue; // outside the window
    b.total++;
    b.byKind[classifyAction(r.action)]++;
  }
  return [...buckets.values()];
}

/** Headline totals for the period. */
export function throughputSummary(records: ActivityRecord[]) {
  const byKind = emptyKinds();
  for (const r of records) byKind[classifyAction(r.action)]++;
  const people = new Set(records.map((r) => r.actor));
  const days = new Set(records.map((r) => dayKey(r.createdAt)));
  return {
    total: records.length,
    byKind,
    people: people.size,
    activeDays: days.size,
    perDay: days.size ? Math.round((records.length / days.size) * 10) / 10 : 0,
  };
}
