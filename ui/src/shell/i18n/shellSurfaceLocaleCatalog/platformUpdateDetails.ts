// STATUS: PLATIN — localized signed-update status descriptions.

import type { WorkspaceLocale } from '../../localization/workspaceLocaleTypes';

import type { ShellPlatformUpdateStatus } from '../shellSurfaceLocaleTypes';

export const PLATFORM_UPDATE_DETAILS: Record<WorkspaceLocale, Record<ShellPlatformUpdateStatus, string>> = {
  'de-DE': {
    manual_offline: 'Automatische Update-Netzwerkzugriffe sind deaktiviert; signierte Offline-Updates bleiben verfügbar.',
    current: 'Die installierte Workspace-Version ist aktuell.',
    available: 'Ein signiertes Workspace-Update ist verfügbar.',
    failed: 'Der Update-Status konnte nicht abgerufen werden.',
  },
  'en-US': {
    manual_offline: 'Automatic update networking is disabled; signed offline updates remain available.',
    current: 'The installed Workspace version is up to date.',
    available: 'A signed Workspace update is available.',
    failed: 'The update status could not be retrieved.',
  },
  'ru-RU': {
    manual_offline: 'Автоматическая сетевая проверка обновлений отключена; подписанные офлайн-обновления доступны.',
    current: 'Установлена актуальная версия Workspace.',
    available: 'Доступно подписанное обновление Workspace.',
    failed: 'Не удалось получить статус обновления.',
  },
  'it-IT': {
    manual_offline: 'La rete per gli aggiornamenti automatici è disattivata; gli aggiornamenti offline firmati restano disponibili.',
    current: 'La versione di Workspace installata è aggiornata.',
    available: 'È disponibile un aggiornamento Workspace firmato.',
    failed: 'Impossibile recuperare lo stato degli aggiornamenti.',
  },
  'es-ES': {
    manual_offline: 'La red de actualizaciones automáticas está desactivada; siguen disponibles las actualizaciones sin conexión firmadas.',
    current: 'La versión instalada de Workspace está actualizada.',
    available: 'Hay disponible una actualización firmada de Workspace.',
    failed: 'No se pudo obtener el estado de las actualizaciones.',
  },
  'ja-JP': {
    manual_offline: '自動更新のネットワーク通信は無効です。署名済みのオフライン更新は利用できます。',
    current: 'インストール済みの Workspace は最新です。',
    available: '署名済み Workspace 更新を利用できます。',
    failed: '更新状態を取得できませんでした。',
  },
  'zh-CN': {
    manual_offline: '自动更新网络已禁用；仍可使用已签名的离线更新。',
    current: '已安装的 Workspace 版本为最新版本。',
    available: '有可用的已签名 Workspace 更新。',
    failed: '无法获取更新状态。',
  },
};
