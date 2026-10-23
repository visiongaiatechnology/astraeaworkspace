// STATUS: PLATIN — stable Workspace locale preference, provider, and message facade.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { browserShellStorage, type ShellStorageLike } from '../platform/workspaceShellPlatform';
import { WORKSPACE_CHROME_COPY } from './workspaceLocaleCatalog';
import { WORKSPACE_LOCALES, type WorkspaceChromeMessage, type WorkspaceLocale, type WorkspaceLocalePreference } from './workspaceLocaleTypes';

export { WORKSPACE_LOCALES } from './workspaceLocaleTypes';
export type { WorkspaceChromeMessage, WorkspaceLocale, WorkspaceLocalePreference } from './workspaceLocaleTypes';

const LOCALE_STORAGE_KEY = 'astraea.workspace.locale.v1';

function safeRead(storage: ShellStorageLike | null): string | null {
  try { return storage?.getItem(LOCALE_STORAGE_KEY) ?? null; } catch { return null; }
}

export function normalizeWorkspaceLocale(value: unknown): WorkspaceLocalePreference {
  return typeof value === 'string' && WORKSPACE_LOCALES.includes(value as WorkspaceLocale)
    ? value as WorkspaceLocale
    : 'system';
}

export function resolveWorkspaceLocale(preference: WorkspaceLocalePreference, systemLocale?: string): WorkspaceLocale {
  if (preference !== 'system') return preference;
  const language = systemLocale?.trim().replaceAll('_', '-').split('-')[0]?.toLowerCase();
  const byLanguage: Readonly<Record<string, WorkspaceLocale>> = {
    de: 'de-DE', en: 'en-US', ru: 'ru-RU', it: 'it-IT', es: 'es-ES', ja: 'ja-JP', zh: 'zh-CN',
  };
  return language ? byLanguage[language] ?? 'en-US' : 'en-US';
}

export function loadWorkspaceLocale(storage: ShellStorageLike | null): WorkspaceLocalePreference {
  return normalizeWorkspaceLocale(safeRead(storage));
}

export function saveWorkspaceLocale(storage: ShellStorageLike | null, value: WorkspaceLocalePreference): WorkspaceLocalePreference {
  const locale = normalizeWorkspaceLocale(value);
  if (!storage) throw new Error('workspace-locale-storage-unavailable');
  storage.setItem(LOCALE_STORAGE_KEY, locale);
  return locale;
}

export function workspaceText(message: WorkspaceChromeMessage, locale: WorkspaceLocale): string {
  return WORKSPACE_CHROME_COPY[locale][message];
}

interface WorkspaceLocaleContextValue {
  preference: WorkspaceLocalePreference;
  locale: WorkspaceLocale;
  setPreference: (value: WorkspaceLocalePreference) => void;
}

const DEFAULT_CONTEXT: WorkspaceLocaleContextValue = {
  preference: 'system',
  locale: 'en-US',
  setPreference: () => undefined,
};

const WorkspaceLocaleContext = createContext<WorkspaceLocaleContextValue>(DEFAULT_CONTEXT);

export const WorkspaceLocaleProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const storage = useMemo(() => browserShellStorage(), []);
  const [preference, setPreferenceState] = useState<WorkspaceLocalePreference>(() => loadWorkspaceLocale(storage));
  const locale = resolveWorkspaceLocale(preference, typeof navigator === 'undefined' ? undefined : navigator.language);

  const setPreference = useCallback((value: WorkspaceLocalePreference) => {
    const normalized = saveWorkspaceLocale(storage, value);
    setPreferenceState(normalized);
  }, [storage]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const contextValue = useMemo(() => ({ preference, locale, setPreference }), [locale, preference, setPreference]);
  return <WorkspaceLocaleContext.Provider value={contextValue}>{children}</WorkspaceLocaleContext.Provider>;
};

export function useWorkspaceLocale(): WorkspaceLocaleContextValue {
  return useContext(WorkspaceLocaleContext);
}
