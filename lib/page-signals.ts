import { getDestination, getPackage } from './data.ts';
import type { WanderlyEventType } from './events.ts';

export function pageSignals(path: string): { eventType: WanderlyEventType; entity?: string }[] {
  if (path.startsWith('/destinations/')) {
    const destination = getDestination(path.split('/')[2]);
    return destination ? [{ eventType: 'DESTINATION_VIEW', entity: destination.slug }] : [];
  }
  if (path.startsWith('/packages/')) {
    const pack = getPackage(path.split('/')[2]);
    return pack ? [
      { eventType: 'PACKAGE_VIEW', entity: pack.id },
      { eventType: 'PRICE_VIEW', entity: pack.id },
    ] : [];
  }
  if (path === '/compare') return [{ eventType: 'COMPARE_VIEW' }];
  if (path === '/packages') return [{ eventType: 'PRICE_VIEW' }];
  if (path === '/travel-info') return [{ eventType: 'TRAVEL_INFO_VIEW' }];
  return [];
}
