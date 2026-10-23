// STATUS: GOLD — seven-locale copy for the Notes page find-and-replace panel.
import type { WorkspaceLocale } from '../../shell/localization/workspaceLocaleTypes';

const ENGLISH = {
  title: 'Find & Replace on Page', close: 'Close Notes Find Replace dialog', find: 'Find...', replaceWith: 'Replace with...',
  matchCase: 'Match Case', regularExpression: 'Regular Expression', previousMatch: 'Previous Match', nextMatch: 'Next Match',
  replace: 'Replace', replaceAll: 'Replace All',
} as const;

type NotesSearchKey = keyof typeof ENGLISH;
type NotesSearchCopy = Record<NotesSearchKey, string>;

export const NOTES_SEARCH_COPY: Readonly<Record<WorkspaceLocale, NotesSearchCopy>> = {
  'en-US': ENGLISH,
  'de-DE': { title: 'Auf dieser Seite suchen und ersetzen', close: 'Dialog „Suchen und Ersetzen“ schließen', find: 'Suchen …', replaceWith: 'Ersetzen durch …', matchCase: 'Groß-/Kleinschreibung beachten', regularExpression: 'Regulärer Ausdruck', previousMatch: 'Vorheriger Treffer', nextMatch: 'Nächster Treffer', replace: 'Ersetzen', replaceAll: 'Alle ersetzen' },
  'es-ES': { title: 'Buscar y reemplazar en la página', close: 'Cerrar el diálogo de búsqueda y reemplazo', find: 'Buscar…', replaceWith: 'Reemplazar por…', matchCase: 'Coincidir mayúsculas y minúsculas', regularExpression: 'Expresión regular', previousMatch: 'Coincidencia anterior', nextMatch: 'Coincidencia siguiente', replace: 'Reemplazar', replaceAll: 'Reemplazar todo' },
  'it-IT': { title: 'Trova e sostituisci nella pagina', close: 'Chiudi la finestra Trova e sostituisci', find: 'Trova…', replaceWith: 'Sostituisci con…', matchCase: 'Distingui maiuscole e minuscole', regularExpression: 'Espressione regolare', previousMatch: 'Risultato precedente', nextMatch: 'Risultato successivo', replace: 'Sostituisci', replaceAll: 'Sostituisci tutto' },
  'ja-JP': { title: 'ページ内を検索して置換', close: '検索と置換のダイアログを閉じる', find: '検索…', replaceWith: '置換後の文字列…', matchCase: '大文字と小文字を区別', regularExpression: '正規表現', previousMatch: '前の一致', nextMatch: '次の一致', replace: '置換', replaceAll: 'すべて置換' },
  'ru-RU': { title: 'Найти и заменить на странице', close: 'Закрыть окно поиска и замены', find: 'Найти…', replaceWith: 'Заменить на…', matchCase: 'Учитывать регистр', regularExpression: 'Регулярное выражение', previousMatch: 'Предыдущее совпадение', nextMatch: 'Следующее совпадение', replace: 'Заменить', replaceAll: 'Заменить все' },
  'zh-CN': { title: '在页面中查找和替换', close: '关闭查找和替换对话框', find: '查找…', replaceWith: '替换为…', matchCase: '区分大小写', regularExpression: '正则表达式', previousMatch: '上一个匹配项', nextMatch: '下一个匹配项', replace: '替换', replaceAll: '全部替换' },
};

export function notesSearchText(message: NotesSearchKey, locale: WorkspaceLocale): string {
  return NOTES_SEARCH_COPY[locale][message];
}
