import { NextResponse } from 'next/server';
import { fetchNudgeSettings } from '@/lib/aaa-nudge-service';
import reviewedProfile from '@/sites/wanderly/profile.json';

export async function GET() {
  try {
    const settings = await fetchNudgeSettings({
      endpoint: process.env.AAA_STARTER_SERVICE_URL,
      origin: process.env.AAA_STARTER_ORIGIN ?? 'http://localhost:3000',
      profileId: reviewedProfile.profileId,
    });
    return NextResponse.json(settings, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.warn('[aaa-settings] service.failed', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ reasonCodes: ['settings.unavailable'] }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
