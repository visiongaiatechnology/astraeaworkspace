// STATUS: PLATIN — stable public shell surface localization and formatting facade.

import type { WorkspaceLocale } from '../localization/workspaceLocaleTypes';

import type { ShellPlatformUpdateStatus, ShellSurfaceCopy } from './shellSurfaceLocaleTypes';

import { ACCESSIBILITY_ISSUE_COPY, ACCESSIBILITY_ISSUE_GROUPS } from './shellSurfaceLocaleCatalog/accessibilityIssueCopy';

import { PLATFORM_UPDATE_DETAILS } from './shellSurfaceLocaleCatalog/platformUpdateDetails';

import { SHELL_SURFACE_COPY } from './shellSurfaceLocaleCatalog';

export type { LauncherCategory, BetaIssueId, ShortcutLabelKey, ShellAccessibilityIssueGroup, ShellPlatformUpdateStatus, ShellSurfaceCopy } from './shellSurfaceLocaleTypes';

export { SHELL_SURFACE_COPY };

export function shellAccessibilityIssueCopy(locale: WorkspaceLocale, code: string, pageOrSlide?: number): string {
  const messages = ACCESSIBILITY_ISSUE_COPY[locale];
  const group = Object.hasOwn(ACCESSIBILITY_ISSUE_GROUPS, code)
    ? ACCESSIBILITY_ISSUE_GROUPS[code]
    : 'unknown';
  const message = messages[group];
  if (pageOrSlide === undefined || !Number.isSafeInteger(pageOrSlide) || pageOrSlide < 1) return message;
  const location = group === 'slide-title' || code.startsWith('present.') ? messages.slide : messages.page;
  return locale === 'zh-CN' && location === messages.page
    ? `${location}${pageOrSlide}页 · ${message}`
    : `${location} ${pageOrSlide} · ${message}`;
}

export function shellPlatformUpdateDetail(locale: WorkspaceLocale, status: ShellPlatformUpdateStatus): string {
  return PLATFORM_UPDATE_DETAILS[locale][status];
}

export function shellSurfaceCopy(locale: WorkspaceLocale): ShellSurfaceCopy {
  return SHELL_SURFACE_COPY[locale];
}

export function formatShellNumber(locale: WorkspaceLocale, value: number): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatShellRelativeTime(locale: WorkspaceLocale, timestamp: number, now = Date.now()): string {
  const elapsedMinutes = Math.floor(Math.max(0, now - timestamp) / 60_000);
  const [value, unit]: [number, Intl.RelativeTimeFormatUnit] = elapsedMinutes < 1
    ? [0, 'second']
    : elapsedMinutes < 60
      ? [-elapsedMinutes, 'minute']
      : elapsedMinutes < 1_440
        ? [-Math.floor(elapsedMinutes / 60), 'hour']
        : [-Math.floor(elapsedMinutes / 1_440), 'day'];
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(value, unit);
}
