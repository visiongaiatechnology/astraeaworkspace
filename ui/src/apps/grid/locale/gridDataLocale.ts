// STATUS: PLATIN — seven-locale copy for Grid filtering, sorting, views, and range controls.
import type { GridFilterOperator, GridSortRule } from '../../../shared/contracts/grid/workspaceGrid';
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';

type PluralForms = Readonly<Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }>;

export type GridDataCopy = Readonly<{
  autoFilter: string;
  clear: string;
  column: string;
  condition: string;
  value: string;
  valueTwo: string;
  filterOperators: Readonly<Record<GridFilterOperator, string>>;
  caseSensitiveTextMatch: string;
  addFilter: string;
  deleteFilter: string;
  multiKeySort: string;
  ascending: string;
  descending: string;
  sortByValue: string;
  sortByCellColor: string;
  sortByFontColor: string;
  sortByConditionalIcon: string;
  customListPlaceholder: string;
  addSortLevel: string;
  deleteSortRule: string;
  moveSortLevelUp: string;
  moveSortLevelDown: string;
  sortRejected: string;
  advancedFilter: string;
  advancedFilterDescription: string;
  captureFiltersAsOrGroup: string;
  orGroup: string;
  uniqueRecordsOnly: string;
  deleteAdvancedFilterGroup: string;
  filterViews: string;
  filterViewPlaceholder: string;
  saveCurrentFilterView: string;
  normalView: string;
  deleteSavedView: string;
  dataValidationAndSlicers: string;
  validation: string;
  slicers: string;
  stopCirclingInvalid: string;
  circleInvalid: string;
  namedRanges: string;
  currentSelection: string;
  namedRangePlaceholder: string;
  nameRange: string;
  deleteNamedRange: string;
  fillSelectionFromActiveCell: string;
  sortLevelCount: (count: number) => string;
  conditionCount: (count: number) => string;
  validationRuleCount: (count: number) => string;
  slicerCount: (count: number) => string;
  /**
   * Copy of the column-header AutoFilter menu. It lives here — and not in a second catalogue — because this
   * is already the Grid filtering/sorting catalogue; two catalogues for one control would be the duplication
   * this codebase keeps removing. The blank-cell label is deliberately not duplicated here: it is
   * `GRID_ANALYSIS_COPY[locale].slicer.blanks`, which the sibling filter control already localises.
   */
  autoFilterMenu: Readonly<{
    title: (column: string) => string;
    searchPlaceholder: string;
    selectAll: string;
    /** Clears this column's rules outright — the only path for a rule the checkbox inverse cannot express. */
    resetColumn: (column: string) => string;
    /** Shown when the action is refused because the selection would become empty. */
    cannotHideAll: string;
    /** Shown while a column carries a rule the checkbox list cannot represent (e.g. `contains`). */
    hiddenByForeignFilter: (column: string) => string;
    valueCount: (shown: number, total: number) => string;
    selectedCount: (selected: number) => string;
    capped: (shown: number) => string;
  }>;
}>;

type GridDataLabels = Omit<GridDataCopy, 'sortLevelCount' | 'conditionCount' | 'validationRuleCount' | 'slicerCount'>;

function pluralWord(locale: WorkspaceLocale, count: number, forms: PluralForms): string {
  const category = new Intl.PluralRules(locale).select(count);
  return forms[category] ?? forms.other;
}

function countLabel(locale: WorkspaceLocale, count: number, forms: PluralForms): string {
  return `${count} ${pluralWord(locale, count, forms)}`;
}

function withCounts(locale: WorkspaceLocale, labels: GridDataLabels, forms: {
  sortLevel: PluralForms;
  condition: PluralForms;
  validationRule: PluralForms;
  slicer: PluralForms;
}): GridDataCopy {
  return {
    ...labels,
    sortLevelCount: (count) => `${count}/64 ${pluralWord(locale, count, forms.sortLevel)}`,
    conditionCount: (count) => countLabel(locale, count, forms.condition),
    validationRuleCount: (count) => countLabel(locale, count, forms.validationRule),
    slicerCount: (count) => countLabel(locale, count, forms.slicer),
  };
}

