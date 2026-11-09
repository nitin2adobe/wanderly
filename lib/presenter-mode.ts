export const PRESENTER_KEY = 'wanderly.presenter.v1';
export const PRESENTER_CHANGED = 'wanderly:presenter-changed';

/** `?present=1` turns presenter mode on, `?present=0` turns it off, anything else leaves it unchanged. */
export function parsePresenterParam(search: string): boolean | null {
  const value = new URLSearchParams(search).get('present');
  if (value === '1') return true;
  if (value === '0') return false;
  return null;
}

export function getPresenterMode(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(PRESENTER_KEY) === '1';
}

export function setPresenterMode(on: boolean) {
  localStorage.setItem(PRESENTER_KEY, on ? '1' : '0');
  window.dispatchEvent(new Event(PRESENTER_CHANGED));
}
