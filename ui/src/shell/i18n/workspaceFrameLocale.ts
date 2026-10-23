// STATUS: PLATIN — localized workspace landmark, error, and keyboard-mode labels.
import type { WorkspaceLocale } from '../localization/workspaceLocaleTypes';

export interface WorkspaceFrameCopy {
  readonly skipToContent: string;
  readonly explorerMain: string;
  readonly activeWorkspace: string;
  readonly activeDocument: (kind: string, title: string) => string;
  readonly explorerPreferencesError: string;
  readonly zenShortcut: string;
}

export const WORKSPACE_FRAME_COPY: Readonly<Record<WorkspaceLocale, WorkspaceFrameCopy>> = {
  'de-DE': { skipToContent: 'Direkt zum Inhalt springen', explorerMain: 'Workspace-Explorer', activeWorkspace: 'Aktiver Workspace', activeDocument: (kind, title) => `${kind}: ${title}`, explorerPreferencesError: 'Die Explorer-Einstellungen konnten nicht lokal gespeichert werden.', zenShortcut: 'Zen · F11 / Ctrl+Shift+F' },
  'en-US': { skipToContent: 'Skip to content', explorerMain: 'Workspace Explorer', activeWorkspace: 'Active workspace', activeDocument: (kind, title) => `${kind}: ${title}`, explorerPreferencesError: 'Explorer preferences could not be saved locally.', zenShortcut: 'Zen · F11 / Ctrl+Shift+F' },
  'ru-RU': { skipToContent: 'Перейти к содержимому', explorerMain: 'Проводник Workspace', activeWorkspace: 'Активное рабочее пространство', activeDocument: (kind, title) => `${kind}: ${title}`, explorerPreferencesError: 'Не удалось сохранить параметры проводника локально.', zenShortcut: 'Дзен · F11 / Ctrl+Shift+F' },
  'it-IT': { skipToContent: 'Vai al contenuto', explorerMain: 'Esplora Workspace', activeWorkspace: 'Workspace attivo', activeDocument: (kind, title) => `${kind}: ${title}`, explorerPreferencesError: 'Impossibile salvare localmente le preferenze di Esplora Workspace.', zenShortcut: 'Zen · F11 / Ctrl+Shift+F' },
  'es-ES': { skipToContent: 'Saltar al contenido', explorerMain: 'Explorador de Workspace', activeWorkspace: 'Workspace activo', activeDocument: (kind, title) => `${kind}: ${title}`, explorerPreferencesError: 'No se pudieron guardar localmente las preferencias del explorador.', zenShortcut: 'Zen · F11 / Ctrl+Shift+F' },
  'ja-JP': { skipToContent: '本文へ移動', explorerMain: 'Workspace エクスプローラー', activeWorkspace: 'アクティブなWorkspace', activeDocument: (kind, title) => `${kind}: ${title}`, explorerPreferencesError: 'エクスプローラーの設定をローカルに保存できませんでした。', zenShortcut: 'Zen · F11 / Ctrl+Shift+F' },
  'zh-CN': { skipToContent: '跳转到内容', explorerMain: 'Workspace 浏览器', activeWorkspace: '当前 Workspace', activeDocument: (kind, title) => `${kind}：${title}`, explorerPreferencesError: '无法在本地保存浏览器首选项。', zenShortcut: '禅模式 · F11 / Ctrl+Shift+F' },
};

export function workspaceFrameCopy(locale: WorkspaceLocale): WorkspaceFrameCopy {
  return WORKSPACE_FRAME_COPY[locale];
}
