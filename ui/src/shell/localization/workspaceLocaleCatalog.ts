// STATUS: PLATIN — typed index for all seven immutable Workspace chrome catalogs.
import type { WorkspaceChromeMessage, WorkspaceLocale } from './workspaceLocaleTypes';
import { enUSWorkspaceChromeMessages } from './workspaceLocaleCatalog/en-US';
import { deDEWorkspaceChromeMessages } from './workspaceLocaleCatalog/de-DE';
import { ruRUWorkspaceChromeMessages } from './workspaceLocaleCatalog/ru-RU';
import { itITWorkspaceChromeMessages } from './workspaceLocaleCatalog/it-IT';
import { esESWorkspaceChromeMessages } from './workspaceLocaleCatalog/es-ES';
import { jaJPWorkspaceChromeMessages } from './workspaceLocaleCatalog/ja-JP';
import { zhCNWorkspaceChromeMessages } from './workspaceLocaleCatalog/zh-CN';

export const WORKSPACE_CHROME_COPY: Readonly<Record<WorkspaceLocale, Readonly<Record<WorkspaceChromeMessage, string>>>> = {
  'en-US': enUSWorkspaceChromeMessages,
  'de-DE': deDEWorkspaceChromeMessages,
  'ru-RU': ruRUWorkspaceChromeMessages,
  'it-IT': itITWorkspaceChromeMessages,
  'es-ES': esESWorkspaceChromeMessages,
  'ja-JP': jaJPWorkspaceChromeMessages,
  'zh-CN': zhCNWorkspaceChromeMessages,
};
