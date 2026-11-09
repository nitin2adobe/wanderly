'use client';
import { useEffect } from 'react';
import { getPresenterMode, parsePresenterParam, PRESENTER_CHANGED, setPresenterMode } from '@/lib/presenter-mode';

/** Applies the `presenter` class to <body>, kept in sync across tabs and the embedded demo site. */
export default function PresenterMode() {
  useEffect(() => {
    const fromUrl = parsePresenterParam(window.location.search);
    if (fromUrl !== null) setPresenterMode(fromUrl);
    const apply = () => document.body.classList.toggle('presenter', getPresenterMode());
    apply();
    window.addEventListener(PRESENTER_CHANGED, apply);
    window.addEventListener('storage', apply);
    return () => {
      window.removeEventListener(PRESENTER_CHANGED, apply);
      window.removeEventListener('storage', apply);
    };
  }, []);
  return null;
}