export const GRID_DATA_COPY: Readonly<Record<WorkspaceLocale, GridDataCopy>> = {
  'en-US': withCounts('en-US', {
    autoFilter: 'AutoFilter', clear: 'Clear', column: 'Column', condition: 'Condition', value: 'Value', valueTwo: 'Value 2',
    filterOperators: {
      contains: 'contains', 'not-contains': 'does not contain', 'starts-with': 'starts with', 'ends-with': 'ends with',
      equals: 'equals', 'not-equals': 'does not equal', 'greater-than': 'greater than', 'greater-than-or-equal': 'greater than or equal to',
      'less-than': 'less than', 'less-than-or-equal': 'less than or equal to', between: 'between', before: 'before date',
      after: 'after date', 'on-date': 'on date', empty: 'is empty', 'not-empty': 'is not empty',
    },
    caseSensitiveTextMatch: 'Case-sensitive text match', addFilter: 'Add filter', deleteFilter: 'Delete filter',
    multiKeySort: 'Multi-key sort', ascending: 'Ascending', descending: 'Descending', sortByValue: 'Value',
    sortByCellColor: 'Cell color', sortByFontColor: 'Font color', sortByConditionalIcon: 'Conditional icon',
    customListPlaceholder: 'Custom: High, Medium, Low', addSortLevel: 'Add level', deleteSortRule: 'Delete sort rule', moveSortLevelUp: 'Move sort level up', moveSortLevelDown: 'Move sort level down', sortRejected: 'Sort rejected',
    advancedFilter: 'Advanced filter', advancedFilterDescription: 'Each captured group uses AND; groups are combined with OR. The base filter rules are not changed.',
    captureFiltersAsOrGroup: 'Capture current filters as an OR group', orGroup: 'OR group', uniqueRecordsOnly: 'Unique records only', deleteAdvancedFilterGroup: 'Delete advanced filter group',
    filterViews: 'Filter views', filterViewPlaceholder: 'My filter view', saveCurrentFilterView: 'Save current filter view', normalView: 'Normal view', deleteSavedView: 'Delete saved view',
    dataValidationAndSlicers: 'Data validation & slicers', validation: 'Validation…', slicers: 'Slicers…',
    stopCirclingInvalid: 'Stop circling invalid data', circleInvalid: 'Circle invalid data',
    namedRanges: 'Named ranges', currentSelection: 'Current selection', namedRangePlaceholder: 'Revenue_Q1', nameRange: 'Name',
    deleteNamedRange: 'Delete named range', fillSelectionFromActiveCell: 'Fill selection from active cell',
    autoFilterMenu: {
      title: (column) => `AutoFilter in column ${column}`,
      searchPlaceholder: 'Search values',
      selectAll: 'Select all',
      resetColumn: (column) => `Remove the filter in column ${column}`,
      cannotHideAll: 'At least one value must stay selected. Use "Remove the filter" to show every row again.',
      hiddenByForeignFilter: (column) => `Column ${column} is filtered by a rule this list cannot show. Remove the filter to see every row.`,
      valueCount: (shown, total) => `${shown} of ${total} values shown`,
      selectedCount: (selected) => (selected === 1 ? '1 value selected' : `${selected} values selected`),
      capped: (shown) => `Showing the first ${shown} values — the column holds more.`,
    },
  }, { sortLevel: { one: 'level', other: 'levels' }, condition: { one: 'condition', other: 'conditions' }, validationRule: { one: 'validation rule', other: 'validation rules' }, slicer: { one: 'slicer', other: 'slicers' } }),
  'de-DE': withCounts('de-DE', {
    autoFilter: 'Automatischer Filter', clear: 'Leeren', column: 'Spalte', condition: 'Bedingung', value: 'Wert', valueTwo: 'Wert 2',
    filterOperators: {
      contains: 'enthält', 'not-contains': 'enthält nicht', 'starts-with': 'beginnt mit', 'ends-with': 'endet mit',
      equals: 'ist gleich', 'not-equals': 'ist ungleich', 'greater-than': 'größer als', 'greater-than-or-equal': 'größer oder gleich',
      'less-than': 'kleiner als', 'less-than-or-equal': 'kleiner oder gleich', between: 'zwischen', before: 'vor dem Datum',
      after: 'nach dem Datum', 'on-date': 'am Datum', empty: 'ist leer', 'not-empty': 'ist nicht leer',
    },
    caseSensitiveTextMatch: 'Groß-/Kleinschreibung beachten', addFilter: 'Filter hinzufügen', deleteFilter: 'Filter löschen',
    multiKeySort: 'Sortierung nach mehreren Kriterien', ascending: 'Aufsteigend', descending: 'Absteigend', sortByValue: 'Wert',
    sortByCellColor: 'Zellfarbe', sortByFontColor: 'Schriftfarbe', sortByConditionalIcon: 'Bedingtes Symbol',
    customListPlaceholder: 'Benutzerdefiniert: Hoch, Mittel, Niedrig', addSortLevel: 'Ebene hinzufügen', deleteSortRule: 'Sortierregel löschen', moveSortLevelUp: 'Sortierebene nach oben', moveSortLevelDown: 'Sortierebene nach unten', sortRejected: 'Sortierung abgelehnt',
    advancedFilter: 'Erweiterter Filter', advancedFilterDescription: 'Jede erfasste Gruppe verknüpft Bedingungen mit UND; die Gruppen werden mit ODER verknüpft. Die Basisfilter bleiben unverändert.',
    captureFiltersAsOrGroup: 'Aktuelle Filter als ODER-Gruppe übernehmen', orGroup: 'ODER-Gruppe', uniqueRecordsOnly: 'Nur eindeutige Datensätze', deleteAdvancedFilterGroup: 'Erweiterte Filtergruppe löschen',
    filterViews: 'Filteransichten', filterViewPlaceholder: 'Meine Filteransicht', saveCurrentFilterView: 'Aktuelle Filteransicht speichern', normalView: 'Normalansicht', deleteSavedView: 'Gespeicherte Ansicht löschen',
    dataValidationAndSlicers: 'Datenüberprüfung und Datenschnitte', validation: 'Überprüfung…', slicers: 'Datenschnitte…',
    stopCirclingInvalid: 'Markierung ungültiger Daten beenden', circleInvalid: 'Ungültige Daten markieren',
    namedRanges: 'Benannte Bereiche', currentSelection: 'Aktuelle Auswahl', namedRangePlaceholder: 'Umsatz_Q1', nameRange: 'Benennen',
    deleteNamedRange: 'Benannten Bereich löschen', fillSelectionFromActiveCell: 'Auswahl ab aktiver Zelle ausfüllen',
    autoFilterMenu: {
      title: (column) => `Automatischer Filter in Spalte ${column}`,
      searchPlaceholder: 'Werte suchen',
      selectAll: 'Alle auswählen',
      resetColumn: (column) => `Filter in Spalte ${column} entfernen`,
      cannotHideAll: 'Mindestens ein Wert muss ausgewählt bleiben. Nutze „Filter entfernen“, um wieder alle Zeilen zu zeigen.',
      hiddenByForeignFilter: (column) => `Spalte ${column} ist durch eine Regel gefiltert, die diese Liste nicht darstellen kann. Entferne den Filter, um alle Zeilen zu sehen.`,
      valueCount: (shown, total) => `${shown} von ${total} Werten sichtbar`,
      selectedCount: (selected) => (selected === 1 ? '1 Wert ausgewählt' : `${selected} Werte ausgewählt`),
      capped: (shown) => `Es werden die ersten ${shown} Werte angezeigt – die Spalte enthält mehr.`,
    },
  }, { sortLevel: { one: 'Ebene', other: 'Ebenen' }, condition: { one: 'Bedingung', other: 'Bedingungen' }, validationRule: { one: 'Validierungsregel', other: 'Validierungsregeln' }, slicer: { one: 'Datenschnitt', other: 'Datenschnitte' } }),
  'es-ES': withCounts('es-ES', {
    autoFilter: 'Autofiltro', clear: 'Borrar', column: 'Columna', condition: 'Condición', value: 'Valor', valueTwo: 'Valor 2',
    filterOperators: {
      contains: 'contiene', 'not-contains': 'no contiene', 'starts-with': 'empieza por', 'ends-with': 'termina en',
      equals: 'es igual a', 'not-equals': 'no es igual a', 'greater-than': 'mayor que', 'greater-than-or-equal': 'mayor o igual que',
      'less-than': 'menor que', 'less-than-or-equal': 'menor o igual que', between: 'entre', before: 'antes de la fecha',
      after: 'después de la fecha', 'on-date': 'en la fecha', empty: 'está vacío', 'not-empty': 'no está vacío',
    },
    caseSensitiveTextMatch: 'Distinguir mayúsculas y minúsculas', addFilter: 'Añadir filtro', deleteFilter: 'Eliminar filtro',
    multiKeySort: 'Ordenar por varios criterios', ascending: 'Ascendente', descending: 'Descendente', sortByValue: 'Valor',
    sortByCellColor: 'Color de celda', sortByFontColor: 'Color de fuente', sortByConditionalIcon: 'Icono condicional',
    customListPlaceholder: 'Personalizada: Alto, Medio, Bajo', addSortLevel: 'Añadir nivel', deleteSortRule: 'Eliminar regla de ordenación', moveSortLevelUp: 'Subir nivel de ordenación', moveSortLevelDown: 'Bajar nivel de ordenación', sortRejected: 'Ordenación rechazada',
    advancedFilter: 'Filtro avanzado', advancedFilterDescription: 'Cada grupo capturado combina condiciones con Y; los grupos se combinan con O. Las reglas base no cambian.',
    captureFiltersAsOrGroup: 'Capturar filtros actuales como grupo O', orGroup: 'Grupo O', uniqueRecordsOnly: 'Solo registros únicos', deleteAdvancedFilterGroup: 'Eliminar grupo de filtro avanzado',
    filterViews: 'Vistas de filtro', filterViewPlaceholder: 'Mi vista de filtro', saveCurrentFilterView: 'Guardar vista de filtro actual', normalView: 'Vista normal', deleteSavedView: 'Eliminar vista guardada',
    dataValidationAndSlicers: 'Validación de datos y segmentaciones', validation: 'Validación…', slicers: 'Segmentaciones…',
    stopCirclingInvalid: 'Dejar de marcar datos no válidos', circleInvalid: 'Marcar datos no válidos',
    namedRanges: 'Rangos con nombre', currentSelection: 'Selección actual', namedRangePlaceholder: 'Ingresos_T1', nameRange: 'Nombrar',
    deleteNamedRange: 'Eliminar rango con nombre', fillSelectionFromActiveCell: 'Rellenar selección desde la celda activa',
    autoFilterMenu: {
      title: (column) => `Autofiltro en la columna ${column}`,
      searchPlaceholder: 'Buscar valores',
      selectAll: 'Seleccionar todo',
      resetColumn: (column) => `Quitar el filtro de la columna ${column}`,
      cannotHideAll: 'Al menos un valor debe permanecer seleccionado. Usa "Quitar el filtro" para volver a mostrar todas las filas.',
      hiddenByForeignFilter: (column) => `La columna ${column} está filtrada por una regla que esta lista no puede mostrar. Quita el filtro para ver todas las filas.`,
      valueCount: (shown, total) => `${shown} de ${total} valores visibles`,
      selectedCount: (selected) => (selected === 1 ? '1 valor seleccionado' : `${selected} valores seleccionados`),
      capped: (shown) => `Se muestran los primeros ${shown} valores; la columna contiene más.`,
    },
  }, { sortLevel: { one: 'nivel', other: 'niveles' }, condition: { one: 'condición', other: 'condiciones' }, validationRule: { one: 'regla de validación', other: 'reglas de validación' }, slicer: { one: 'segmentación', other: 'segmentaciones' } }),
  'it-IT': withCounts('it-IT', {
    autoFilter: 'Filtro automatico', clear: 'Cancella', column: 'Colonna', condition: 'Condizione', value: 'Valore', valueTwo: 'Valore 2',
    filterOperators: {
      contains: 'contiene', 'not-contains': 'non contiene', 'starts-with': 'inizia con', 'ends-with': 'termina con',
      equals: 'è uguale a', 'not-equals': 'è diverso da', 'greater-than': 'maggiore di', 'greater-than-or-equal': 'maggiore o uguale a',
      'less-than': 'minore di', 'less-than-or-equal': 'minore o uguale a', between: 'compreso tra', before: 'prima della data',
      after: 'dopo la data', 'on-date': 'nella data', empty: 'è vuoto', 'not-empty': 'non è vuoto',
    },
    caseSensitiveTextMatch: 'Distingui maiuscole e minuscole', addFilter: 'Aggiungi filtro', deleteFilter: 'Elimina filtro',
    multiKeySort: 'Ordinamento per più criteri', ascending: 'Crescente', descending: 'Decrescente', sortByValue: 'Valore',
    sortByCellColor: 'Colore cella', sortByFontColor: 'Colore carattere', sortByConditionalIcon: 'Icona condizionale',
    customListPlaceholder: 'Personalizzata: Alta, Media, Bassa', addSortLevel: 'Aggiungi livello', deleteSortRule: 'Elimina regola di ordinamento', moveSortLevelUp: 'Sposta livello su', moveSortLevelDown: 'Sposta livello giù', sortRejected: 'Ordinamento rifiutato',
    advancedFilter: 'Filtro avanzato', advancedFilterDescription: 'Ogni gruppo acquisito combina le condizioni con E; i gruppi sono combinati con O. Le regole di base non cambiano.',
    captureFiltersAsOrGroup: 'Acquisisci i filtri attuali come gruppo O', orGroup: 'Gruppo O', uniqueRecordsOnly: 'Solo record univoci', deleteAdvancedFilterGroup: 'Elimina gruppo filtro avanzato',
    filterViews: 'Viste filtro', filterViewPlaceholder: 'La mia vista filtro', saveCurrentFilterView: 'Salva vista filtro attuale', normalView: 'Vista normale', deleteSavedView: 'Elimina vista salvata',
    dataValidationAndSlicers: 'Convalida dati e segmenti', validation: 'Convalida…', slicers: 'Segmenti…',
    stopCirclingInvalid: "Interrompi l'evidenziazione dei dati non validi", circleInvalid: 'Evidenzia dati non validi',
    namedRanges: 'Intervalli denominati', currentSelection: 'Selezione attuale', namedRangePlaceholder: 'Ricavi_T1', nameRange: 'Assegna nome',
    deleteNamedRange: 'Elimina intervallo denominato', fillSelectionFromActiveCell: 'Riempi selezione dalla cella attiva',
    autoFilterMenu: {
      title: (column) => `Filtro automatico nella colonna ${column}`,
      searchPlaceholder: 'Cerca valori',
      selectAll: 'Seleziona tutto',
      resetColumn: (column) => `Rimuovi il filtro nella colonna ${column}`,
      cannotHideAll: 'Almeno un valore deve restare selezionato. Usa "Rimuovi il filtro" per mostrare di nuovo tutte le righe.',
      hiddenByForeignFilter: (column) => `La colonna ${column} è filtrata da una regola che questo elenco non può mostrare. Rimuovi il filtro per vedere tutte le righe.`,
      valueCount: (shown, total) => `${shown} di ${total} valori visibili`,
      selectedCount: (selected) => (selected === 1 ? '1 valore selezionato' : `${selected} valori selezionati`),
      capped: (shown) => `Vengono mostrati i primi ${shown} valori: la colonna ne contiene altri.`,
    },
  }, { sortLevel: { one: 'livello', other: 'livelli' }, condition: { one: 'condizione', other: 'condizioni' }, validationRule: { one: 'regola di convalida', other: 'regole di convalida' }, slicer: { one: 'segmento', other: 'segmenti' } }),
  'ru-RU': withCounts('ru-RU', {
    autoFilter: 'Автофильтр', clear: 'Очистить', column: 'Столбец', condition: 'Условие', value: 'Значение', valueTwo: 'Значение 2',
    filterOperators: {
      contains: 'содержит', 'not-contains': 'не содержит', 'starts-with': 'начинается с', 'ends-with': 'заканчивается на',
      equals: 'равно', 'not-equals': 'не равно', 'greater-than': 'больше', 'greater-than-or-equal': 'больше или равно',
      'less-than': 'меньше', 'less-than-or-equal': 'меньше или равно', between: 'между', before: 'до даты',
      after: 'после даты', 'on-date': 'на дату', empty: 'пусто', 'not-empty': 'не пусто',
    },
    caseSensitiveTextMatch: 'Учитывать регистр', addFilter: 'Добавить фильтр', deleteFilter: 'Удалить фильтр',
    multiKeySort: 'Сортировка по нескольким ключам', ascending: 'По возрастанию', descending: 'По убыванию', sortByValue: 'Значение',
    sortByCellColor: 'Цвет ячейки', sortByFontColor: 'Цвет шрифта', sortByConditionalIcon: 'Условный значок',
    customListPlaceholder: 'Свой список: Высокий, Средний, Низкий', addSortLevel: 'Добавить уровень', deleteSortRule: 'Удалить правило сортировки', moveSortLevelUp: 'Переместить уровень вверх', moveSortLevelDown: 'Переместить уровень вниз', sortRejected: 'Сортировка отклонена',
    advancedFilter: 'Расширенный фильтр', advancedFilterDescription: 'Условия в каждой группе объединены через И; группы объединены через ИЛИ. Базовые правила фильтра не меняются.',
    captureFiltersAsOrGroup: 'Сохранить текущие фильтры как группу ИЛИ', orGroup: 'Группа ИЛИ', uniqueRecordsOnly: 'Только уникальные записи', deleteAdvancedFilterGroup: 'Удалить группу расширенного фильтра',
    filterViews: 'Представления фильтра', filterViewPlaceholder: 'Моё представление фильтра', saveCurrentFilterView: 'Сохранить текущее представление фильтра', normalView: 'Обычный вид', deleteSavedView: 'Удалить сохранённый вид',
    dataValidationAndSlicers: 'Проверка данных и срезы', validation: 'Проверка…', slicers: 'Срезы…',
    stopCirclingInvalid: 'Перестать выделять неверные данные', circleInvalid: 'Выделить неверные данные',
    namedRanges: 'Именованные диапазоны', currentSelection: 'Текущий выбор', namedRangePlaceholder: 'Доходы_К1', nameRange: 'Назвать',
    deleteNamedRange: 'Удалить именованный диапазон', fillSelectionFromActiveCell: 'Заполнить выбор от активной ячейки',
    autoFilterMenu: {
      title: (column) => `Автофильтр в столбце ${column}`,
      searchPlaceholder: 'Поиск значений',
      selectAll: 'Выбрать все',
      resetColumn: (column) => `Удалить фильтр в столбце ${column}`,
      cannotHideAll: 'Хотя бы одно значение должно остаться выбранным. Используйте «Удалить фильтр», чтобы снова показать все строки.',
      hiddenByForeignFilter: (column) => `Столбец ${column} фильтруется правилом, которое этот список не может показать. Удалите фильтр, чтобы увидеть все строки.`,
      valueCount: (shown, total) => `Показано ${shown} из ${total} значений`,
      selectedCount: (selected) => (selected === 1 ? 'Выбрано 1 значение' : `Выбрано значений: ${selected}`),
      capped: (shown) => `Показаны первые ${shown} значений — в столбце есть ещё.`,
    },
  }, { sortLevel: { one: 'уровень', few: 'уровня', many: 'уровней', other: 'уровня' }, condition: { one: 'условие', few: 'условия', many: 'условий', other: 'условия' }, validationRule: { one: 'правило проверки', few: 'правила проверки', many: 'правил проверки', other: 'правила проверки' }, slicer: { one: 'срез', few: 'среза', many: 'срезов', other: 'среза' } }),
  'ja-JP': withCounts('ja-JP', {
    autoFilter: 'オートフィルター', clear: 'クリア', column: '列', condition: '条件', value: '値', valueTwo: '値 2',
    filterOperators: {
      contains: '次を含む', 'not-contains': '次を含まない', 'starts-with': '次で始まる', 'ends-with': '次で終わる',
      equals: '次と等しい', 'not-equals': '次と等しくない', 'greater-than': '次より大きい', 'greater-than-or-equal': '次以上',
      'less-than': '次より小さい', 'less-than-or-equal': '次以下', between: '次の範囲内', before: '日付より前',
      after: '日付より後', 'on-date': '指定日', empty: '空白', 'not-empty': '空白以外',
    },
    caseSensitiveTextMatch: '大文字と小文字を区別', addFilter: 'フィルターを追加', deleteFilter: 'フィルターを削除',
    multiKeySort: '複数キーで並べ替え', ascending: '昇順', descending: '降順', sortByValue: '値',
    sortByCellColor: 'セルの色', sortByFontColor: 'フォントの色', sortByConditionalIcon: '条件付きアイコン',
    customListPlaceholder: 'カスタム: 高、中、低', addSortLevel: 'レベルを追加', deleteSortRule: '並べ替えルールを削除', moveSortLevelUp: '並べ替えレベルを上へ', moveSortLevelDown: '並べ替えレベルを下へ', sortRejected: '並べ替えが拒否されました',
    advancedFilter: '詳細フィルター', advancedFilterDescription: '各グループ内の条件はすべて満たす必要があり、グループはいずれかを満たせば一致します。基本のフィルター条件は変更されません。',
    captureFiltersAsOrGroup: '現在のフィルターを OR グループとして保存', orGroup: 'OR グループ', uniqueRecordsOnly: '重複しないレコードのみ', deleteAdvancedFilterGroup: '詳細フィルターグループを削除',
    filterViews: 'フィルタービュー', filterViewPlaceholder: 'マイ フィルタービュー', saveCurrentFilterView: '現在のフィルタービューを保存', normalView: '標準ビュー', deleteSavedView: '保存済みビューを削除',
    dataValidationAndSlicers: 'データの入力規則とスライサー', validation: '入力規則…', slicers: 'スライサー…',
    stopCirclingInvalid: '無効なデータの囲みを停止', circleInvalid: '無効なデータを囲む',
    namedRanges: '名前付き範囲', currentSelection: '現在の選択範囲', namedRangePlaceholder: '売上_Q1', nameRange: '名前を設定',
    deleteNamedRange: '名前付き範囲を削除', fillSelectionFromActiveCell: 'アクティブ セルから選択範囲を入力',
    autoFilterMenu: {
      title: (column) => `列 ${column} のオートフィルター`,
      searchPlaceholder: '値を検索',
      selectAll: 'すべて選択',
      resetColumn: (column) => `列 ${column} のフィルターを解除`,
      cannotHideAll: '少なくとも 1 つの値を選択したままにする必要があります。[フィルターを解除] で全行を再表示できます。',
      hiddenByForeignFilter: (column) => `列 ${column} はこの一覧に表示できないルールでフィルターされています。フィルターを解除すると全行が表示されます。`,
      valueCount: (shown, total) => `${total} 件中 ${shown} 件の値を表示`,
      selectedCount: (selected) => `${selected} 件の値を選択`,
      capped: (shown) => `最初の ${shown} 件の値のみ表示しています。列にはさらに値があります。`,
    },
  }, { sortLevel: { other: 'レベル' }, condition: { other: '条件' }, validationRule: { other: '入力規則' }, slicer: { other: 'スライサー' } }),
  'zh-CN': withCounts('zh-CN', {
    autoFilter: '自动筛选', clear: '清除', column: '列', condition: '条件', value: '值', valueTwo: '值 2',
    filterOperators: {
      contains: '包含', 'not-contains': '不包含', 'starts-with': '开头为', 'ends-with': '结尾为',
      equals: '等于', 'not-equals': '不等于', 'greater-than': '大于', 'greater-than-or-equal': '大于或等于',
      'less-than': '小于', 'less-than-or-equal': '小于或等于', between: '介于', before: '早于日期',
      after: '晚于日期', 'on-date': '日期为', empty: '为空', 'not-empty': '不为空',
    },
    caseSensitiveTextMatch: '区分大小写', addFilter: '添加筛选', deleteFilter: '删除筛选',
    multiKeySort: '多级排序', ascending: '升序', descending: '降序', sortByValue: '值',
    sortByCellColor: '单元格颜色', sortByFontColor: '字体颜色', sortByConditionalIcon: '条件图标',
    customListPlaceholder: '自定义：高、中、低', addSortLevel: '添加级别', deleteSortRule: '删除排序规则', moveSortLevelUp: '上移排序级别', moveSortLevelDown: '下移排序级别', sortRejected: '排序被拒绝',
    advancedFilter: '高级筛选', advancedFilterDescription: '每个组内的条件按“且”组合；各组按“或”组合。基础筛选规则不会更改。',
    captureFiltersAsOrGroup: '将当前筛选保存为 OR 组', orGroup: 'OR 组', uniqueRecordsOnly: '仅唯一记录', deleteAdvancedFilterGroup: '删除高级筛选组',
    filterViews: '筛选视图', filterViewPlaceholder: '我的筛选视图', saveCurrentFilterView: '保存当前筛选视图', normalView: '普通视图', deleteSavedView: '删除已保存视图',
    dataValidationAndSlicers: '数据验证和切片器', validation: '验证…', slicers: '切片器…',
    stopCirclingInvalid: '停止圈出无效数据', circleInvalid: '圈出无效数据',
    namedRanges: '命名范围', currentSelection: '当前选择', namedRangePlaceholder: '收入_Q1', nameRange: '命名',
    deleteNamedRange: '删除命名范围', fillSelectionFromActiveCell: '从活动单元格填充所选区域',
    autoFilterMenu: {
      title: (column) => `列 ${column} 的自动筛选`,
      searchPlaceholder: '搜索值',
      selectAll: '全选',
      resetColumn: (column) => `移除列 ${column} 的筛选`,
      cannotHideAll: '必须至少保留一个值处于选中状态。使用“移除筛选”可重新显示所有行。',
      hiddenByForeignFilter: (column) => `列 ${column} 由此列表无法显示的规则进行筛选。移除筛选即可查看所有行。`,
      valueCount: (shown, total) => `显示 ${total} 个值中的 ${shown} 个`,
      selectedCount: (selected) => `已选择 ${selected} 个值`,
      capped: (shown) => `仅显示前 ${shown} 个值——该列还有更多。`,
    },
  }, { sortLevel: { other: '级别' }, condition: { other: '个条件' }, validationRule: { other: '条验证规则' }, slicer: { other: '个切片器' } }),
};

export function gridDataCopy(locale: WorkspaceLocale): GridDataCopy {
  return GRID_DATA_COPY[locale];
}

export function gridSortByCopy(copy: GridDataCopy, sortBy: NonNullable<GridSortRule['sortBy']>): string {
  switch (sortBy) {
    case 'cell-color': return copy.sortByCellColor;
    case 'font-color': return copy.sortByFontColor;
    case 'icon': return copy.sortByConditionalIcon;
    case 'value': return copy.sortByValue;
  }
}
