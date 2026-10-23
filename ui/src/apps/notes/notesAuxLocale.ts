// STATUS: GOLD — complete seven-locale copy for Notes properties and attachment preview.
import type { WorkspaceLocale } from '../../shell/localization/workspaceLocaleTypes';

const ENGLISH = {
  properties: 'Properties', customProperties: 'Custom properties', removeProperty: 'Remove property',
  key: 'Key', value: 'Value', addCustomProperty: 'Add custom property',
  attachmentPreview: 'Attachment preview', closeAttachmentPreview: 'Close attachment preview',
  integrityChecking: 'Checking', integrityValid: 'Verified', integrityInvalid: 'Invalid',
  integrityBlocked: 'Preview blocked until the persisted SHA-256 integrity check passes.',
  envelopeInvalid: 'Attachment envelope is invalid.', decodeFailed: 'Text preview could not be decoded.',
  opaqueAttachment: 'This file is stored as an opaque attachment. No active viewer is invoked for this MIME type.',
  saveAs: 'Save As', close: 'Close', missingHash: 'missing',
} as const;

type NotesAuxKey = keyof typeof ENGLISH;
type NotesAuxCopy = Record<NotesAuxKey, string>;

export const NOTES_AUX_COPY: Readonly<Record<WorkspaceLocale, NotesAuxCopy>> = {
  'en-US': ENGLISH,
  'de-DE': {
    properties: 'Eigenschaften', customProperties: 'Benutzerdefinierte Eigenschaften', removeProperty: 'Eigenschaft entfernen',
    key: 'Schlüssel', value: 'Wert', addCustomProperty: 'Benutzerdefinierte Eigenschaft hinzufügen',
    attachmentPreview: 'Anhangsvorschau', closeAttachmentPreview: 'Anhangsvorschau schließen',
    integrityChecking: 'Wird geprüft', integrityValid: 'Verifiziert', integrityInvalid: 'Ungültig',
    integrityBlocked: 'Die Vorschau bleibt gesperrt, bis die gespeicherte SHA-256-Integritätsprüfung bestanden ist.',
    envelopeInvalid: 'Der Anhangscontainer ist ungültig.', decodeFailed: 'Die Textvorschau konnte nicht dekodiert werden.',
    opaqueAttachment: 'Diese Datei ist als undurchsichtiger Anhang gespeichert. Für diesen MIME-Typ wird keine aktive Vorschau geöffnet.',
    saveAs: 'Speichern unter', close: 'Schließen', missingHash: 'fehlt',
  },
  'es-ES': {
    properties: 'Propiedades', customProperties: 'Propiedades personalizadas', removeProperty: 'Quitar propiedad',
    key: 'Clave', value: 'Valor', addCustomProperty: 'Añadir propiedad personalizada',
    attachmentPreview: 'Vista previa del adjunto', closeAttachmentPreview: 'Cerrar vista previa del adjunto',
    integrityChecking: 'Comprobando', integrityValid: 'Verificada', integrityInvalid: 'No válida',
    integrityBlocked: 'La vista previa está bloqueada hasta que se supere la comprobación de integridad SHA-256 almacenada.',
    envelopeInvalid: 'El contenedor del adjunto no es válido.', decodeFailed: 'No se pudo decodificar la vista previa de texto.',
    opaqueAttachment: 'Este archivo se guarda como adjunto opaco. No se abre ningún visor para este tipo MIME.',
    saveAs: 'Guardar como', close: 'Cerrar', missingHash: 'falta',
  },
  'it-IT': {
    properties: 'Proprietà', customProperties: 'Proprietà personalizzate', removeProperty: 'Rimuovi proprietà',
    key: 'Chiave', value: 'Valore', addCustomProperty: 'Aggiungi proprietà personalizzata',
    attachmentPreview: 'Anteprima allegato', closeAttachmentPreview: 'Chiudi anteprima allegato',
    integrityChecking: 'Verifica in corso', integrityValid: 'Verificata', integrityInvalid: 'Non valida',
    integrityBlocked: 'L’anteprima resta bloccata finché il controllo di integrità SHA-256 salvato non viene superato.',
    envelopeInvalid: 'Il contenitore dell’allegato non è valido.', decodeFailed: 'Impossibile decodificare l’anteprima del testo.',
    opaqueAttachment: 'Questo file è archiviato come allegato opaco. Non viene aperto alcun visualizzatore per questo tipo MIME.',
    saveAs: 'Salva con nome', close: 'Chiudi', missingHash: 'mancante',
  },
  'ja-JP': {
    properties: 'プロパティ', customProperties: 'カスタムプロパティ', removeProperty: 'プロパティを削除',
    key: 'キー', value: '値', addCustomProperty: 'カスタムプロパティを追加',
    attachmentPreview: '添付ファイルのプレビュー', closeAttachmentPreview: '添付ファイルのプレビューを閉じる',
    integrityChecking: '確認中', integrityValid: '検証済み', integrityInvalid: '無効',
    integrityBlocked: '保存済み SHA-256 整合性チェックに合格するまでプレビューはブロックされます。',
    envelopeInvalid: '添付ファイルの形式が無効です。', decodeFailed: 'テキストプレビューをデコードできませんでした。',
    opaqueAttachment: 'このファイルは内容を開かない添付として保存されています。この MIME タイプのビューアーは起動しません。',
    saveAs: '名前を付けて保存', close: '閉じる', missingHash: 'なし',
  },
  'ru-RU': {
    properties: 'Свойства', customProperties: 'Пользовательские свойства', removeProperty: 'Удалить свойство',
    key: 'Ключ', value: 'Значение', addCustomProperty: 'Добавить пользовательское свойство',
    attachmentPreview: 'Предпросмотр вложения', closeAttachmentPreview: 'Закрыть предпросмотр вложения',
    integrityChecking: 'Проверка', integrityValid: 'Проверено', integrityInvalid: 'Недействительно',
    integrityBlocked: 'Предпросмотр заблокирован до успешной проверки сохранённой целостности SHA-256.',
    envelopeInvalid: 'Контейнер вложения недействителен.', decodeFailed: 'Не удалось декодировать текстовый предпросмотр.',
    opaqueAttachment: 'Файл сохранён как непрозрачное вложение. Просмотрщик для этого MIME-типа не запускается.',
    saveAs: 'Сохранить как', close: 'Закрыть', missingHash: 'отсутствует',
  },
  'zh-CN': {
    properties: '属性', customProperties: '自定义属性', removeProperty: '删除属性',
    key: '键', value: '值', addCustomProperty: '添加自定义属性',
    attachmentPreview: '附件预览', closeAttachmentPreview: '关闭附件预览',
    integrityChecking: '正在检查', integrityValid: '已验证', integrityInvalid: '无效',
    integrityBlocked: '通过已保存的 SHA-256 完整性检查后才能预览。',
    envelopeInvalid: '附件封装无效。', decodeFailed: '无法解码文本预览。',
    opaqueAttachment: '此文件以不可查看的附件形式保存，不会为此 MIME 类型启动查看器。',
    saveAs: '另存为', close: '关闭', missingHash: '缺失',
  },
};

export function notesAuxText(message: NotesAuxKey, locale: WorkspaceLocale): string {
  return NOTES_AUX_COPY[locale][message];
}
