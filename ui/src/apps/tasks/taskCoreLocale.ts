// STATUS: GOLD — complete seven-locale copy for the Tasks core-field editor.
import type { WorkspaceLocale } from '../../shell/localization/workspaceLocaleTypes';

const ENGLISH = {
  title: 'Title', description: 'Rich description', descriptionHint: 'Markdown · local DOM preview', status: 'Status',
  priority: 'Priority', low: 'Low', medium: 'Medium', high: 'High', statusReason: 'Status reason / blocker',
  statusReasonPlaceholder: 'Why blocked, waiting or cancelled?', important: 'Important', inbox: 'Inbox', myDay: 'My Day',
  personalList: 'Personal list', noList: 'No list', progress: 'Progress', assignees: 'Assignees',
  assigneesPlaceholder: 'Multiple local identities, comma-separated', startDate: 'Start date/time', dueDate: 'Due date/time',
  legacyDate: 'Legacy date', estimateHours: 'Estimate (hours)', actualHours: 'Actual (hours)', tags: 'Tags / categories / labels',
  projectId: 'Project ID', phaseId: 'Phase ID', planId: 'Plan ID', completion: 'Completion', notCompleted: 'Not completed',
  auditMetadata: 'Immutable / audit metadata', created: 'Created', createdBy: 'Created by', updated: 'Updated',
  updatedBy: 'Updated by', source: 'Source', legacy: 'legacy',
} as const;

