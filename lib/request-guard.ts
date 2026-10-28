export const MAX_BODY_BYTES = 8 * 1024;

// In-memory fixed window; per-instance only, so use a shared store if deployed across instances.
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (key: string): boolean => {
    const t = now();
    for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
    const entry = hits.get(key);
    if (!entry) {
      hits.set(key, { count: 1, resetAt: t + windowMs });
      return true;
    }
    entry.count++;
    return entry.count <= limit;
  };
}

export type BodyResult = { ok: true; value: unknown } | { ok: false; status: 400 | 413; error: string };

export async function readJsonBody(request: Request, maxBytes: number = MAX_BODY_BYTES): Promise<BodyResult> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, status: 413, error: 'Request body too large.' };
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) return { ok: false, status: 413, error: 'Request body too large.' };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: 'Request body must be valid JSON.' };
  }
}
