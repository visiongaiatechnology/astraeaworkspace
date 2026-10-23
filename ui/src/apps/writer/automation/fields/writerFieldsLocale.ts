// STATUS: PLATIN — complete seven-locale copy for the Writer dynamic-field dialog.
import type { WorkspaceLocale } from '../../../../shell/localization/workspaceLocaleTypes';

export const WRITER_FIELD_IDS = [
  'DATE_DE',
  'DATE_ISO',
  'TIME',
  'PAGE',
  'NUMPAGES',
  'PAGE_OF_PAGES',
  'TITLE',
  'AUTHOR',
  'WORDS',
  'HEADER_TEXT',
] as const;

export type WriterFieldId = (typeof WRITER_FIELD_IDS)[number];

type WriterFieldLabel = {
  category: string;
  name: string;
};

type WriterFieldsCopy = {
  title: string;
  closeDialog: string;
  fieldCode: string;
  category: string;
  outputValue: string;
  cancel: string;
  insertFieldValue: string;
  fields: Record<WriterFieldId, WriterFieldLabel>;
};

const ENGLISH: WriterFieldsCopy = {
  title: 'Insert dynamic field (Fields System)',
  closeDialog: 'Close Insert dynamic field dialog',
  fieldCode: 'Field code:',
  category: 'Category:',
  outputValue: 'Output value:',
  cancel: 'Cancel',
  insertFieldValue: 'Insert field value',
  fields: {
    DATE_DE: { category: 'Date & time', name: 'Current date (DD.MM.YYYY)' },
    DATE_ISO: { category: 'Date & time', name: 'ISO date (YYYY-MM-DD)' },
    TIME: { category: 'Date & time', name: 'Current time (HH:mm:ss)' },
    PAGE: { category: 'Numbering', name: 'Current page number' },
    NUMPAGES: { category: 'Numbering', name: 'Total page count' },
    PAGE_OF_PAGES: { category: 'Numbering', name: 'Page X of Y' },
    TITLE: { category: 'Document info', name: 'Document title' },
    AUTHOR: { category: 'Document info', name: 'Document author' },
    WORDS: { category: 'Statistics', name: 'Word count' },
    HEADER_TEXT: { category: 'Page layout', name: 'Header text' },
  },
};