type TaskCoreKey = keyof typeof ENGLISH;
type TaskCoreCopy = Record<TaskCoreKey, string>;
export const TASK_CORE_COPY: Readonly<Record<WorkspaceLocale, TaskCoreCopy>> = {
  'en-US': ENGLISH,
  'de-DE': {
    title: 'Titel', description: 'Formatierte Beschreibung', descriptionHint: 'Markdown · lokale DOM-Vorschau', status: 'Status',
    priority: 'Priorität', low: 'Niedrig', medium: 'Mittel', high: 'Hoch', statusReason: 'Statusgrund / Blocker',
    statusReasonPlaceholder: 'Warum blockiert, wartend oder abgebrochen?', important: 'Wichtig', inbox: 'Posteingang', myDay: 'Mein Tag',
    personalList: 'Persönliche Liste', noList: 'Keine Liste', progress: 'Fortschritt', assignees: 'Zugewiesen an',
    assigneesPlaceholder: 'Mehrere lokale Identitäten, durch Kommas getrennt', startDate: 'Startdatum/-zeit', dueDate: 'Fälligkeitsdatum/-zeit',
    legacyDate: 'Altes Datumsfeld', estimateHours: 'Schätzung (Stunden)', actualHours: 'Ist-Aufwand (Stunden)', tags: 'Tags / Kategorien / Labels',
    projectId: 'Projekt-ID', phaseId: 'Phasen-ID', planId: 'Plan-ID', completion: 'Abschluss', notCompleted: 'Nicht abgeschlossen',
    auditMetadata: 'Unveränderliche Audit-Metadaten', created: 'Erstellt', createdBy: 'Erstellt von', updated: 'Aktualisiert',
    updatedBy: 'Aktualisiert von', source: 'Quelle', legacy: 'alt',
  },
  'es-ES': {
    title: 'Título', description: 'Descripción enriquecida', descriptionHint: 'Markdown · vista previa DOM local', status: 'Estado',
    priority: 'Prioridad', low: 'Baja', medium: 'Media', high: 'Alta', statusReason: 'Motivo del estado / bloqueo',
    statusReasonPlaceholder: '¿Por qué está bloqueada, en espera o cancelada?', important: 'Importante', inbox: 'Bandeja de entrada', myDay: 'Mi día',
    personalList: 'Lista personal', noList: 'Sin lista', progress: 'Progreso', assignees: 'Responsables',
    assigneesPlaceholder: 'Varias identidades locales, separadas por comas', startDate: 'Fecha y hora de inicio', dueDate: 'Fecha y hora de vencimiento',
    legacyDate: 'Fecha heredada', estimateHours: 'Estimación (horas)', actualHours: 'Real (horas)', tags: 'Etiquetas / categorías',
    projectId: 'ID del proyecto', phaseId: 'ID de fase', planId: 'ID del plan', completion: 'Finalización', notCompleted: 'Sin finalizar',
    auditMetadata: 'Metadatos de auditoría inmutables', created: 'Creado', createdBy: 'Creado por', updated: 'Actualizado',
    updatedBy: 'Actualizado por', source: 'Origen', legacy: 'heredado',
  },
  'it-IT': {
    title: 'Titolo', description: 'Descrizione formattata', descriptionHint: 'Markdown · anteprima DOM locale', status: 'Stato',
    priority: 'Priorità', low: 'Bassa', medium: 'Media', high: 'Alta', statusReason: 'Motivo dello stato / blocco',
    statusReasonPlaceholder: 'Perché è bloccata, in attesa o annullata?', important: 'Importante', inbox: 'Posta in arrivo', myDay: 'La mia giornata',
    personalList: 'Elenco personale', noList: 'Nessun elenco', progress: 'Avanzamento', assignees: 'Assegnatari',
    assigneesPlaceholder: 'Più identità locali, separate da virgole', startDate: 'Data/ora di inizio', dueDate: 'Data/ora di scadenza',
    legacyDate: 'Data legacy', estimateHours: 'Stima (ore)', actualHours: 'Effettivo (ore)', tags: 'Tag / categorie / etichette',
    projectId: 'ID progetto', phaseId: 'ID fase', planId: 'ID piano', completion: 'Completamento', notCompleted: 'Non completata',
    auditMetadata: 'Metadati di audit immutabili', created: 'Creata', createdBy: 'Creata da', updated: 'Aggiornata',
    updatedBy: 'Aggiornata da', source: 'Origine', legacy: 'legacy',
  },
  'ja-JP': {
    title: 'タイトル', description: 'リッチな説明', descriptionHint: 'Markdown · ローカル DOM プレビュー', status: 'ステータス',
    priority: '優先度', low: '低', medium: '中', high: '高', statusReason: 'ステータスの理由 / ブロッカー',
    statusReasonPlaceholder: 'ブロック中、待機中、またはキャンセルの理由', important: '重要', inbox: '受信トレイ', myDay: '今日の予定',
    personalList: '個人リスト', noList: 'リストなし', progress: '進捗', assignees: '担当者',
    assigneesPlaceholder: '複数のローカル ID をカンマで区切って入力', startDate: '開始日時', dueDate: '期限日時',
    legacyDate: '旧形式の日付', estimateHours: '見積もり（時間）', actualHours: '実績（時間）', tags: 'タグ / カテゴリ / ラベル',
    projectId: 'プロジェクト ID', phaseId: 'フェーズ ID', planId: 'プラン ID', completion: '完了', notCompleted: '未完了',
    auditMetadata: '変更不可の監査メタデータ', created: '作成日時', createdBy: '作成者', updated: '更新日時',
    updatedBy: '更新者', source: 'ソース', legacy: '旧形式',
  },
  'ru-RU': {
    title: 'Название', description: 'Форматированное описание', descriptionHint: 'Markdown · локальный DOM-просмотр', status: 'Статус',
    priority: 'Приоритет', low: 'Низкий', medium: 'Средний', high: 'Высокий', statusReason: 'Причина статуса / блокировка',
    statusReasonPlaceholder: 'Почему задача заблокирована, ожидает или отменена?', important: 'Важно', inbox: 'Входящие', myDay: 'Мой день',
    personalList: 'Личный список', noList: 'Без списка', progress: 'Выполнение', assignees: 'Исполнители',
    assigneesPlaceholder: 'Несколько локальных профилей через запятую', startDate: 'Дата и время начала', dueDate: 'Срок выполнения',
    legacyDate: 'Устаревшая дата', estimateHours: 'Оценка (часы)', actualHours: 'Фактически (часы)', tags: 'Метки / категории',
    projectId: 'ID проекта', phaseId: 'ID этапа', planId: 'ID плана', completion: 'Завершение', notCompleted: 'Не завершено',
    auditMetadata: 'Неизменяемые аудиторские метаданные', created: 'Создано', createdBy: 'Кем создано', updated: 'Обновлено',
    updatedBy: 'Кем обновлено', source: 'Источник', legacy: 'устаревшее',
  },
  'zh-CN': {
    title: '标题', description: '富文本说明', descriptionHint: 'Markdown · 本地 DOM 预览', status: '状态',
    priority: '优先级', low: '低', medium: '中', high: '高', statusReason: '状态原因 / 阻塞项',
    statusReasonPlaceholder: '为何阻塞、等待或取消？', important: '重要', inbox: '收件箱', myDay: '今日计划',
    personalList: '个人列表', noList: '无列表', progress: '进度', assignees: '负责人',
    assigneesPlaceholder: '多个本地身份，以逗号分隔', startDate: '开始日期/时间', dueDate: '截止日期/时间',
    legacyDate: '旧版日期', estimateHours: '预估（小时）', actualHours: '实际（小时）', tags: '标签 / 类别',
    projectId: '项目 ID', phaseId: '阶段 ID', planId: '计划 ID', completion: '完成情况', notCompleted: '未完成',
    auditMetadata: '不可变审计元数据', created: '创建时间', createdBy: '创建者', updated: '更新时间',
    updatedBy: '更新者', source: '来源', legacy: '旧版',
  },
};

export function taskCoreText(message: TaskCoreKey, locale: WorkspaceLocale): string {
  return TASK_CORE_COPY[locale][message];
}
