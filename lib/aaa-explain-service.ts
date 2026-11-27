export async function fetchExplain(traceId: string, {
  endpoint,
  origin,
  fetchImpl = fetch,
}: {
  endpoint?: string;
  origin?: string;
  fetchImpl?: typeof fetch;
}): Promise<Response> {
  const headers = { 'cache-control': 'no-store' };
  if (!/^[a-f0-9]{32}$/.test(traceId)) return Response.json({ error: 'invalid_trace' }, { status: 400, headers });
  if (!endpoint) return Response.json({ error: 'explain_unavailable' }, { status: 503, headers });
  try {
    const response = await fetchImpl(new URL(`./traces/${traceId}/explain`, endpoint), {
      headers: origin ? { Origin: origin } : {},
      signal: AbortSignal.timeout(1000),
      cache: 'no-store',
    });
    if (!response.ok) return Response.json({ error: 'explain_unavailable' }, { status: response.status, headers });
    return Response.json(await response.json(), { headers });
  } catch (error) {
    console.warn('[aaa-explain] service.unavailable', error instanceof Error ? error.name : 'unknown');
    return Response.json({ error: 'explain_unavailable' }, { status: 503, headers });
  }
}
