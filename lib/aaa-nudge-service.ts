import { validateNudgeSettings, type NudgeSettings } from '../aaa/nudge-settings.ts';

export async function fetchNudgeSettings({ endpoint, origin, profileId, fetchImpl = fetch }: {
  endpoint?: string;
  origin: string;
  profileId: string;
  fetchImpl?: typeof fetch;
}): Promise<NudgeSettings> {
  if (!endpoint) throw new Error('settings.unconfigured');
  const url = new URL('./nudge-settings', endpoint);
  url.searchParams.set('profileId', profileId);
  const response = await fetchImpl(url, {
    headers: { Origin: origin }, cache: 'no-store', signal: AbortSignal.timeout(2_000),
  });
  if (!response.ok) throw new Error('settings.unavailable');
  const settings = validateNudgeSettings(await response.json(), profileId);
  if (!settings) throw new Error('settings.invalid');
  return settings;
}
