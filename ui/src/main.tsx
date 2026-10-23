import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import { mountPresentDisplayIfRequested } from './apps/present/presentation/display/mountPresentDisplay';
import './design-system/styles/index.css';
import './design-system/styles/foundation.css';
import './design-system/styles/app-primitives.css';
import './design-system/styles/app-accessibility.css';
import './design-system/styles/theme-layer.css';
import './design-system/styles/module-accessibility.css';
import './design-system/styles/workspace-interaction.css';
import './design-system/styles/shell-surfaces.css';
import './design-system/styles/shared-controls.css';
import './design-system/styles/content-color-policy.css';
import './design-system/styles/module-shells.css';
// ASTRAEA WRITER 50 V2 · M1: two rules Tailwind cannot express — the
// non-persisted empty-paragraph hint and the quiet active-paragraph marker.
import './design-system/styles/writer-surface.css';
import { WorkspaceLocaleProvider } from './shell/localization/workspaceLocale';
import { installClipboardSecurityShield, installSelfXssShield } from './platform/security/security';
import { installDiagnosticCrashCapture } from './platform/diagnostics/diagnosticLog';
import { initializeDiagnosticsReleaseSafety } from './platform/diagnostics/diagnosticsReleaseClient';
import { resolveAccessibilityDirection } from './shared/accessibility/accessibilityPlatform';
import { applyWorkspaceTheme } from './design-system/themes/workspaceTheme';
import { browserShellStorage, deriveShellAppearance, loadShellAppearance } from './shell/platform/workspaceShellPlatform';
import { loadWorkspaceLocale, resolveWorkspaceLocale } from './shell/localization/workspaceLocale';

const BOOT_SPLASH_DEADLINE_MS = 3000;
const BOOT_SPLASH_EXIT_MS = 160;

function startBootSplashDeadline(): () => void {
  const splash = document.getElementById('workspace-boot-splash');
  if (!(splash instanceof HTMLElement)) return () => undefined;

  const deadlineAnimation = () => splash.getAnimations().find((animation) => {
    if (!('animationName' in animation)) return false;
    const name = (animation as CSSAnimation).animationName;
    return name === 'workspace-boot-splash-deadline' || name === 'workspace-boot-splash-deadline-static';
  });
  const elapsedMs = () => {
    const currentTime = deadlineAnimation()?.currentTime;
    return typeof currentTime === 'number' && Number.isFinite(currentTime)
      ? Math.max(0, Math.min(BOOT_SPLASH_DEADLINE_MS, currentTime))
      : Math.max(0, Math.min(BOOT_SPLASH_DEADLINE_MS, performance.now()));
  };
  const minVisibleRaw = Number.parseInt(splash.dataset.minVisibleMs ?? '600', 10);
  const minVisibleMs = Number.isFinite(minVisibleRaw) ? Math.max(0, Math.min(1000, minVisibleRaw)) : 600;

  const removeSplash = () => {
    if (!splash.isConnected) return;
    splash.remove();
  };
  const hardDeadlineTimer = window.setTimeout(removeSplash, Math.max(0, BOOT_SPLASH_DEADLINE_MS - elapsedMs()));

  return () => {
    if (!splash.isConnected) return;
    const elapsed = elapsedMs();
    const remainingForMinimum = Math.max(0, minVisibleMs - elapsed);
    const remainingBeforeDeadline = Math.max(0, BOOT_SPLASH_DEADLINE_MS - elapsed);
    if (remainingForMinimum + BOOT_SPLASH_EXIT_MS > remainingBeforeDeadline) return;

    window.setTimeout(() => {
      if (!splash.isConnected) return;
      splash.classList.add('workspace-boot-splash--exiting');
      window.setTimeout(() => {
        window.clearTimeout(hardDeadlineTimer);
        removeSplash();
      }, BOOT_SPLASH_EXIT_MS);
    }, remainingForMinimum);
  };
}

function applyStoredAppearanceBeforeReact(): void {
  const storage = browserShellStorage();
  const preference = loadShellAppearance(storage);
  const localePreference = loadWorkspaceLocale(storage);
  const locale = resolveWorkspaceLocale(localePreference, typeof navigator === 'undefined' ? undefined : navigator.language);
  const prefersDark = typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-color-scheme: dark)').matches;
  const prefersHighContrast = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-contrast: more)').matches;
  const prefersReducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const projection = deriveShellAppearance(preference, {
    prefersDark,
    prefersHighContrast,
    prefersReducedMotion,
    localeDirection: resolveAccessibilityDirection('auto', locale),
  });
  const root = document.documentElement;
  root.classList.toggle('dark', projection.colorScheme === 'dark');
  root.classList.toggle('astraea-high-contrast', projection.highContrast);
  root.classList.toggle('astraea-reduced-motion', projection.reducedMotion);
  root.style.fontSize = `${projection.scalePercent}%`;
  root.style.colorScheme = projection.colorScheme;
  root.dir = projection.direction;
  applyWorkspaceTheme(root, preference.themeId, preference.accentId, preference.surfaceIntensity, prefersDark, projection.highContrast);
}

async function boot(): Promise<void> {
  // Runde 42: a Present display window (`?present_display=audience|presenter&session=…`) renders
  // only the display surface. It must never boot the Workspace shell or the editor tree.
  const presentDisplay = mountPresentDisplayIfRequested();
  if (presentDisplay.mounted) {
    document.getElementById('workspace-boot-splash')?.remove();
    return;
  }
  const dismissBootSplash = startBootSplashDeadline();
  applyStoredAppearanceBeforeReact();
  installSelfXssShield();
  installClipboardSecurityShield();
  installDiagnosticCrashCapture();
  await initializeDiagnosticsReleaseSafety();
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <WorkspaceLocaleProvider>
        <App />
      </WorkspaceLocaleProvider>
    </React.StrictMode>
  );
  dismissBootSplash();
}

void boot();
