// STATUS: PLATIN — localized recovery copy with fixed, non-sensitive failure messaging.
import type { WorkspaceLocale } from '../localization/workspaceLocaleTypes';

export interface ModuleRecoveryCopy {
  readonly stopped: string;
  readonly workspaceContinues: string;
  readonly explanation: string;
  readonly incident: string;
  readonly exportState: string;
  /** WR-044: shown when the security profile/classification forbids a content export. */
  readonly exportRedacted: string;
  readonly restartModule: string;
  /** GR-001: local, content-free diagnostic record of the containment. */
  readonly exportDiagnostics: string;
  /** Runde 35: explains that a failed download still shows the payload below for copying. */
  readonly exportHint?: string;
}

export const MODULE_RECOVERY_COPY: Readonly<Record<WorkspaceLocale, ModuleRecoveryCopy>> = {
  'de-DE': {
    stopped: 'Modul wurde sicher angehalten', workspaceContinues: 'Der Workspace läuft weiter.',
    explanation: 'Nur die aktive Modulansicht wurde angehalten. Das kanonische Dokumentmodell bleibt im Workspace erhalten. Du kannst den Zustand lokal exportieren oder das Modul neu starten.',
    incident: 'Vorfall', exportState: 'Zustand exportieren', exportRedacted: 'Der Dokumentinhalt wird aus Sicherheitsgründen nicht exportiert — nur Kennung, Version und Klassifizierung.', restartModule: 'Modul neu starten', exportDiagnostics: 'Diagnoseprotokoll exportieren',
    exportHint: 'Kein Download? Das Protokoll erscheint unten und ist kopierbar. / No download? The log is shown below and can be copied.',
  },
  'en-US': {
    stopped: 'Module safely stopped', workspaceContinues: 'The Workspace is still running.',
    explanation: 'Only the active module view stopped. The canonical document model remains in the Workspace. You can export its state locally or restart the module.',
    incident: 'Incident', exportState: 'Export state', exportRedacted: 'Document content is withheld for security reasons — only id, version and classification are exported.', restartModule: 'Restart module', exportDiagnostics: 'Export diagnostics',
    exportHint: 'No download? The log is shown below and can be copied.',
  },
  'ru-RU': {
    stopped: 'Модуль безопасно остановлен', workspaceContinues: 'Workspace продолжает работу.',
    explanation: 'Остановлено только активное представление модуля. Каноническая модель документа сохранена в Workspace. Вы можете локально экспортировать её состояние или перезапустить модуль.',
    incident: 'Инцидент', exportState: 'Экспортировать состояние', exportRedacted: 'Содержимое документа не экспортируется по соображениям безопасности — только идентификатор, версия и классификация.', restartModule: 'Перезапустить модуль', exportDiagnostics: 'Экспортировать диагностику',
  },
  'it-IT': {
    stopped: 'Modulo arrestato in sicurezza', workspaceContinues: 'Workspace continua a funzionare.',
    explanation: 'Si è arrestata solo la vista del modulo attivo. Il modello canonico del documento resta in Workspace. Puoi esportarne lo stato localmente o riavviare il modulo.',
    incident: 'Incidente', exportState: 'Esporta stato', exportRedacted: 'Il contenuto del documento non viene esportato per motivi di sicurezza — solo ID, versione e classificazione.', restartModule: 'Riavvia modulo', exportDiagnostics: 'Esporta diagnostica',
  },
  'es-ES': {
    stopped: 'Módulo detenido de forma segura', workspaceContinues: 'Workspace sigue funcionando.',
    explanation: 'Solo se detuvo la vista del módulo activo. El modelo canónico del documento permanece en Workspace. Puedes exportar su estado localmente o reiniciar el módulo.',
    incident: 'Incidente', exportState: 'Exportar estado', exportRedacted: 'El contenido del documento no se exporta por motivos de seguridad: solo ID, versión y clasificación.', restartModule: 'Reiniciar módulo', exportDiagnostics: 'Exportar diagnóstico',
  },
  'ja-JP': {
    stopped: 'モジュールを安全に停止しました', workspaceContinues: 'Workspaceは引き続き動作しています。',
    explanation: '停止したのはアクティブなモジュールビューのみです。正規ドキュメントモデルはWorkspaceに保持されています。状態をローカルにエクスポートするか、モジュールを再起動できます。',
    incident: 'インシデント', exportState: '状態をエクスポート', exportRedacted: 'セキュリティ上の理由により、ドキュメントの内容はエクスポートされません — ID、バージョン、分類のみです。', restartModule: 'モジュールを再起動', exportDiagnostics: '診断ログをエクスポート',
  },
  'zh-CN': {
    stopped: '模块已安全停止', workspaceContinues: 'Workspace 仍在运行。',
    explanation: '只有当前活动模块视图已停止。规范文档模型仍保留在 Workspace 中。你可以在本地导出其状态，或重新启动模块。',
    incident: '事件', exportState: '导出状态', exportRedacted: '出于安全原因，不导出文档内容——仅导出标识、版本和分类。', restartModule: '重新启动模块', exportDiagnostics: '导出诊断日志',
  },
};

export function moduleRecoveryCopy(locale: WorkspaceLocale): ModuleRecoveryCopy {
  return MODULE_RECOVERY_COPY[locale];
}
