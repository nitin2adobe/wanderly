import { fetchExplain } from '@/lib/aaa-explain-service';

export async function GET(_request: Request, { params }: { params: Promise<{ traceId: string }> }) {
  const { traceId } = await params;
  return fetchExplain(traceId, {
    endpoint: process.env.AAA_STARTER_SERVICE_URL,
    origin: process.env.AAA_STARTER_ORIGIN ?? 'http://localhost:3000',
  });
}
