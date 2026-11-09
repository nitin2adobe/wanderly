export type ActivationMode = 'rules' | 'ai';
export const ACTIVATION_MODE_KEY = 'wanderly.activation.mode.v1';
export const ACTIVATION_MODE_CHANGED = 'wanderly:activation-mode-changed';

export function getActivationMode(): ActivationMode {
  if (typeof window === 'undefined') return 'rules';
  return localStorage.getItem(ACTIVATION_MODE_KEY) === 'ai' ? 'ai' : 'rules';
}

export function setActivationMode(mode: ActivationMode) {
  localStorage.setItem(ACTIVATION_MODE_KEY, mode);
  window.dispatchEvent(new Event(ACTIVATION_MODE_CHANGED));
}
