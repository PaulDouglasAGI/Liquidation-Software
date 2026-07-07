import "server-only";
import { prisma } from "./db";

/**
 * Fire-and-forget audit-trail entry. Never throws — a logging failure must
 * not break the operation it describes.
 */
export function logActivity(userName: string, action: string, detail: string) {
  prisma.activityLog
    .create({ data: { userName, action, detail: detail.slice(0, 500) } })
    .catch(() => {});
}
