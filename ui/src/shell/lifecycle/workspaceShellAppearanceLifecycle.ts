// STATUS: PLATIN — system color, contrast, motion, direction, theme, and scale lifecycle binding.
import { useEffect } from 'react';
import { applyWorkspaceTheme } from '../../design-system/themes/workspaceTheme';
import { resolveAccessibilityDirection } from '../../shared/accessibility/accessibilityPlatform';
import { deriveShellAppearance, shellScaleBand, type ShellAppearancePreference } from '../platform/workspaceShellPlatform';

export interface WorkspaceShellAppearanceLifecycleOptions {
  locale: string;
  shellAppearance: ShellAppearancePreference;
}

export function useWorkspaceShellAppearanceLifecycle(options: WorkspaceShellAppearanceLifecycleOptions): void {
  const { locale, shellAppearance } = options;
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const dark = window.matchMedia('(prefers-color-scheme: dark)');
    const contrast = window.matchMedia('(prefers-contrast: more)');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      const projection = deriveShellAppearance(shellAppearance, {
        prefersDark: dark.matches,
        prefersHighContrast: contrast.matches,
        prefersReducedMotion: motion.matches,
        localeDirection: resolveAccessibilityDirection('auto', locale),
      });
      const root = document.documentElement;
      root.classList.toggle('dark', projection.colorScheme === 'dark');
      applyWorkspaceTheme(root, shellAppearance.themeId, shellAppearance.accentId, shellAppearance.surfaceIntensity, dark.matches, projection.highContrast);
      root.classList.toggle('astraea-high-contrast', projection.highContrast);
      root.classList.toggle('astraea-reduced-motion', projection.reducedMotion);
      root.dataset.astraeaScaleBand = shellScaleBand(projection.scalePercent);
      root.dataset.astraeaScalePercent = String(projection.scalePercent);
      root.style.fontSize = `${projection.scalePercent}%`;
      root.style.colorScheme = projection.colorScheme;
      root.dir = projection.direction;
    };
    apply();
    dark.addEventListener('change', apply);
    contrast.addEventListener('change', apply);
    motion.addEventListener('change', apply);
    return () => {
      dark.removeEventListener('change', apply);
      contrast.removeEventListener('change', apply);
      motion.removeEventListener('change', apply);
    };
  }, [locale, shellAppearance]);
}
