// STATUS: PLATIN — reduced-motion source for the Present display windows.
//
// The display windows boot without the Workspace shell, so the shell's appearance projection is not
// available there. The OS-level preference is authoritative for animations and transitions: when it
// is set, slides appear in their final state instead of animating.
import { useEffect, useState } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotionNow(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches === true;
  } catch {
    return false;
  }
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(prefersReducedMotionNow);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    let query: MediaQueryList;
    try {
      query = window.matchMedia(REDUCED_MOTION_QUERY);
    } catch {
      return undefined;
    }
    const listener = () => setReduced(query.matches === true);
    setReduced(query.matches === true);
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', listener);
      return () => query.removeEventListener('change', listener);
    }
    if (typeof query.addListener === 'function') {
      query.addListener(listener);
      return () => query.removeListener(listener);
    }
    return undefined;
  }, []);

  return reduced;
}
