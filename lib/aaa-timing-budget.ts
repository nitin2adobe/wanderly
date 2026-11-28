const key = 'aaa.timing.points.v1';
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;

export function readTimingSequence(storage: StoragePort, sessionId: string): number | undefined {
  try {
    const text = storage.getItem(key);
    if (!text) return 0;
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || !('sessionId' in value) || typeof value.sessionId !== 'string'
      || !('sequence' in value) || !Number.isSafeInteger(value.sequence)
      || Number(value.sequence) < 0 || Number(value.sequence) > 20) return;
    return value.sessionId === sessionId ? Number(value.sequence) : 0;
  } catch {
    return;
  }
}

export function saveTimingSequence(storage: StoragePort, sessionId: string, sequence: number): boolean {
  try { storage.setItem(key, JSON.stringify({ sessionId, sequence })); return true; }
  catch { return false; }
}
