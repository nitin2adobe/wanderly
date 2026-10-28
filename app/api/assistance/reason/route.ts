import { NextResponse } from 'next/server';
import { reasonAboutAssistance } from '@/lib/assistance-reasoner';
import { validateJourneyContext } from '@/lib/assistance-schema';
import { createRateLimiter, readJsonBody } from '@/lib/request-guard';

const allow = createRateLimiter(30, 60_000);

export async function POST(request: Request) {
  const client = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  if (!allow(client)) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429, headers: { 'retry-after': '60' } });
  }
  const body = await readJsonBody(request);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });
  const validation = validateJourneyContext(body.value);
  if (!validation.valid) {
    return NextResponse.json({ error: 'Invalid JourneyContext.', details: validation.errors }, { status: 400 });
  }
  try {
    const result = await reasonAboutAssistance(validation.value);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[assistance-reasoner]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Assistance reasoner failed.' }, { status: 502 });
  }
}
