import { NextResponse } from 'next/server';
import { reasonAboutAssistance } from '@/lib/assistance-reasoner';
import { validateJourneyContext } from '@/lib/assistance-schema';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }
  const validation = validateJourneyContext(body);
  if (!validation.valid) {
    return NextResponse.json({ error: 'Invalid JourneyContext.', details: validation.errors }, { status: 400 });
  }
  try {
    const result = await reasonAboutAssistance(validation.value);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Assistance reasoner failed.';
    console.error('[assistance-reasoner]', message);
    return NextResponse.json({ error: 'Assistance reasoner failed.', details: message }, { status: 502 });
  }
}
