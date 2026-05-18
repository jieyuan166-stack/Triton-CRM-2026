import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time bearer-token check used by /api/automation/* routes.
 *
 * The cron token comes from the Authorization header and is compared
 * against the server-side `CRON_SECRET`. `timingSafeEqual` requires
 * equal-length buffers, so we always operate on a fixed-size SHA-256
 * digest of each side. Any difference (including missing values or
 * length mismatch) returns false without leaking timing information.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const header = request.headers.get("authorization");
  if (!header) return false;
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;

  // SHA-256 digests guarantee equal length buffers regardless of how
  // long the supplied token is, satisfying timingSafeEqual's contract.
  const a = createHash("sha256").update(token).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
