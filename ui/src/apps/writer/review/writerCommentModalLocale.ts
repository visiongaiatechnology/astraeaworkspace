// STATUS: PLATIN — typed seven-locale copy for the Writer comment dialog (WR-038).
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';

export interface WriterCommentModalCopy {
  readonly title: string;
  readonly textLabel: string;
  readonly authorLabel: string;
  readonly save: string;
  readonly cancel: string;
  readonly empty: string;
  readonly tooLong: string;
  readonly blocked: string;
}

export const WRITER_COMMENT_MODAL_COPY: Readonly<Record<WorkspaceLocale, WriterCommentModalCopy>> = {
  'de-DE': {
    title: 'Kommentar hinzufügen', textLabel: 'Kommentar', authorLabel: 'Autor',
    save: 'Kommentar speichern', cancel: 'Abbrechen',
    empty: 'Bitte einen Kommentartext eingeben.',
    tooLong: 'Der Kommentar ist zu lang (maximal 4 000 Zeichen).',
    blocked: 'Der aktuelle Dokumentschutz erlaubt keine Kommentare.',
  },
  'en-US': {
    title: 'Add comment', textLabel: 'Comment', authorLabel: 'Author',
    save: 'Save comment', cancel: 'Cancel',
    empty: 'Please enter a comment.',
    tooLong: 'The comment is too long (4,000 characters maximum).',
    blocked: 'The current document protection does not allow comments.',
  },
  'ru-RU': {
    title: 'Добавить комментарий', textLabel: 'Комментарий', authorLabel: 'Автор',
    save: 'Сохранить комментарий', cancel: 'Отмена',
    empty: 'Введите текст комментария.',
    tooLong: 'Комментарий слишком длинный (не более 4 000 символов).',
    blocked: 'Текущая защита документа не разрешает комментарии.',
  },
  'it-IT': {
    title: 'Aggiungi commento', textLabel: 'Commento', authorLabel: 'Autore',
    save: 'Salva commento', cancel: 'Annulla',
    empty: 'Inserisci un testo per il commento.',
    tooLong: 'Il commento è troppo lungo (massimo 4.000 caratteri).',
    blocked: 'La protezione del documento non consente commenti.',
  },
  'es-ES': {
    title: 'Añadir comentario', textLabel: 'Comentario', authorLabel: 'Autor',
    save: 'Guardar comentario', cancel: 'Cancelar',
    empty: 'Introduce un texto para el comentario.',
    tooLong: 'El comentario es demasiado largo (máximo 4.000 caracteres).',
    blocked: 'La protección del documento no permite comentarios.',
  },
  'ja-JP': {
    title: 'コメントを追加', textLabel: 'コメント', authorLabel: '作成者',
    save: 'コメントを保存', cancel: 'キャンセル',
    empty: 'コメントを入力してください。',
    tooLong: 'コメントが長すぎます（最大 4,000 文字）。',
    blocked: '現在のドキュメント保護ではコメントを追加できません。',
  },
  'zh-CN': {
    title: '添加批注', textLabel: '批注', authorLabel: '作者',
    save: '保存批注', cancel: '取消',
    empty: '请输入批注内容。',
    tooLong: '批注过长（最多 4,000 个字符）。',
    blocked: '当前文档保护不允许添加批注。',
  },
};

export function writerCommentModalCopy(locale: WorkspaceLocale): WriterCommentModalCopy {
  return WRITER_COMMENT_MODAL_COPY[locale];
}
