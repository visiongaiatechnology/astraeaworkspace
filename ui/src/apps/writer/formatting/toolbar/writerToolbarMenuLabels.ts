// STATUS: PLATIN — Labels for the labelled toolbar menus (WR-023)
//
// The three primary-row disclosures and their group headings live here instead of in
// `writerToolbarLocale.ts`: that catalog is a flat `Record` with one key per tooltip,
// and threading ten group headings through seven locales would have touched every
// block for a purely structural concern. One typed table per locale keeps the same
// guarantee — a missing translation does not compile.
import type { WorkspaceLocale } from '../../../../shell/localization/workspaceLocale';

export interface WriterToolbarMenuLabels {
  readonly insert: string;
  readonly format: string;
  readonly tools: string;
  readonly tables: string;
  readonly media: string;
  readonly references: string;
  readonly breaks: string;
  readonly paragraph: string;
  readonly writingAssist: string;
  readonly document: string;
  readonly view: string;
}

export const WRITER_TOOLBAR_MENU_LABELS: Readonly<Record<WorkspaceLocale, WriterToolbarMenuLabels>> = {
  'de-DE': {
    insert: 'Einfügen',
    format: 'Format',
    tools: 'Werkzeuge & Ansicht',
    tables: 'Tabellen',
    media: 'Medien & Formen',
    references: 'Verweise',
    breaks: 'Umbrüche',
    paragraph: 'Absatz',
    writingAssist: 'Schreibhilfen',
    document: 'Dokument',
    view: 'Ansicht & Zoom',
  },
  'en-US': {
    insert: 'Insert',
    format: 'Format',
    tools: 'Tools & view',
    tables: 'Tables',
    media: 'Media & shapes',
    references: 'References',
    breaks: 'Breaks',
    paragraph: 'Paragraph',
    writingAssist: 'Writing aids',
    document: 'Document',
    view: 'View & zoom',
  },
  'ru-RU': {
    insert: 'Вставка',
    format: 'Формат',
    tools: 'Инструменты и вид',
    tables: 'Таблицы',
    media: 'Медиа и фигуры',
    references: 'Ссылки',
    breaks: 'Разрывы',
    paragraph: 'Абзац',
    writingAssist: 'Помощь при письме',
    document: 'Документ',
    view: 'Вид и масштаб',
  },
  'it-IT': {
    insert: 'Inserisci',
    format: 'Formato',
    tools: 'Strumenti e vista',
    tables: 'Tabelle',
    media: 'Media e forme',
    references: 'Riferimenti',
    breaks: 'Interruzioni',
    paragraph: 'Paragrafo',
    writingAssist: 'Aiuti di scrittura',
    document: 'Documento',
    view: 'Vista e zoom',
  },
  'es-ES': {
    insert: 'Insertar',
    format: 'Formato',
    tools: 'Herramientas y vista',
    tables: 'Tablas',
    media: 'Medios y formas',
    references: 'Referencias',
    breaks: 'Saltos',
    paragraph: 'Párrafo',
    writingAssist: 'Ayudas de escritura',
    document: 'Documento',
    view: 'Vista y zoom',
  },
  'ja-JP': {
    insert: '挿入',
    format: '書式',
    tools: 'ツールと表示',
    tables: '表',
    media: 'メディアと図形',
    references: '参照',
    breaks: '改ページ',
    paragraph: '段落',
    writingAssist: '執筆支援',
    document: '文書',
    view: '表示とズーム',
  },
  'zh-CN': {
    insert: '插入',
    format: '格式',
    tools: '工具与视图',
    tables: '表格',
    media: '媒体与形状',
    references: '引用',
    breaks: '分隔符',
    paragraph: '段落',
    writingAssist: '写作辅助',
    document: '文档',
    view: '视图与缩放',
  },
};

export function writerToolbarMenuLabels(locale: WorkspaceLocale): WriterToolbarMenuLabels {
  return WRITER_TOOLBAR_MENU_LABELS[locale] ?? WRITER_TOOLBAR_MENU_LABELS['en-US'];
}
