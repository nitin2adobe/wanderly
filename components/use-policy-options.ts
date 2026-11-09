'use client';
import { useEffect, useState } from 'react';
import { defaultPolicy, type PolicyOptions } from '@/lib/assistance-policy';
import { getPolicyOptions, POLICY_SETTINGS_CHANGED } from '@/lib/policy-settings';

/** Current policy options, kept in sync with changes made in this tab or another one. */
export function usePolicyOptions(): PolicyOptions {
  const [options, setOptions] = useState<PolicyOptions>(defaultPolicy);
  useEffect(() => {
    const sync = () => setOptions(getPolicyOptions());
    sync();
    window.addEventListener(POLICY_SETTINGS_CHANGED, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(POLICY_SETTINGS_CHANGED, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return options;
}