export const WRITER_FIELDS_COPY: Readonly<Record<WorkspaceLocale, WriterFieldsCopy>> = {
  'en-US': ENGLISH,
  'de-DE': {
    title: 'Dynamisches Feld einfügen (Fields System)',
    closeDialog: 'Dialog „Dynamisches Feld einfügen“ schließen',
    fieldCode: 'Feldcode:',
    category: 'Kategorie:',
    outputValue: 'Ausgabewert:',
    cancel: 'Abbrechen',
    insertFieldValue: 'Feldwert einfügen',
    fields: {
      DATE_DE: { category: 'Datum & Zeit', name: 'Aktuelles Datum (DD.MM.YYYY)' },
      DATE_ISO: { category: 'Datum & Zeit', name: 'ISO-Datum (YYYY-MM-DD)' },
      TIME: { category: 'Datum & Zeit', name: 'Aktuelle Uhrzeit (HH:mm:ss)' },
      PAGE: { category: 'Nummerierung', name: 'Aktuelle Seitenzahl' },
      NUMPAGES: { category: 'Nummerierung', name: 'Gesamtseitenzahl' },
      PAGE_OF_PAGES: { category: 'Nummerierung', name: 'Seite X von Y' },
      TITLE: { category: 'Dokument-Info', name: 'Dokumenttitel' },
      AUTHOR: { category: 'Dokument-Info', name: 'Dokumentautor' },
      WORDS: { category: 'Statistik', name: 'Wortanzahl' },
      HEADER_TEXT: { category: 'Seitenlayout', name: 'Kopfzeilentext' },
    },
  },
  'es-ES': {
    title: 'Insertar campo dinámico (Fields System)',
    closeDialog: 'Cerrar el diálogo de campo dinámico',
    fieldCode: 'Código del campo:',
    category: 'Categoría:',
    outputValue: 'Valor de salida:',
    cancel: 'Cancelar',
    insertFieldValue: 'Insertar valor del campo',
    fields: {
      DATE_DE: { category: 'Fecha y hora', name: 'Fecha actual (DD.MM.YYYY)' },
      DATE_ISO: { category: 'Fecha y hora', name: 'Fecha ISO (YYYY-MM-DD)' },
      TIME: { category: 'Fecha y hora', name: 'Hora actual (HH:mm:ss)' },
      PAGE: { category: 'Numeración', name: 'Número de página actual' },
      NUMPAGES: { category: 'Numeración', name: 'Número total de páginas' },
      PAGE_OF_PAGES: { category: 'Numeración', name: 'Página X de Y' },
      TITLE: { category: 'Información del documento', name: 'Título del documento' },
      AUTHOR: { category: 'Información del documento', name: 'Autor del documento' },
      WORDS: { category: 'Estadísticas', name: 'Recuento de palabras' },
      HEADER_TEXT: { category: 'Diseño de página', name: 'Texto del encabezado' },
    },
  },
  'it-IT': {
    title: 'Inserisci campo dinamico (Fields System)',
    closeDialog: 'Chiudi la finestra del campo dinamico',
    fieldCode: 'Codice campo:',
    category: 'Categoria:',
    outputValue: 'Valore prodotto:',
    cancel: 'Annulla',
    insertFieldValue: 'Inserisci valore del campo',
    fields: {
      DATE_DE: { category: 'Data e ora', name: 'Data corrente (DD.MM.YYYY)' },
      DATE_ISO: { category: 'Data e ora', name: 'Data ISO (YYYY-MM-DD)' },
      TIME: { category: 'Data e ora', name: 'Ora corrente (HH:mm:ss)' },
      PAGE: { category: 'Numerazione', name: 'Numero di pagina corrente' },
      NUMPAGES: { category: 'Numerazione', name: 'Numero totale di pagine' },
      PAGE_OF_PAGES: { category: 'Numerazione', name: 'Pagina X di Y' },
      TITLE: { category: 'Informazioni documento', name: 'Titolo del documento' },
      AUTHOR: { category: 'Informazioni documento', name: 'Autore del documento' },
      WORDS: { category: 'Statistiche', name: 'Conteggio parole' },
      HEADER_TEXT: { category: 'Layout pagina', name: 'Testo dell’intestazione' },
    },
  },
  'ja-JP': {
    title: '動的フィールドを挿入（Fields System）',
    closeDialog: '動的フィールドのダイアログを閉じる',
    fieldCode: 'フィールドコード：',
    category: 'カテゴリ：',
    outputValue: '出力値：',
    cancel: 'キャンセル',
    insertFieldValue: 'フィールド値を挿入',
    fields: {
      DATE_DE: { category: '日時', name: '現在の日付（DD.MM.YYYY）' },
      DATE_ISO: { category: '日時', name: 'ISO 日付（YYYY-MM-DD）' },
      TIME: { category: '日時', name: '現在の時刻（HH:mm:ss）' },
      PAGE: { category: 'ページ番号', name: '現在のページ番号' },
      NUMPAGES: { category: 'ページ番号', name: '総ページ数' },
      PAGE_OF_PAGES: { category: 'ページ番号', name: 'X / Y ページ' },
      TITLE: { category: '文書情報', name: '文書タイトル' },
      AUTHOR: { category: '文書情報', name: '文書の作成者' },
      WORDS: { category: '統計', name: '単語数' },
      HEADER_TEXT: { category: 'ページレイアウト', name: 'ヘッダーテキスト' },
    },
  },
  'ru-RU': {
    title: 'Вставить динамическое поле (Fields System)',
    closeDialog: 'Закрыть окно динамического поля',
    fieldCode: 'Код поля:',
    category: 'Категория:',
    outputValue: 'Результат:',
    cancel: 'Отмена',
    insertFieldValue: 'Вставить значение поля',
    fields: {
      DATE_DE: { category: 'Дата и время', name: 'Текущая дата (DD.MM.YYYY)' },
      DATE_ISO: { category: 'Дата и время', name: 'Дата ISO (YYYY-MM-DD)' },
      TIME: { category: 'Дата и время', name: 'Текущее время (HH:mm:ss)' },
      PAGE: { category: 'Нумерация', name: 'Номер текущей страницы' },
      NUMPAGES: { category: 'Нумерация', name: 'Всего страниц' },
      PAGE_OF_PAGES: { category: 'Нумерация', name: 'Страница X из Y' },
      TITLE: { category: 'Сведения о документе', name: 'Название документа' },
      AUTHOR: { category: 'Сведения о документе', name: 'Автор документа' },
      WORDS: { category: 'Статистика', name: 'Количество слов' },
      HEADER_TEXT: { category: 'Макет страницы', name: 'Текст верхнего колонтитула' },
    },
  },
  'zh-CN': {
    title: '插入动态字段（Fields System）',
    closeDialog: '关闭动态字段对话框',
    fieldCode: '字段代码：',
    category: '类别：',
    outputValue: '输出值：',
    cancel: '取消',
    insertFieldValue: '插入字段值',
    fields: {
      DATE_DE: { category: '日期和时间', name: '当前日期（DD.MM.YYYY）' },
      DATE_ISO: { category: '日期和时间', name: 'ISO 日期（YYYY-MM-DD）' },
      TIME: { category: '日期和时间', name: '当前时间（HH:mm:ss）' },
      PAGE: { category: '页码', name: '当前页码' },
      NUMPAGES: { category: '页码', name: '总页数' },
      PAGE_OF_PAGES: { category: '页码', name: '第 X 页，共 Y 页' },
      TITLE: { category: '文档信息', name: '文档标题' },
      AUTHOR: { category: '文档信息', name: '文档作者' },
      WORDS: { category: '统计', name: '字数' },
      HEADER_TEXT: { category: '页面布局', name: '页眉文本' },
    },
  },
};
