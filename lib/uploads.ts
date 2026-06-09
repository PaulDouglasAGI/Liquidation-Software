import "server-only";
import path from "path";

export function uploadRoot(): string {
  return path.resolve(process.cwd(), process.env.LOCAL_UPLOAD_PATH || "./uploads");
}

/** Resolves a stored photo path (e.g. "items/abc/1.jpg") safely under the upload root. */
export function resolveUploadPath(rel: string): string | null {
  const root = uploadRoot();
  const full = path.resolve(root, rel);
  if (!full.startsWith(root + path.sep)) return null; // path traversal guard
  return full;
}
