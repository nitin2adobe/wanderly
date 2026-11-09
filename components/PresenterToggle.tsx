'use client';
import { useEffect, useState } from 'react';
import { getPresenterMode, PRESENTER_CHANGED, setPresenterMode } from '@/lib/presenter-mode';

export default function PresenterToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(getPresenterMode());
    sync();
    window.addEventListener(PRESENTER_CHANGED, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(PRESENTER_CHANGED, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return (
    <button className={`btn ghost presenterToggle${on ? ' active' : ''}`} aria-pressed={on} onClick={() => setPresenterMode(!on)}>
      Presenter mode: {on ? 'On' : 'Off'}
    </button>
  );
}
