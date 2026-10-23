// STATUS: PLATIN — localized Writer search controls and opaque UI failure copy.
import type { WorkspaceLocale } from '../../../../shell/localization/workspaceLocaleTypes';

type WriterSearchCopy = {
  searchPlaceholder: string;
  optionalSearchPlaceholder: string;
  searchFormat: string;
  searchPrompt: string;
  close: string;
  plain: string;
  wildcard: string;
  regex: string;
  matchCase: string;
  wholeWord: string;
  previousMatch: string;
  nextMatch: string;
  replace: string;
  replaceCurrent: string;
  replaceSelected: (count: number) => string;
  selectionHint: string;
  paragraphStyle: string;
  characterStyle: string;
  fontFamily: string;
  all: string;
  bold: string;
  italic: string;
  underline: string;
  reset: string;
  replacePlaceholder: string;
  replaceAll: (count: number) => string;
  matchCount: (current: number, total: number) => string;
  noMatches: string;
  searchError: string;
  replaceDone: string;
  replaceFailed: string;
};

export const WRITER_SEARCH_COPY: Readonly<Record<WorkspaceLocale, WriterSearchCopy>> = {
  'en-US': {
    searchPlaceholder: 'Search in document…', optionalSearchPlaceholder: 'Optional search text…', searchFormat: 'Search by format or style', searchPrompt: 'Enter text or choose a format or style filter.', close: 'Close search panel',
    plain: 'Text', wildcard: 'Wildcards', regex: 'Regex', matchCase: 'Match case', wholeWord: 'Whole word', previousMatch: 'Previous match', nextMatch: 'Next match', replace: 'Replace', replaceCurrent: 'Replace this', replaceSelected: (count) => `Replace selected (${count})`, selectionHint: 'Tick the matches to replace:',
    paragraphStyle: 'Paragraph style', characterStyle: 'Character style', fontFamily: 'Font family', all: 'All', bold: 'Bold', italic: 'Italic', underline: 'Underline', reset: 'Reset filters',
    replacePlaceholder: 'Replace with…', replaceAll: (count) => `Replace all (${count})`, matchCount: (current, total) => `${current} of ${total} matches`, searchError: 'Search could not be completed. Check the query or format filters.',
    noMatches: 'No matches', replaceDone: 'Replacement completed.', replaceFailed: 'Replacement could not be completed.',
  },
  'de-DE': {
    searchPlaceholder: 'Im Dokument suchen…', optionalSearchPlaceholder: 'Optionaler Suchtext…', searchFormat: 'Nach Format oder Stil suchen', searchPrompt: 'Suchtext eingeben oder einen Format- bzw. Stilfilter wählen.', close: 'Suchbereich schließen',
    plain: 'Text', wildcard: 'Platzhalter', regex: 'Regex', matchCase: 'Groß-/Kleinschreibung beachten', wholeWord: 'Ganzes Wort', previousMatch: 'Vorheriger Treffer', nextMatch: 'Nächster Treffer', replace: 'Ersetzen', replaceCurrent: 'Diesen ersetzen', replaceSelected: (count) => `Ausgewählte ersetzen (${count})`, selectionHint: 'Treffer zum Ersetzen ankreuzen:',
    paragraphStyle: 'Absatzformatvorlage', characterStyle: 'Zeichenformatvorlage', fontFamily: 'Schriftfamilie', all: 'Alle', bold: 'Fett', italic: 'Kursiv', underline: 'Unterstrichen', reset: 'Filter zurücksetzen',
    replacePlaceholder: 'Ersetzen durch…', replaceAll: (count) => `Alle ersetzen (${count})`, matchCount: (current, total) => `Treffer ${current} von ${total}`, searchError: 'Die Suche konnte nicht abgeschlossen werden. Prüfe Suchtext oder Formatfilter.',
    noMatches: 'Keine Treffer', replaceDone: 'Ersetzen abgeschlossen.', replaceFailed: 'Ersetzen konnte nicht abgeschlossen werden.',
  },
  'es-ES': {
    searchPlaceholder: 'Buscar en el documento…', optionalSearchPlaceholder: 'Texto de búsqueda opcional…', searchFormat: 'Buscar por formato o estilo', searchPrompt: 'Introduce texto o elige un filtro de formato o estilo.', close: 'Cerrar panel de búsqueda',
    plain: 'Texto', wildcard: 'Comodines', regex: 'Regex', matchCase: 'Distinguir mayúsculas', wholeWord: 'Palabra completa', previousMatch: 'Coincidencia anterior', nextMatch: 'Coincidencia siguiente', replace: 'Reemplazar', replaceCurrent: 'Reemplazar este', replaceSelected: (count) => `Reemplazar seleccionados (${count})`, selectionHint: 'Marca las coincidencias:',
    paragraphStyle: 'Estilo de párrafo', characterStyle: 'Estilo de carácter', fontFamily: 'Familia tipográfica', all: 'Todos', bold: 'Negrita', italic: 'Cursiva', underline: 'Subrayado', reset: 'Restablecer filtros',
    replacePlaceholder: 'Reemplazar por…', replaceAll: (count) => `Reemplazar todo (${count})`, matchCount: (current, total) => `${current} de ${total} coincidencias`, searchError: 'No se pudo completar la búsqueda. Comprueba la consulta o los filtros de formato.',
    noMatches: 'Sin coincidencias', replaceDone: 'Reemplazo completado.', replaceFailed: 'No se pudo completar el reemplazo.',
  },
  'it-IT': {
    searchPlaceholder: 'Cerca nel documento…', optionalSearchPlaceholder: 'Testo di ricerca facoltativo…', searchFormat: 'Cerca per formato o stile', searchPrompt: 'Inserisci il testo o scegli un filtro di formato o stile.', close: 'Chiudi il pannello di ricerca',
    plain: 'Testo', wildcard: 'Caratteri jolly', regex: 'Regex', matchCase: 'Maiuscole/minuscole', wholeWord: 'Parola intera', previousMatch: 'Corrispondenza precedente', nextMatch: 'Corrispondenza successiva', replace: 'Sostituisci', replaceCurrent: 'Sostituisci questo', replaceSelected: (count) => `Sostituisci selezionati (${count})`, selectionHint: 'Seleziona le corrispondenze:',
    paragraphStyle: 'Stile paragrafo', characterStyle: 'Stile carattere', fontFamily: 'Famiglia di caratteri', all: 'Tutti', bold: 'Grassetto', italic: 'Corsivo', underline: 'Sottolineato', reset: 'Reimposta filtri',
    replacePlaceholder: 'Sostituisci con…', replaceAll: (count) => `Sostituisci tutto (${count})`, matchCount: (current, total) => `${current} di ${total} corrispondenze`, searchError: 'Impossibile completare la ricerca. Controlla la query o i filtri di formato.',
    noMatches: 'Nessuna corrispondenza', replaceDone: 'Sostituzione completata.', replaceFailed: 'Impossibile completare la sostituzione.',
  },
  'ja-JP': {
    searchPlaceholder: '文書内を検索…', optionalSearchPlaceholder: '任意の検索文字列…', searchFormat: '書式またはスタイルで検索', searchPrompt: 'テキストを入力するか、書式またはスタイルのフィルターを選択してください。', close: '検索パネルを閉じる',
    plain: 'テキスト', wildcard: 'ワイルドカード', regex: '正規表現', matchCase: '大文字と小文字を区別', wholeWord: '単語全体', previousMatch: '前の一致', nextMatch: '次の一致', replace: '置換', replaceCurrent: 'これのみ置換', replaceSelected: (count) => `選択した ${count} 件を置換`, selectionHint: '置換する項目を選択:',
    paragraphStyle: '段落スタイル', characterStyle: '文字スタイル', fontFamily: 'フォントファミリー', all: 'すべて', bold: '太字', italic: '斜体', underline: '下線', reset: 'フィルターをリセット',
    replacePlaceholder: '置換後の文字列…', replaceAll: (count) => `すべて置換 (${count})`, matchCount: (current, total) => `${total} 件中 ${current} 件`, searchError: '検索を完了できませんでした。検索語または書式フィルターを確認してください。',
    noMatches: '一致する項目はありません', replaceDone: '置換が完了しました。', replaceFailed: '置換を完了できませんでした。',
  },
  'ru-RU': {
    searchPlaceholder: 'Найти в документе…', optionalSearchPlaceholder: 'Необязательный текст поиска…', searchFormat: 'Поиск по формату или стилю', searchPrompt: 'Введите текст или выберите фильтр формата или стиля.', close: 'Закрыть панель поиска',
    plain: 'Текст', wildcard: 'Подстановочные знаки', regex: 'Регулярное выражение', matchCase: 'Учитывать регистр', wholeWord: 'Слово целиком', previousMatch: 'Предыдущее совпадение', nextMatch: 'Следующее совпадение', replace: 'Заменить', replaceCurrent: 'Заменить этот', replaceSelected: (count) => `Заменить выбранные (${count})`, selectionHint: 'Отметьте совпадения:',
    paragraphStyle: 'Стиль абзаца', characterStyle: 'Стиль символов', fontFamily: 'Семейство шрифта', all: 'Все', bold: 'Полужирный', italic: 'Курсив', underline: 'Подчёркивание', reset: 'Сбросить фильтры',
    replacePlaceholder: 'Заменить на…', replaceAll: (count) => `Заменить все (${count})`, matchCount: (current, total) => `${current} из ${total} совпадений`, searchError: 'Не удалось выполнить поиск. Проверьте запрос или фильтры форматирования.',
    noMatches: 'Совпадений нет', replaceDone: 'Замена завершена.', replaceFailed: 'Не удалось завершить замену.',
  },
  'zh-CN': {
    searchPlaceholder: '在文档中搜索…', optionalSearchPlaceholder: '可选搜索文本…', searchFormat: '按格式或样式搜索', searchPrompt: '请输入文本或选择格式/样式筛选条件。', close: '关闭搜索面板',
    plain: '文本', wildcard: '通配符', regex: '正则表达式', matchCase: '区分大小写', wholeWord: '全字匹配', previousMatch: '上一个匹配项', nextMatch: '下一个匹配项', replace: '替换', replaceCurrent: '替换此项', replaceSelected: (count) => `替换所选 (${count})`, selectionHint: '勾选要替换的项：',
    paragraphStyle: '段落样式', characterStyle: '字符样式', fontFamily: '字体系列', all: '全部', bold: '粗体', italic: '斜体', underline: '下划线', reset: '重置筛选条件',
    replacePlaceholder: '替换为…', replaceAll: (count) => `全部替换 (${count})`, matchCount: (current, total) => `${total} 个匹配项中第 ${current} 个`, searchError: '无法完成搜索。请检查查询内容或格式筛选条件。',
    noMatches: '没有匹配项', replaceDone: '替换完成。', replaceFailed: '无法完成替换。',
  },
};

export function writerSearchCopy(locale: WorkspaceLocale): WriterSearchCopy {
  return WRITER_SEARCH_COPY[locale];
}
