// STATUS: PLATIN — typed index for the seven shared shell surface catalogs.

import type { WorkspaceLocale } from '../localization/workspaceLocaleTypes';

import type { ShellSurfaceCopy } from './shellSurfaceLocaleTypes';

import { DE } from './shellSurfaceLocaleCatalog/de-DE';

import { EN } from './shellSurfaceLocaleCatalog/en-US';

import { RU } from './shellSurfaceLocaleCatalog/ru-RU';

import { IT } from './shellSurfaceLocaleCatalog/it-IT';

import { ES } from './shellSurfaceLocaleCatalog/es-ES';

import { JA } from './shellSurfaceLocaleCatalog/ja-JP';

import { ZH } from './shellSurfaceLocaleCatalog/zh-CN';

export const SHELL_SURFACE_COPY: Record<WorkspaceLocale, ShellSurfaceCopy> = {
  'de-DE': DE,
  'en-US': EN,
  'ru-RU': RU,
  'it-IT': IT,
  'es-ES': ES,
  'ja-JP': JA,
  'zh-CN': ZH,
};
