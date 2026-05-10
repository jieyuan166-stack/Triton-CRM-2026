import "server-only";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  options: { limit: number; windowMs: number },
): { ok: boolean; resetAt: number; remaining: number } {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    const bucket = { count: 1, resetAt: now + options.windowMs };
    buckets.set(key, bucket);
    return { ok: true, resetAt: bucket.resetAt, remaining: options.limit - 1 };
  }

  current.count += 1;
  return {
    ok: current.count <= options.limit,
    resetAt: current.resetAt,
    remaining: Math.max(0, options.limit - current.count),
  };
}

export function getClientIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
