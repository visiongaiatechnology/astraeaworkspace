// STATUS: DIAMANT VGT SUPREME — page-visibility governor for background rendering/animation throttling.
import React, { useEffect } from 'react';

export const WorkspaceVisibilityGovernor: React.FC = () => {
  useEffect(() => {
    const sync = () => {
      document.documentElement.dataset.astraeaVisibility = document.hidden ? 'hidden' : 'visible';
      window.dispatchEvent(new CustomEvent('astraea:visibility-change', { detail: { hidden: document.hidden } }));
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      delete document.documentElement.dataset.astraeaVisibility;
    };
  }, []);
  return null;
};
