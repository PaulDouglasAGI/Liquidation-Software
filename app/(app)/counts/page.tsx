import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import CountClient from "@/components/CountClient";

export const dynamic = "force-dynamic";

export default async function CountsPage() {
  await requireUser();

  const [locations, sessions, distinct] = await Promise.all([
    prisma.storageLocation.findMany({ orderBy: { code: "asc" }, select: { code: true } }),
    prisma.countSession.findMany({
      orderBy: { startedAt: "desc" },
      take: 25,
      include: { _count: { select: { scans: true } } },
    }),
    // Shelves that hold stock but were never formally registered as locations.
    prisma.item.findMany({
      where: { storageLocation: { not: null }, status: { in: ["IN_STOCK", "LISTED", "RESERVED"] } },
      select: { storageLocation: true },
      distinct: ["storageLocation"],
    }),
  ]);

  const codes = [...new Set([
    ...locations.map((l) => l.code),
    ...distinct.map((d) => d.storageLocation!).filter(Boolean),
  ])].sort();

  return (
    <CountClient
      locations={codes}
      sessions={sessions.map((s) => ({
        id: s.id,
        location: s.location,
        status: s.status,
        startedBy: s.startedBy,
        startedAt: s.startedAt.toISOString(),
        scanCount: s._count.scans,
      }))}
    />
  );
}
