// STATUS: PLATIN — typed, complete visible-copy catalog for Insight controls.
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import type { AggregationFunction, InsightKpiMeasure } from '../domain/types';

export interface InsightCopy {
  readonly productTitle: string;
  readonly workspaceLabel: string;
  readonly toolbarLabel: string;
  readonly undo: string;
  readonly redo: string;
  readonly zoomOut: string;
  readonly zoomIn: string;
  readonly bookmark: string;
  readonly refresh: string;
  readonly csv: string;
  readonly initialStatus: string;
  readonly querySuccess: (rows: number, elapsedMs: string) => string;
  /** Visible when the executor produced rows but some of them were rejected by the model shape. */
  readonly queryApplied: (rows: number, droppedRows: number) => string;
  readonly queryFailure: (code?: string) => string;
  /** Stands in for a value that does not exist (empty group, empty scope). Never a plausible 0. */
  readonly noDataValue: string;
  readonly emptyGroup: (rowLabel: string, colLabel: string) => string;
  readonly pivotUnavailable: (code: string) => string;
  readonly noRowsInScope: string;
  readonly pointsUnit: string;
  readonly comparisonLabel: (current: string, previous: string) => string;
  readonly kpiNoComparison: (reason: string) => string;
  readonly kpiStoredValue: string;
  readonly sampleDatasetNotice: (reason: string) => string;
  readonly legacyDatasetNotice: (reason: string) => string;
  /** Names the scope of the segment bar total, so the number is never carried by geometry alone. */
  readonly regionTotal: (total: string, regions: number) => string;
  readonly importLabel: string;
  readonly imported: (rows: number, skippedRows: number) => string;
  readonly importFailed: (code: string) => string;
  readonly importRefused: (reason: string) => string;
  readonly exportPdf: string;
  readonly exportXlsx: string;
  readonly exportedPdf: (lines: number) => string;
  readonly exportedXlsx: (rows: number) => string;
  readonly exportFailed: (code: string) => string;
  readonly provenanceTitle: string;
  readonly lineageSummary: (nodes: number, edges: number, unresolved: number) => string;
  readonly diagnosticsSummary: (count: number, codes: string) => string;
  readonly diagnosticsNone: string;
  readonly offlineSnapshot: (at: string, state: string) => string;
  readonly offlineNoSnapshot: string;
  readonly sourceStateLabel: (state: string) => string;
  readonly performanceLine: (count: number, totalMs: string, maxMs: string) => string;
  readonly performanceNone: string;
  readonly authoringTitle: string;
  readonly datasetNameLabel: string;
  readonly createDataset: string;
  readonly kpiTitleLabel: string;
  readonly kpiMeasureLabel: string;
  readonly measureLabel: (value: InsightKpiMeasure) => string;
  readonly createKpi: string;
  readonly noKpiCards: string;
  readonly authoringFailed: (code: string) => string;
  readonly datasetCreated: (name: string) => string;
  readonly kpiCreated: (title: string) => string;
  readonly passphraseLabel: string;
  readonly exportEncrypted: string;
  readonly exportedEncrypted: (bytes: number) => string;
  readonly reopenedIdentical: string;
  readonly reopenedDiffers: (difference: string) => string;
  readonly workspaceSourceLabel: string;
  readonly connectSource: string;
  readonly noWorkspaceSources: string;
  readonly sourceConnected: (title: string, rows: number) => string;
  readonly reportPages: string;
  readonly addPage: string;
  readonly pageNameLabel: string;
  readonly renamePage: string;
  readonly pageBack: string;
  readonly deleteVisual: string;
  readonly moveLeft: string;
  readonly moveRight: string;
  readonly moveUp: string;
  readonly moveDown: string;
  readonly resizeWider: string;
  readonly resizeTaller: string;
  readonly visualGallery: string;
  readonly visualKindLabel: string;
  readonly visualTitleLabel: string;
  readonly visualCategoryLabel: string;
  readonly visualValuesLabel: string;
  readonly visualAggregationLabel: string;
  readonly addVisual: string;
  readonly noVisuals: string;
  readonly reportActionFailed: (code: string) => string;
  readonly crossFilterAppliedOn: (field: string, value: string) => string;
  readonly slicers: string;
  readonly addSlicer: string;
  readonly slicerFieldLabel: string;
  readonly removeSlicer: string;
  readonly slicerOmitted: (count: number) => string;
  readonly drillDown: string;
  readonly drillUp: string;
  readonly filterByCategory: string;
  readonly kpiCardLabel: string;
  readonly updateKpi: string;
  readonly removeKpi: string;
  readonly moveKpiUp: string;
  readonly moveKpiDown: string;
  readonly kpiUpdated: (title: string) => string;
  readonly exportSvg: string;
  readonly sealSnapshot: string;
  readonly verifySnapshot: string;
  readonly snapshotSealed: (rows: number, bytes: number) => string;
  readonly snapshotVerified: (rows: number) => string;
  readonly snapshotFailed: (code: string) => string;
  readonly exported: string;
  /** Visible only after a refresh that really read the source; carries the read row count. */
  readonly refreshed: (rows: number) => string;
  /** Visible after a refresh attempt that did not read the source (no reachable local query path). */
  readonly refreshUnread: string;
  /** Visible after a refresh attempt whose read failed. */
  readonly refreshFailed: (code: string) => string;
  readonly network: string;
  readonly accessibilityFindings: string;
  readonly revenueByRegion: string;
  readonly clearFilter: string;
  readonly filterCleared: string;
  readonly filterToRegion: (region: string, share: number) => string;
  readonly crossFilterApplied: (region: string) => string;
  readonly kpiList: string;
  readonly kpiNoValue: (reason: string) => string;
  readonly dimensions: string;
  readonly rows: string;
  readonly columns: string;
  readonly measure: string;
  readonly function: string;
  readonly region: string;
  readonly product: string;
  readonly quarter: string;
  readonly revenue: string;
  readonly operatingCost: string;
  readonly activeUsers: string;
  readonly total: (aggregation: string) => string;
  readonly grandTotal: string;
  readonly queryPanel: string;
  readonly transformPipeline: string;
  readonly executeQuery: string;
  readonly queryDescription: string;
  readonly step: (number: number, type: string) => string;
  readonly removeStep: (number: number) => string;
  readonly filterColumn: (number: number) => string;
  readonly filterValue: (number: number) => string;
  readonly sortColumn: (number: number) => string;
  readonly sortDirection: (number: number) => string;
  readonly descending: string;
  readonly ascending: string;
  readonly filter: string;
  readonly sort: string;
  readonly aggregation: (value: AggregationFunction) => string;
  readonly noActivePage: string;
  readonly screenReaderSummary: (datasetName: string, pageName: string, visualCount: number, filterCount: number) => string;
}

const COPY: Readonly<Record<WorkspaceLocale, Omit<InsightCopy, 'aggregation' | 'measureLabel' | 'noActivePage' | 'screenReaderSummary'>>> = {
  'de-DE': {
    productTitle: 'Insight Analyse & BI', workspaceLabel: 'Astraea Insight Analyse-Arbeitsbereich', toolbarLabel: 'Insight-Berichtssteuerung', undo: 'Änderung rückgängig', redo: 'Änderung wiederholen', zoomOut: 'Verkleinern', zoomIn: 'Vergrößern', bookmark: 'Lesezeichen', refresh: 'Aktualisieren', csv: 'CSV', initialStatus: 'Arbeitsbereich geladen — Quelle noch nicht gelesen.', querySuccess: (rows, ms) => `Abfrage lokal ausgeführt: ${rows} Zeilen in ${ms} ms.`, exported: 'CSV aus dem lokalen Modell exportiert.', refreshed: rows => `Quelle gelesen: ${rows} Zeilen.`, refreshUnread: 'Zeitstempel aktualisiert — Quelle nicht gelesen', refreshFailed: code => `Zeitstempel aktualisiert — Quelle nicht gelesen (${code})`, network: 'Netzwerk', accessibilityFindings: 'Barrierefreiheitsbefunde', revenueByRegion: 'Umsatz nach Region · Segment zum Filtern auswählen', clearFilter: 'Filter löschen', filterCleared: 'Filter gelöscht.', filterToRegion: (region, share) => `Nach ${region} filtern: ${share} Prozent des Umsatzes`, crossFilterApplied: region => `Filter für ${region} auf Diagramm, Matrix und KPI-Karten angewendet.`, kpiList: 'Leistungskennzahlen', kpiNoValue: reason => `Kein Wert im aktuellen Bereich (${reason})`, dimensions: 'Dimensionen:', rows: 'Zeilen:', columns: 'Spalten:', measure: 'Kennzahl:', function: 'Funktion:', region: 'Region', product: 'Produkt', quarter: 'Quartal', revenue: 'Umsatz (USD)', operatingCost: 'Betriebskosten (USD)', activeUsers: 'Aktive Nutzer', total: aggregation => `Gesamt (${aggregation})`, grandTotal: 'Gesamtsumme', queryPanel: 'Abfrageumwandlungen', transformPipeline: 'Transformationsablauf', executeQuery: 'Abfrage lokal ausführen', queryDescription: 'Deklarative, versionierte und begrenzte lokale Umwandlungen. Keine Skriptausführung.', step: (number, type) => `Schritt ${number}: ${type}`, removeStep: number => `Schritt ${number} entfernen`, filterColumn: number => `Filterspalte ${number}`, filterValue: number => `Filterwert ${number}`, sortColumn: number => `Sortierspalte ${number}`, sortDirection: number => `Sortierrichtung ${number}`, descending: 'Absteigend', ascending: 'Aufsteigend', filter: 'Filter', sort: 'Sortieren',
    noDataValue: '–', emptyGroup: (row, col) => `Keine Zeilen für ${row} · ${col}`, pivotUnavailable: code => `Matrix nicht verfügbar (${code}).`, noRowsInScope: 'Keine Zeilen im aktuellen Bereich.',
    pointsUnit: 'Prozentpunkte', comparisonLabel: (current, previous) => `${current} gegenüber ${previous}`, kpiNoComparison: reason => `Kein Vergleichswert (${reason})`,
    kpiStoredValue: 'gespeicherter Wert, nicht berechnet', queryApplied: (rows, dropped) => `Abfrage angewendet: ${rows} Zeilen; ${dropped} Zeilen verworfen.`,
    queryFailure: code => code ? `Die Abfrage konnte nicht ausgeführt werden (${code}).` : 'Die Abfrage konnte nicht ausgeführt werden.',
    sampleDatasetNotice: reason => `Dokumentdaten nicht lesbar (${reason}) — angezeigt wird der lokale Beispieldatensatz, nicht Ihre Datei.`,
    legacyDatasetNotice: reason => `Älteres Dokumentformat übernommen (${reason}) — nicht lesbare Felder stammen aus der lokalen Vorlage.`,
    regionTotal: (total, regions) => `Gesamtdatensatz ${total} · ${regions} Regionen`,
    importLabel: 'CSV-, TSV- oder JSON-Datei importieren', imported: (rows, skipped) => `Importiert: ${rows} Zeilen; ${skipped} Zeilen übersprungen.`,
    importFailed: code => `Import fehlgeschlagen (${code}).`, importRefused: reason => `Import abgelehnt (${reason}).`,
    exportPdf: 'PDF', exportXlsx: 'XLSX', exportedPdf: lines => `PDF-Bericht exportiert (${lines} Datenzeilen).`,
    exportedXlsx: rows => `XLSX exportiert (${rows} Zeilen).`, exportFailed: code => `Export fehlgeschlagen (${code}).`,
    provenanceTitle: 'Herkunft des Berichts', lineageSummary: (nodes, edges, unresolved) => `Herkunft: ${nodes} Knoten, ${edges} Kanten, ${unresolved} unaufgelöst.`,
    diagnosticsSummary: (count, codes) => `Modellbefunde: ${count} (${codes}).`, diagnosticsNone: 'Modellbefunde: keine.',
    offlineSnapshot: (at, state) => `Offline — lokaler Snapshot ${at} (${state}).`, offlineNoSnapshot: 'Offline — kein lokaler Snapshot.', sourceStateLabel: state => `Quellzustand: ${state}`,
    performanceLine: (count, totalMs, maxMs) => `Gemessene Operationen: ${count}, ${totalMs} ms gesamt, ${maxMs} ms maximal.`, performanceNone: 'Noch keine gemessene Operation.',
    authoringTitle: 'Datensatz und KPI-Karten', datasetNameLabel: 'Datensatzname', createDataset: 'Leeren Datensatz anlegen',
    kpiTitleLabel: 'KPI-Titel', kpiMeasureLabel: 'Kennzahl', createKpi: 'KPI-Karte anlegen',
    noKpiCards: 'Noch keine KPI-Karte — oben eine anlegen.',
    workspaceSourceLabel: 'Arbeitsmappe als Quelle', connectSource: 'Arbeitsmappe anbinden', noWorkspaceSources: 'Keine lesbare Arbeitsmappe im Arbeitsbereich.',
    sourceConnected: (title, rows) => `Quelle "${title}" angebunden — ${rows} Zeilen gelesen.`,
    reportPages: 'Berichtsseiten', addPage: 'Seite hinzufügen', pageNameLabel: 'Seitenname', renamePage: 'Seite umbenennen', pageBack: 'Zurück',
    deleteVisual: 'Visualisierung entfernen', moveLeft: 'Nach links', moveRight: 'Nach rechts', moveUp: 'Nach oben', moveDown: 'Nach unten',
    resizeWider: 'Breiter', resizeTaller: 'Höher', visualGallery: 'Visualisierungsgalerie', visualKindLabel: 'Diagrammtyp', visualTitleLabel: 'Titel',
    visualCategoryLabel: 'Kategorie', visualValuesLabel: 'Werte', visualAggregationLabel: 'Aggregation', addVisual: 'Visualisierung hinzufügen',
    noVisuals: 'Noch keine Visualisierung auf dieser Seite.', reportActionFailed: code => `Berichtsaktion abgelehnt (${code}).`,
    crossFilterAppliedOn: (field, value) => `Filter ${field} = ${value} auf Diagramm, Matrix und KPI-Karten angewendet.`,
    slicers: 'Slicer', addSlicer: 'Slicer hinzufügen', slicerFieldLabel: 'Slicer-Feld', removeSlicer: 'Slicer entfernen',
    slicerOmitted: count => `${count} weitere Werte werden nicht angezeigt.`, drillDown: 'Eine Ebene tiefer', drillUp: 'Eine Ebene höher', filterByCategory: 'Nach Kategorie filtern', authoringFailed: code => `Die Aktion wurde abgelehnt (${code}).`, datasetCreated: name => `Leerer Datensatz "${name}" angelegt.`, kpiCreated: title => `KPI-Karte "${title}" angelegt.`,
    kpiCardLabel: 'KPI-Karte', updateKpi: 'Karte übernehmen', removeKpi: 'Karte entfernen', moveKpiUp: 'Karte nach links', moveKpiDown: 'Karte nach rechts', kpiUpdated: title => `KPI-Karte "${title}" aktualisiert.`, exportSvg: 'SVG',
    sealSnapshot: 'Offline-Snapshot versiegeln', verifySnapshot: 'Snapshot prüfen', snapshotSealed: (rows, bytes) => `Offline-Snapshot versiegelt: ${rows} Zeilen, ${bytes} Byte.`,
    snapshotVerified: rows => `Snapshot geprüft: ${rows} Zeilen entschlüsselt.`, snapshotFailed: code => `Snapshot-Aktion abgelehnt (${code}).`,
    passphraseLabel: 'Passphrase für die verschlüsselte Datei', exportEncrypted: 'Verschlüsselt (.vinsight)', exportedEncrypted: bytes => `Verschlüsselter Container exportiert (${bytes} Byte).`,
    reopenedIdentical: 'Verschlüsselte Datei geöffnet — Inhalt identisch mit dem gespeicherten Modell.', reopenedDiffers: difference => `Verschlüsselte Datei geöffnet — Unterschied im Feld ${difference}.`,
  },
  'en-US': {
    productTitle: 'Insight Analytics & BI', workspaceLabel: 'Astraea Insight analytics workspace', toolbarLabel: 'Insight report controls', undo: 'Undo Insight change', redo: 'Redo Insight change', zoomOut: 'Zoom out', zoomIn: 'Zoom in', bookmark: 'Bookmark', refresh: 'Refresh', csv: 'CSV', initialStatus: 'Workspace loaded — source not read yet.', querySuccess: (rows, ms) => `Query executed locally: ${rows} rows in ${ms} ms.`, exported: 'CSV exported from the local model.', refreshed: rows => `Source read: ${rows} rows.`, refreshUnread: 'Timestamp updated — source not read', refreshFailed: code => `Timestamp updated — source not read (${code})`, network: 'Network', accessibilityFindings: 'Accessibility findings', revenueByRegion: 'Revenue by region · select a segment to filter', clearFilter: 'Clear filter', filterCleared: 'Filter cleared.', filterToRegion: (region, share) => `Filter to ${region}: ${share} percent of revenue`, crossFilterApplied: region => `Cross-filter ${region} applied across chart, matrix and KPI cards.`, kpiList: 'Key performance indicators', kpiNoValue: reason => `No value in the current scope (${reason})`, dimensions: 'Dimensions:', rows: 'Rows:', columns: 'Columns:', measure: 'Measure:', function: 'Function:', region: 'Region', product: 'Product', quarter: 'Quarter', revenue: 'Revenue (USD)', operatingCost: 'Operating cost (USD)', activeUsers: 'Active users', total: aggregation => `Total (${aggregation})`, grandTotal: 'Grand total', queryPanel: 'Query transformation panel', transformPipeline: 'Transform pipeline', executeQuery: 'Execute query locally', queryDescription: 'Declarative, versioned and bounded local transformations. No script execution.', step: (number, type) => `Step ${number}: ${type}`, removeStep: number => `Remove step ${number}`, filterColumn: number => `Filter column ${number}`, filterValue: number => `Filter value ${number}`, sortColumn: number => `Sort column ${number}`, sortDirection: number => `Sort direction ${number}`, descending: 'Descending', ascending: 'Ascending', filter: 'Filter', sort: 'Sort',
    noDataValue: '–', emptyGroup: (row, col) => `No rows for ${row} · ${col}`, pivotUnavailable: code => `Matrix unavailable (${code}).`, noRowsInScope: 'No rows in the current scope.',
    pointsUnit: 'percentage points', comparisonLabel: (current, previous) => `${current} vs ${previous}`, kpiNoComparison: reason => `No comparison value (${reason})`,
    kpiStoredValue: 'stored value, not computed', queryApplied: (rows, dropped) => `Query applied: ${rows} rows; ${dropped} rows rejected.`,
    queryFailure: code => code ? `The query could not be executed (${code}).` : 'The query could not be executed.',
    sampleDatasetNotice: reason => `Document data unreadable (${reason}) — showing the local sample dataset, not your file.`,
    legacyDatasetNotice: reason => `Legacy document format migrated (${reason}) — fields that could not be read come from the local template.`,
    regionTotal: (total, regions) => `Whole dataset ${total} · ${regions} regions`,
    importLabel: 'Import CSV, TSV or JSON file', imported: (rows, skipped) => `Imported ${rows} rows; ${skipped} rows skipped.`,
    importFailed: code => `Import failed (${code}).`, importRefused: reason => `Import refused (${reason}).`,
    exportPdf: 'PDF', exportXlsx: 'XLSX', exportedPdf: lines => `PDF report exported (${lines} data lines).`,
    exportedXlsx: rows => `XLSX exported (${rows} rows).`, exportFailed: code => `Export failed (${code}).`,
    provenanceTitle: 'Report provenance', lineageSummary: (nodes, edges, unresolved) => `Lineage: ${nodes} nodes, ${edges} edges, ${unresolved} unresolved.`,
    diagnosticsSummary: (count, codes) => `Model diagnostics: ${count} (${codes}).`, diagnosticsNone: 'Model diagnostics: none.',
    offlineSnapshot: (at, state) => `Offline — local snapshot ${at} (${state}).`, offlineNoSnapshot: 'Offline — no local snapshot.', sourceStateLabel: state => `Source state: ${state}`,
    performanceLine: (count, totalMs, maxMs) => `Measured operations: ${count}, ${totalMs} ms total, ${maxMs} ms max.`, performanceNone: 'No measured operation yet.',
    authoringTitle: 'Dataset and KPI cards', datasetNameLabel: 'Dataset name', createDataset: 'Create empty dataset',
    kpiTitleLabel: 'KPI title', kpiMeasureLabel: 'Measure', createKpi: 'Create KPI card',
    noKpiCards: 'No KPI card yet — create one above.',
    workspaceSourceLabel: 'Workbook source', connectSource: 'Connect workbook', noWorkspaceSources: 'No readable workbook in this workspace.',
    sourceConnected: (title, rows) => `Source "${title}" connected — ${rows} rows read.`,
    reportPages: 'Report pages', addPage: 'Add page', pageNameLabel: 'Page name', renamePage: 'Rename page', pageBack: 'Back',
    deleteVisual: 'Remove visual', moveLeft: 'Move left', moveRight: 'Move right', moveUp: 'Move up', moveDown: 'Move down',
    resizeWider: 'Wider', resizeTaller: 'Taller', visualGallery: 'Visual gallery', visualKindLabel: 'Chart type', visualTitleLabel: 'Title',
    visualCategoryLabel: 'Category', visualValuesLabel: 'Values', visualAggregationLabel: 'Aggregation', addVisual: 'Add visual',
    noVisuals: 'No visual on this page yet.', reportActionFailed: code => `Report action refused (${code}).`,
    crossFilterAppliedOn: (field, value) => `Filter ${field} = ${value} applied across chart, matrix and KPI cards.`,
    slicers: 'Slicers', addSlicer: 'Add slicer', slicerFieldLabel: 'Slicer field', removeSlicer: 'Remove slicer',
    slicerOmitted: count => `${count} further values not shown.`, drillDown: 'Drill down', drillUp: 'Drill up', filterByCategory: 'Filter by category', authoringFailed: code => `The action was refused (${code}).`, datasetCreated: name => `Empty dataset "${name}" created.`, kpiCreated: title => `KPI card "${title}" created.`,
    kpiCardLabel: 'KPI card', updateKpi: 'Apply card', removeKpi: 'Remove card', moveKpiUp: 'Move card left', moveKpiDown: 'Move card right', kpiUpdated: title => `KPI card "${title}" updated.`, exportSvg: 'SVG',
    sealSnapshot: 'Seal offline snapshot', verifySnapshot: 'Verify snapshot', snapshotSealed: (rows, bytes) => `Offline snapshot sealed: ${rows} rows, ${bytes} bytes.`,
    snapshotVerified: rows => `Snapshot verified: ${rows} rows decrypted.`, snapshotFailed: code => `Snapshot action refused (${code}).`,
    passphraseLabel: 'Passphrase for the encrypted file', exportEncrypted: 'Encrypted (.vinsight)', exportedEncrypted: bytes => `Encrypted container exported (${bytes} bytes).`,
    reopenedIdentical: 'Encrypted file opened — content identical to the saved model.', reopenedDiffers: difference => `Encrypted file opened — difference in field ${difference}.`,
  },
  'ru-RU': {
    productTitle: 'Аналитика и BI Insight', workspaceLabel: 'Рабочая область аналитики Astraea Insight', toolbarLabel: 'Управление отчётом Insight', undo: 'Отменить изменение Insight', redo: 'Повторить изменение Insight', zoomOut: 'Уменьшить масштаб', zoomIn: 'Увеличить масштаб', bookmark: 'Закладка', refresh: 'Обновить', csv: 'CSV', initialStatus: 'Рабочая область загружена — источник ещё не прочитан.', querySuccess: (rows, ms) => `Запрос выполнен локально: строк — ${rows}, время — ${ms} мс.`, exported: 'CSV экспортирован из локальной модели.', refreshed: rows => `Источник прочитан: строк — ${rows}.`, refreshUnread: 'Метка времени обновлена — источник не прочитан', refreshFailed: code => `Метка времени обновлена — источник не прочитан (${code})`, network: 'Сеть', accessibilityFindings: 'Замечания доступности', revenueByRegion: 'Выручка по регионам · выберите сегмент для фильтрации', clearFilter: 'Сбросить фильтр', filterCleared: 'Фильтр сброшен.', filterToRegion: (region, share) => `Фильтр по региону «${region}»: ${share}% выручки`, crossFilterApplied: region => `Фильтр «${region}» применён к диаграмме, матрице и карточкам KPI.`, kpiList: 'Ключевые показатели', kpiNoValue: reason => `Нет значения в текущей области (${reason})`, dimensions: 'Измерения:', rows: 'Строки:', columns: 'Столбцы:', measure: 'Показатель:', function: 'Функция:', region: 'Регион', product: 'Продукт', quarter: 'Квартал', revenue: 'Выручка (USD)', operatingCost: 'Операционные расходы (USD)', activeUsers: 'Активные пользователи', total: aggregation => `Итого (${aggregation})`, grandTotal: 'Общий итог', queryPanel: 'Преобразования запроса', transformPipeline: 'Цепочка преобразований', executeQuery: 'Выполнить запрос локально', queryDescription: 'Декларативные, версионируемые и ограниченные локальные преобразования. Без выполнения скриптов.', step: (number, type) => `Шаг ${number}: ${type}`, removeStep: number => `Удалить шаг ${number}`, filterColumn: number => `Столбец фильтра ${number}`, filterValue: number => `Значение фильтра ${number}`, sortColumn: number => `Столбец сортировки ${number}`, sortDirection: number => `Направление сортировки ${number}`, descending: 'По убыванию', ascending: 'По возрастанию', filter: 'Фильтр', sort: 'Сортировка',
    noDataValue: '–', emptyGroup: (row, col) => `Нет строк для ${row} · ${col}`, pivotUnavailable: code => `Матрица недоступна (${code}).`, noRowsInScope: 'Нет строк в текущей области.',
    pointsUnit: 'п. п.', comparisonLabel: (current, previous) => `${current} к ${previous}`, kpiNoComparison: reason => `Нет значения для сравнения (${reason})`,
    kpiStoredValue: 'сохранённое значение, не вычислено', queryApplied: (rows, dropped) => `Запрос применён: строк — ${rows}; отклонено — ${dropped}.`,
    queryFailure: code => code ? `Не удалось выполнить запрос (${code}).` : 'Не удалось выполнить запрос.',
    sampleDatasetNotice: reason => `Данные документа не читаются (${reason}) — показан локальный образец, а не ваш файл.`,
    legacyDatasetNotice: reason => `Перенесён старый формат документа (${reason}) — нечитаемые поля взяты из локального шаблона.`,
    regionTotal: (total, regions) => `Весь набор ${total} · регионов: ${regions}`,
    importLabel: 'Импорт файла CSV, TSV или JSON', imported: (rows, skipped) => `Импортировано строк: ${rows}; пропущено: ${skipped}.`,
    importFailed: code => `Импорт не удался (${code}).`, importRefused: reason => `Импорт отклонён (${reason}).`,
    exportPdf: 'PDF', exportXlsx: 'XLSX', exportedPdf: lines => `PDF-отчёт экспортирован (строк данных: ${lines}).`,
    exportedXlsx: rows => `XLSX экспортирован (строк: ${rows}).`, exportFailed: code => `Экспорт не удался (${code}).`,
    provenanceTitle: 'Происхождение отчёта', lineageSummary: (nodes, edges, unresolved) => `Происхождение: узлов — ${nodes}, связей — ${edges}, не разрешено — ${unresolved}.`,
    diagnosticsSummary: (count, codes) => `Замечания модели: ${count} (${codes}).`, diagnosticsNone: 'Замечания модели: нет.',
    offlineSnapshot: (at, state) => `Офлайн — локальный снимок ${at} (${state}).`, offlineNoSnapshot: 'Офлайн — локального снимка нет.', sourceStateLabel: state => `Состояние источника: ${state}`,
    performanceLine: (count, totalMs, maxMs) => `Измеренных операций: ${count}, всего ${totalMs} мс, максимум ${maxMs} мс.`, performanceNone: 'Измеренных операций пока нет.',
    authoringTitle: 'Набор данных и карточки KPI', datasetNameLabel: 'Имя набора', createDataset: 'Создать пустой набор',
    kpiTitleLabel: 'Заголовок KPI', kpiMeasureLabel: 'Показатель', createKpi: 'Создать карточку KPI',
    noKpiCards: 'Карточек KPI пока нет — создайте выше.',
    workspaceSourceLabel: 'Книга как источник', connectSource: 'Подключить книгу', noWorkspaceSources: 'В рабочей области нет читаемой книги.',
    sourceConnected: (title, rows) => `Источник "${title}" подключён — прочитано строк: ${rows}.`,
    reportPages: 'Страницы отчёта', addPage: 'Добавить страницу', pageNameLabel: 'Имя страницы', renamePage: 'Переименовать', pageBack: 'Назад',
    deleteVisual: 'Удалить визуализацию', moveLeft: 'Влево', moveRight: 'Вправо', moveUp: 'Вверх', moveDown: 'Вниз',
    resizeWider: 'Шире', resizeTaller: 'Выше', visualGallery: 'Галерея визуализаций', visualKindLabel: 'Тип диаграммы', visualTitleLabel: 'Заголовок',
    visualCategoryLabel: 'Категория', visualValuesLabel: 'Значения', visualAggregationLabel: 'Агрегация', addVisual: 'Добавить визуализацию',
    noVisuals: 'На этой странице пока нет визуализации.', reportActionFailed: code => `Действие отчёта отклонено (${code}).`,
    crossFilterAppliedOn: (field, value) => `Фильтр ${field} = ${value} применён к диаграмме, матрице и карточкам KPI.`,
    slicers: 'Срезы', addSlicer: 'Добавить срез', slicerFieldLabel: 'Поле среза', removeSlicer: 'Удалить срез',
    slicerOmitted: count => `Ещё ${count} значений не показано.`, drillDown: 'Уровень ниже', drillUp: 'Уровень выше', filterByCategory: 'Фильтр по категории', authoringFailed: code => `Действие отклонено (${code}).`, datasetCreated: name => `Создан пустой набор "${name}".`, kpiCreated: title => `Создана карточка KPI "${title}".`,
    kpiCardLabel: 'Карточка KPI', updateKpi: 'Применить карточку', removeKpi: 'Удалить карточку', moveKpiUp: 'Карточку влево', moveKpiDown: 'Карточку вправо', kpiUpdated: title => `Карточка KPI "${title}" обновлена.`, exportSvg: 'SVG',
    sealSnapshot: 'Запечатать офлайн-снимок', verifySnapshot: 'Проверить снимок', snapshotSealed: (rows, bytes) => `Офлайн-снимок запечатан: строк — ${rows}, байт — ${bytes}.`,
    snapshotVerified: rows => `Снимок проверен: расшифровано строк — ${rows}.`, snapshotFailed: code => `Действие со снимком отклонено (${code}).`,
    passphraseLabel: 'Пароль для зашифрованного файла', exportEncrypted: 'Зашифрованный (.vinsight)', exportedEncrypted: bytes => `Зашифрованный контейнер экспортирован (${bytes} байт).`,
    reopenedIdentical: 'Зашифрованный файл открыт — содержимое совпадает с сохранённой моделью.', reopenedDiffers: difference => `Зашифрованный файл открыт — различие в поле ${difference}.`,
  },
  'it-IT': {
    productTitle: 'Analisi e BI Insight', workspaceLabel: 'Area di analisi Astraea Insight', toolbarLabel: 'Controlli del report Insight', undo: 'Annulla modifica Insight', redo: 'Ripeti modifica Insight', zoomOut: 'Riduci zoom', zoomIn: 'Aumenta zoom', bookmark: 'Segnalibro', refresh: 'Aggiorna', csv: 'CSV', initialStatus: 'Area di lavoro caricata — origine non ancora letta.', querySuccess: (rows, ms) => `Query eseguita in locale: ${rows} righe in ${ms} ms.`, exported: 'CSV esportato dal modello locale.', refreshed: rows => `Origine letta: ${rows} righe.`, refreshUnread: 'Timestamp aggiornato — origine non letta', refreshFailed: code => `Timestamp aggiornato — origine non letta (${code})`, network: 'Rete', accessibilityFindings: 'Rilievi di accessibilità', revenueByRegion: 'Ricavi per area · seleziona un segmento per filtrare', clearFilter: 'Cancella filtro', filterCleared: 'Filtro cancellato.', filterToRegion: (region, share) => `Filtra per ${region}: ${share}% dei ricavi`, crossFilterApplied: region => `Filtro ${region} applicato a grafico, matrice e schede KPI.`, kpiList: 'Indicatori chiave di prestazione', kpiNoValue: reason => `Nessun valore nell'ambito corrente (${reason})`, dimensions: 'Dimensioni:', rows: 'Righe:', columns: 'Colonne:', measure: 'Misura:', function: 'Funzione:', region: 'Area', product: 'Prodotto', quarter: 'Trimestre', revenue: 'Ricavi (USD)', operatingCost: 'Costi operativi (USD)', activeUsers: 'Utenti attivi', total: aggregation => `Totale (${aggregation})`, grandTotal: 'Totale complessivo', queryPanel: 'Pannello di trasformazione query', transformPipeline: 'Flusso di trasformazione', executeQuery: 'Esegui query in locale', queryDescription: 'Trasformazioni locali dichiarative, versionate e limitate. Nessuna esecuzione di script.', step: (number, type) => `Passaggio ${number}: ${type}`, removeStep: number => `Rimuovi passaggio ${number}`, filterColumn: number => `Colonna filtro ${number}`, filterValue: number => `Valore filtro ${number}`, sortColumn: number => `Colonna ordinamento ${number}`, sortDirection: number => `Direzione ordinamento ${number}`, descending: 'Decrescente', ascending: 'Crescente', filter: 'Filtro', sort: 'Ordina',
    noDataValue: '–', emptyGroup: (row, col) => `Nessuna riga per ${row} · ${col}`, pivotUnavailable: code => `Matrice non disponibile (${code}).`, noRowsInScope: "Nessuna riga nell'ambito corrente.",
    pointsUnit: 'punti percentuali', comparisonLabel: (current, previous) => `${current} rispetto a ${previous}`, kpiNoComparison: reason => `Nessun valore di confronto (${reason})`,
    kpiStoredValue: 'valore memorizzato, non calcolato', queryApplied: (rows, dropped) => `Query applicata: ${rows} righe; ${dropped} righe scartate.`,
    queryFailure: code => code ? `Impossibile eseguire la query (${code}).` : 'Impossibile eseguire la query.',
    sampleDatasetNotice: reason => `Dati del documento illeggibili (${reason}) — è mostrato il campione locale, non il tuo file.`,
    legacyDatasetNotice: reason => `Formato documento precedente migrato (${reason}) — i campi non leggibili provengono dal modello locale.`,
    regionTotal: (total, regions) => `Intero set di dati ${total} · ${regions} aree`,
    importLabel: 'Importa file CSV, TSV o JSON', imported: (rows, skipped) => `Importate ${rows} righe; ${skipped} righe saltate.`,
    importFailed: code => `Importazione non riuscita (${code}).`, importRefused: reason => `Importazione rifiutata (${reason}).`,
    exportPdf: 'PDF', exportXlsx: 'XLSX', exportedPdf: lines => `Report PDF esportato (${lines} righe dati).`,
    exportedXlsx: rows => `XLSX esportato (${rows} righe).`, exportFailed: code => `Esportazione non riuscita (${code}).`,
    provenanceTitle: 'Provenienza del report', lineageSummary: (nodes, edges, unresolved) => `Provenienza: ${nodes} nodi, ${edges} archi, ${unresolved} irrisolti.`,
    diagnosticsSummary: (count, codes) => `Diagnostica modello: ${count} (${codes}).`, diagnosticsNone: 'Diagnostica modello: nessuna.',
    offlineSnapshot: (at, state) => `Offline — snapshot locale ${at} (${state}).`, offlineNoSnapshot: 'Offline — nessuno snapshot locale.', sourceStateLabel: state => `Stato origine: ${state}`,
    performanceLine: (count, totalMs, maxMs) => `Operazioni misurate: ${count}, ${totalMs} ms totali, ${maxMs} ms massimi.`, performanceNone: 'Nessuna operazione misurata.',
    authoringTitle: 'Set di dati e schede KPI', datasetNameLabel: 'Nome del set', createDataset: 'Crea set vuoto',
    kpiTitleLabel: 'Titolo KPI', kpiMeasureLabel: 'Misura', createKpi: 'Crea scheda KPI',
    noKpiCards: 'Nessuna scheda KPI — creane una sopra.',
    workspaceSourceLabel: 'Cartella come origine', connectSource: 'Collega cartella', noWorkspaceSources: 'Nessuna cartella leggibile in questa area di lavoro.',
    sourceConnected: (title, rows) => `Origine "${title}" collegata — ${rows} righe lette.`,
    reportPages: 'Pagine del report', addPage: 'Aggiungi pagina', pageNameLabel: 'Nome pagina', renamePage: 'Rinomina pagina', pageBack: 'Indietro',
    deleteVisual: 'Rimuovi visualizzazione', moveLeft: 'A sinistra', moveRight: 'A destra', moveUp: 'In alto', moveDown: 'In basso',
    resizeWider: 'Più largo', resizeTaller: 'Più alto', visualGallery: 'Galleria visualizzazioni', visualKindLabel: 'Tipo di grafico', visualTitleLabel: 'Titolo',
    visualCategoryLabel: 'Categoria', visualValuesLabel: 'Valori', visualAggregationLabel: 'Aggregazione', addVisual: 'Aggiungi visualizzazione',
    noVisuals: 'Nessuna visualizzazione su questa pagina.', reportActionFailed: code => `Azione del report rifiutata (${code}).`,
    crossFilterAppliedOn: (field, value) => `Filtro ${field} = ${value} applicato a grafico, matrice e schede KPI.`,
    slicers: 'Slicer', addSlicer: 'Aggiungi slicer', slicerFieldLabel: 'Campo slicer', removeSlicer: 'Rimuovi slicer',
    slicerOmitted: count => `Altri ${count} valori non mostrati.`, drillDown: 'Un livello sotto', drillUp: 'Un livello sopra', filterByCategory: 'Filtra per categoria', authoringFailed: code => `Azione rifiutata (${code}).`, datasetCreated: name => `Set vuoto "${name}" creato.`, kpiCreated: title => `Scheda KPI "${title}" creata.`,
    kpiCardLabel: 'Scheda KPI', updateKpi: 'Applica scheda', removeKpi: 'Rimuovi scheda', moveKpiUp: 'Scheda a sinistra', moveKpiDown: 'Scheda a destra', kpiUpdated: title => `Scheda KPI "${title}" aggiornata.`, exportSvg: 'SVG',
    sealSnapshot: 'Sigilla snapshot offline', verifySnapshot: 'Verifica snapshot', snapshotSealed: (rows, bytes) => `Snapshot offline sigillato: ${rows} righe, ${bytes} byte.`,
    snapshotVerified: rows => `Snapshot verificato: ${rows} righe decifrate.`, snapshotFailed: code => `Azione snapshot rifiutata (${code}).`,
    passphraseLabel: 'Passphrase per il file cifrato', exportEncrypted: 'Cifrato (.vinsight)', exportedEncrypted: bytes => `Contenitore cifrato esportato (${bytes} byte).`,
    reopenedIdentical: 'File cifrato aperto — contenuto identico al modello salvato.', reopenedDiffers: difference => `File cifrato aperto — differenza nel campo ${difference}.`,
  },
  'es-ES': {
    productTitle: 'Análisis y BI de Insight', workspaceLabel: 'Espacio de análisis de Astraea Insight', toolbarLabel: 'Controles del informe Insight', undo: 'Deshacer cambio de Insight', redo: 'Rehacer cambio de Insight', zoomOut: 'Alejar', zoomIn: 'Acercar', bookmark: 'Marcador', refresh: 'Actualizar', csv: 'CSV', initialStatus: 'Espacio de trabajo cargado — origen aún no leído.', querySuccess: (rows, ms) => `Consulta ejecutada localmente: ${rows} filas en ${ms} ms.`, exported: 'CSV exportado desde el modelo local.', refreshed: rows => `Origen leído: ${rows} filas.`, refreshUnread: 'Marca de tiempo actualizada — origen no leído', refreshFailed: code => `Marca de tiempo actualizada — origen no leído (${code})`, network: 'Red', accessibilityFindings: 'Hallazgos de accesibilidad', revenueByRegion: 'Ingresos por región · selecciona un segmento para filtrar', clearFilter: 'Borrar filtro', filterCleared: 'Filtro borrado.', filterToRegion: (region, share) => `Filtrar por ${region}: ${share}% de los ingresos`, crossFilterApplied: region => `Filtro de ${region} aplicado al gráfico, la matriz y las tarjetas KPI.`, kpiList: 'Indicadores clave de rendimiento', kpiNoValue: reason => `Sin valor en el ámbito actual (${reason})`, dimensions: 'Dimensiones:', rows: 'Filas:', columns: 'Columnas:', measure: 'Medida:', function: 'Función:', region: 'Región', product: 'Producto', quarter: 'Trimestre', revenue: 'Ingresos (USD)', operatingCost: 'Costes operativos (USD)', activeUsers: 'Usuarios activos', total: aggregation => `Total (${aggregation})`, grandTotal: 'Total general', queryPanel: 'Panel de transformación de consultas', transformPipeline: 'Flujo de transformaciones', executeQuery: 'Ejecutar consulta localmente', queryDescription: 'Transformaciones locales declarativas, versionadas y limitadas. No ejecuta scripts.', step: (number, type) => `Paso ${number}: ${type}`, removeStep: number => `Quitar paso ${number}`, filterColumn: number => `Columna de filtro ${number}`, filterValue: number => `Valor del filtro ${number}`, sortColumn: number => `Columna de ordenación ${number}`, sortDirection: number => `Sentido de ordenación ${number}`, descending: 'Descendente', ascending: 'Ascendente', filter: 'Filtro', sort: 'Ordenar',
    noDataValue: '–', emptyGroup: (row, col) => `Sin filas para ${row} · ${col}`, pivotUnavailable: code => `Matriz no disponible (${code}).`, noRowsInScope: 'Sin filas en el ámbito actual.',
    pointsUnit: 'puntos porcentuales', comparisonLabel: (current, previous) => `${current} frente a ${previous}`, kpiNoComparison: reason => `Sin valor de comparación (${reason})`,
    kpiStoredValue: 'valor almacenado, no calculado', queryApplied: (rows, dropped) => `Consulta aplicada: ${rows} filas; ${dropped} filas descartadas.`,
    queryFailure: code => code ? `No se pudo ejecutar la consulta (${code}).` : 'No se pudo ejecutar la consulta.',
    sampleDatasetNotice: reason => `Datos del documento ilegibles (${reason}) — se muestra la muestra local, no tu archivo.`,
    legacyDatasetNotice: reason => `Formato de documento anterior migrado (${reason}) — los campos ilegibles provienen de la plantilla local.`,
    regionTotal: (total, regions) => `Conjunto completo ${total} · ${regions} regiones`,
    importLabel: 'Importar archivo CSV, TSV o JSON', imported: (rows, skipped) => `Importadas ${rows} filas; ${skipped} filas omitidas.`,
    importFailed: code => `Importación fallida (${code}).`, importRefused: reason => `Importación rechazada (${reason}).`,
    exportPdf: 'PDF', exportXlsx: 'XLSX', exportedPdf: lines => `Informe PDF exportado (${lines} líneas de datos).`,
    exportedXlsx: rows => `XLSX exportado (${rows} filas).`, exportFailed: code => `Exportación fallida (${code}).`,
    provenanceTitle: 'Procedencia del informe', lineageSummary: (nodes, edges, unresolved) => `Procedencia: ${nodes} nodos, ${edges} aristas, ${unresolved} sin resolver.`,
    diagnosticsSummary: (count, codes) => `Diagnóstico del modelo: ${count} (${codes}).`, diagnosticsNone: 'Diagnóstico del modelo: ninguno.',
    offlineSnapshot: (at, state) => `Sin conexión — instantánea local ${at} (${state}).`, offlineNoSnapshot: 'Sin conexión — sin instantánea local.', sourceStateLabel: state => `Estado del origen: ${state}`,
    performanceLine: (count, totalMs, maxMs) => `Operaciones medidas: ${count}, ${totalMs} ms en total, ${maxMs} ms máximo.`, performanceNone: 'Aún no hay operaciones medidas.',
    authoringTitle: 'Conjunto de datos y tarjetas KPI', datasetNameLabel: 'Nombre del conjunto', createDataset: 'Crear conjunto vacío',
    kpiTitleLabel: 'Título del KPI', kpiMeasureLabel: 'Medida', createKpi: 'Crear tarjeta KPI',
    noKpiCards: 'Aún no hay tarjeta KPI: crea una arriba.',
    workspaceSourceLabel: 'Libro como origen', connectSource: 'Conectar libro', noWorkspaceSources: 'No hay ningún libro legible en este espacio de trabajo.',
    sourceConnected: (title, rows) => `Origen "${title}" conectado: ${rows} filas leídas.`,
    reportPages: 'Páginas del informe', addPage: 'Añadir página', pageNameLabel: 'Nombre de página', renamePage: 'Renombrar página', pageBack: 'Atrás',
    deleteVisual: 'Quitar visualización', moveLeft: 'Izquierda', moveRight: 'Derecha', moveUp: 'Arriba', moveDown: 'Abajo',
    resizeWider: 'Más ancho', resizeTaller: 'Más alto', visualGallery: 'Galería de visualizaciones', visualKindLabel: 'Tipo de gráfico', visualTitleLabel: 'Título',
    visualCategoryLabel: 'Categoría', visualValuesLabel: 'Valores', visualAggregationLabel: 'Agregación', addVisual: 'Añadir visualización',
    noVisuals: 'Aún no hay visualización en esta página.', reportActionFailed: code => `Acción del informe rechazada (${code}).`,
    crossFilterAppliedOn: (field, value) => `Filtro ${field} = ${value} aplicado al gráfico, la matriz y las tarjetas KPI.`,
    slicers: 'Segmentadores', addSlicer: 'Añadir segmentador', slicerFieldLabel: 'Campo del segmentador', removeSlicer: 'Quitar segmentador',
    slicerOmitted: count => `${count} valores más no mostrados.`, drillDown: 'Un nivel abajo', drillUp: 'Un nivel arriba', filterByCategory: 'Filtrar por categoría', authoringFailed: code => `Acción rechazada (${code}).`, datasetCreated: name => `Conjunto vacío "${name}" creado.`, kpiCreated: title => `Tarjeta KPI "${title}" creada.`,
    kpiCardLabel: 'Tarjeta KPI', updateKpi: 'Aplicar tarjeta', removeKpi: 'Quitar tarjeta', moveKpiUp: 'Tarjeta a la izquierda', moveKpiDown: 'Tarjeta a la derecha', kpiUpdated: title => `Tarjeta KPI "${title}" actualizada.`, exportSvg: 'SVG',
    sealSnapshot: 'Sellar instantánea sin conexión', verifySnapshot: 'Verificar instantánea', snapshotSealed: (rows, bytes) => `Instantánea sin conexión sellada: ${rows} filas, ${bytes} bytes.`,
    snapshotVerified: rows => `Instantánea verificada: ${rows} filas descifradas.`, snapshotFailed: code => `Acción de instantánea rechazada (${code}).`,
    passphraseLabel: 'Frase de contraseña del archivo cifrado', exportEncrypted: 'Cifrado (.vinsight)', exportedEncrypted: bytes => `Contenedor cifrado exportado (${bytes} bytes).`,
    reopenedIdentical: 'Archivo cifrado abierto: contenido idéntico al modelo guardado.', reopenedDiffers: difference => `Archivo cifrado abierto: diferencia en el campo ${difference}.`,
  },
  'ja-JP': {
    productTitle: 'Insight 分析と BI', workspaceLabel: 'Astraea Insight 分析ワークスペース', toolbarLabel: 'Insight レポート操作', undo: 'Insight の変更を元に戻す', redo: 'Insight の変更をやり直す', zoomOut: '縮小', zoomIn: '拡大', bookmark: 'ブックマーク', refresh: '更新', csv: 'CSV', initialStatus: 'ワークスペースを読み込みました — ソースは未読取です。', querySuccess: (rows, ms) => `クエリをローカルで実行しました: ${rows} 行、${ms} ミリ秒。`, exported: 'ローカルモデルから CSV をエクスポートしました。', refreshed: rows => `ソースを読み取りました: ${rows} 行。`, refreshUnread: 'タイムスタンプを更新 — ソースは未読取', refreshFailed: code => `タイムスタンプを更新 — ソースは未読取 (${code})`, network: 'ネットワーク', accessibilityFindings: 'アクセシビリティの指摘', revenueByRegion: '地域別売上 · セグメントを選択して絞り込み', clearFilter: 'フィルターを解除', filterCleared: 'フィルターを解除しました。', filterToRegion: (region, share) => `${region} で絞り込み: 売上の ${share}%`, crossFilterApplied: region => `${region} の絞り込みをグラフ、マトリックス、KPI カードに適用しました。`, kpiList: '主要業績評価指標', kpiNoValue: reason => `現在の範囲に値がありません (${reason})`, dimensions: 'ディメンション:', rows: '行:', columns: '列:', measure: '指標:', function: '集計:', region: '地域', product: '製品', quarter: '四半期', revenue: '売上 (USD)', operatingCost: '運営費 (USD)', activeUsers: 'アクティブユーザー', total: aggregation => `合計 (${aggregation})`, grandTotal: '総合計', queryPanel: 'クエリ変換パネル', transformPipeline: '変換パイプライン', executeQuery: 'クエリをローカルで実行', queryDescription: '宣言型、バージョン管理済み、上限付きのローカル変換です。スクリプトは実行しません。', step: (number, type) => `ステップ ${number}: ${type}`, removeStep: number => `ステップ ${number} を削除`, filterColumn: number => `フィルター列 ${number}`, filterValue: number => `フィルター値 ${number}`, sortColumn: number => `並べ替え列 ${number}`, sortDirection: number => `並べ替え方向 ${number}`, descending: '降順', ascending: '昇順', filter: 'フィルター', sort: '並べ替え',
    noDataValue: '–', emptyGroup: (row, col) => `${row} · ${col} の行がありません`, pivotUnavailable: code => `マトリックスを利用できません (${code})。`, noRowsInScope: '現在の範囲に行がありません。',
    pointsUnit: 'パーセントポイント', comparisonLabel: (current, previous) => `${previous} に対する ${current}`, kpiNoComparison: reason => `比較値がありません (${reason})`,
    kpiStoredValue: '保存値（未計算）', queryApplied: (rows, dropped) => `クエリを適用しました: ${rows} 行、除外 ${dropped} 行。`,
    queryFailure: code => code ? `クエリを実行できませんでした (${code})。` : 'クエリを実行できませんでした。',
    sampleDatasetNotice: reason => `ドキュメントのデータを読み取れません (${reason}) — ローカルのサンプルを表示中で、あなたのファイルではありません。`,
    legacyDatasetNotice: reason => `旧形式のドキュメントを移行しました (${reason}) — 読み取れない項目はローカルテンプレート由来です。`,
    regionTotal: (total, regions) => `データセット全体 ${total} · ${regions} 地域`,
    importLabel: 'CSV、TSV、JSON ファイルをインポート', imported: (rows, skipped) => `${rows} 行をインポート、${skipped} 行をスキップしました。`,
    importFailed: code => `インポートに失敗しました (${code})。`, importRefused: reason => `インポートを拒否しました (${reason})。`,
    exportPdf: 'PDF', exportXlsx: 'XLSX', exportedPdf: lines => `PDF レポートをエクスポートしました（データ行 ${lines}）。`,
    exportedXlsx: rows => `XLSX をエクスポートしました（${rows} 行）。`, exportFailed: code => `エクスポートに失敗しました (${code})。`,
    provenanceTitle: 'レポートの由来', lineageSummary: (nodes, edges, unresolved) => `由来: ノード ${nodes}、エッジ ${edges}、未解決 ${unresolved}。`,
    diagnosticsSummary: (count, codes) => `モデル診断: ${count} (${codes})。`, diagnosticsNone: 'モデル診断: なし。',
    offlineSnapshot: (at, state) => `オフライン — ローカルスナップショット ${at} (${state})。`, offlineNoSnapshot: 'オフライン — ローカルスナップショットなし。', sourceStateLabel: state => `ソース状態: ${state}`,
    performanceLine: (count, totalMs, maxMs) => `計測された操作: ${count}、合計 ${totalMs} ms、最大 ${maxMs} ms。`, performanceNone: '計測された操作はまだありません。',
    authoringTitle: 'データセットと KPI カード', datasetNameLabel: 'データセット名', createDataset: '空のデータセットを作成',
    kpiTitleLabel: 'KPI タイトル', kpiMeasureLabel: '指標', createKpi: 'KPI カードを作成',
    noKpiCards: 'KPI カードはまだありません — 上で作成してください。',
    workspaceSourceLabel: 'ブックをソースとして', connectSource: 'ブックを接続', noWorkspaceSources: 'このワークスペースに読み取り可能なブックがありません。',
    sourceConnected: (title, rows) => `ソース「${title}」を接続しました — ${rows} 行を読み取りました。`,
    reportPages: 'レポートページ', addPage: 'ページを追加', pageNameLabel: 'ページ名', renamePage: 'ページ名を変更', pageBack: '戻る',
    deleteVisual: 'ビジュアルを削除', moveLeft: '左へ', moveRight: '右へ', moveUp: '上へ', moveDown: '下へ',
    resizeWider: '幅を広げる', resizeTaller: '高さを増やす', visualGallery: 'ビジュアルギャラリー', visualKindLabel: 'グラフの種類', visualTitleLabel: 'タイトル',
    visualCategoryLabel: 'カテゴリ', visualValuesLabel: '値', visualAggregationLabel: '集計', addVisual: 'ビジュアルを追加',
    noVisuals: 'このページにはまだビジュアルがありません。', reportActionFailed: code => `レポート操作は拒否されました (${code})。`,
    crossFilterAppliedOn: (field, value) => `フィルター ${field} = ${value} をグラフ、マトリックス、KPI カードに適用しました。`,
    slicers: 'スライサー', addSlicer: 'スライサーを追加', slicerFieldLabel: 'スライサー項目', removeSlicer: 'スライサーを削除',
    slicerOmitted: count => `他 ${count} 件の値は表示されていません。`, drillDown: 'ドリルダウン', drillUp: 'ドリルアップ', filterByCategory: 'カテゴリで絞り込み', authoringFailed: code => `操作は拒否されました (${code})。`, datasetCreated: name => `空のデータセット「${name}」を作成しました。`, kpiCreated: title => `KPI カード「${title}」を作成しました。`,
    kpiCardLabel: 'KPI カード', updateKpi: 'カードを適用', removeKpi: 'カードを削除', moveKpiUp: 'カードを左へ', moveKpiDown: 'カードを右へ', kpiUpdated: title => `KPI カード「${title}」を更新しました。`, exportSvg: 'SVG',
    sealSnapshot: 'オフラインスナップショットを封印', verifySnapshot: 'スナップショットを検証', snapshotSealed: (rows, bytes) => `オフラインスナップショットを封印しました: ${rows} 行、${bytes} バイト。`,
    snapshotVerified: rows => `スナップショットを検証しました: ${rows} 行を復号。`, snapshotFailed: code => `スナップショット操作は拒否されました (${code})。`,
    passphraseLabel: '暗号化ファイルのパスフレーズ', exportEncrypted: '暗号化 (.vinsight)', exportedEncrypted: bytes => `暗号化コンテナをエクスポートしました（${bytes} バイト）。`,
    reopenedIdentical: '暗号化ファイルを開きました — 内容は保存済みモデルと同一です。', reopenedDiffers: difference => `暗号化ファイルを開きました — 項目 ${difference} に差異があります。`,
  },
  'zh-CN': {
    productTitle: 'Insight 分析与 BI', workspaceLabel: 'Astraea Insight 分析工作区', toolbarLabel: 'Insight 报告控件', undo: '撤销 Insight 更改', redo: '重做 Insight 更改', zoomOut: '缩小', zoomIn: '放大', bookmark: '书签', refresh: '刷新', csv: 'CSV', initialStatus: '工作区已加载 — 数据源尚未读取。', querySuccess: (rows, ms) => `已在本地执行查询：${rows} 行，用时 ${ms} 毫秒。`, exported: '已从本地模型导出 CSV。', refreshed: rows => `已读取数据源：${rows} 行。`, refreshUnread: '时间戳已更新 — 未读取数据源', refreshFailed: code => `时间戳已更新 — 未读取数据源 (${code})`, network: '网络', accessibilityFindings: '无障碍问题', revenueByRegion: '按区域显示收入 · 选择区段以筛选', clearFilter: '清除筛选', filterCleared: '已清除筛选。', filterToRegion: (region, share) => `筛选 ${region}：占收入的 ${share}%`, crossFilterApplied: region => `已将 ${region} 筛选应用于图表、矩阵和 KPI 卡片。`, kpiList: '关键绩效指标', kpiNoValue: reason => `当前范围内没有数值 (${reason})`, dimensions: '维度：', rows: '行：', columns: '列：', measure: '指标：', function: '函数：', region: '区域', product: '产品', quarter: '季度', revenue: '收入 (USD)', operatingCost: '运营成本 (USD)', activeUsers: '活跃用户', total: aggregation => `总计 (${aggregation})`, grandTotal: '总计', queryPanel: '查询转换面板', transformPipeline: '转换流程', executeQuery: '在本地执行查询', queryDescription: '声明式、带版本且有资源上限的本地转换，不执行脚本。', step: (number, type) => `步骤 ${number}：${type}`, removeStep: number => `删除步骤 ${number}`, filterColumn: number => `筛选列 ${number}`, filterValue: number => `筛选值 ${number}`, sortColumn: number => `排序列 ${number}`, sortDirection: number => `排序方向 ${number}`, descending: '降序', ascending: '升序', filter: '筛选', sort: '排序',
    noDataValue: '–', emptyGroup: (row, col) => `${row} · ${col} 无行`, pivotUnavailable: code => `矩阵不可用 (${code})。`, noRowsInScope: '当前范围内没有行。',
    pointsUnit: '个百分点', comparisonLabel: (current, previous) => `${current} 对比 ${previous}`, kpiNoComparison: reason => `没有可比数值 (${reason})`,
    kpiStoredValue: '存储值，未计算', queryApplied: (rows, dropped) => `已应用查询：${rows} 行；剔除 ${dropped} 行。`,
    queryFailure: code => code ? `无法执行查询 (${code})。` : '无法执行查询。',
    sampleDatasetNotice: reason => `文档数据无法读取 (${reason}) — 当前显示本地示例数据，而非你的文件。`,
    legacyDatasetNotice: reason => `已迁移旧版文档格式 (${reason}) — 无法读取的字段来自本地模板。`,
    regionTotal: (total, regions) => `整个数据集 ${total} · ${regions} 个区域`,
    importLabel: '导入 CSV、TSV 或 JSON 文件', imported: (rows, skipped) => `已导入 ${rows} 行；跳过 ${skipped} 行。`,
    importFailed: code => `导入失败 (${code})。`, importRefused: reason => `导入被拒绝 (${reason})。`,
    exportPdf: 'PDF', exportXlsx: 'XLSX', exportedPdf: lines => `已导出 PDF 报告（数据行 ${lines}）。`,
    exportedXlsx: rows => `已导出 XLSX（${rows} 行）。`, exportFailed: code => `导出失败 (${code})。`,
    provenanceTitle: '报告来源', lineageSummary: (nodes, edges, unresolved) => `来源：节点 ${nodes}、边 ${edges}、未解析 ${unresolved}。`,
    diagnosticsSummary: (count, codes) => `模型诊断：${count} (${codes})。`, diagnosticsNone: '模型诊断：无。',
    offlineSnapshot: (at, state) => `离线 — 本地快照 ${at} (${state})。`, offlineNoSnapshot: '离线 — 无本地快照。', sourceStateLabel: state => `数据源状态：${state}`,
    performanceLine: (count, totalMs, maxMs) => `已计量操作：${count}，合计 ${totalMs} ms，最大 ${maxMs} ms。`, performanceNone: '尚无已计量操作。',
    authoringTitle: '数据集与 KPI 卡片', datasetNameLabel: '数据集名称', createDataset: '创建空数据集',
    kpiTitleLabel: 'KPI 标题', kpiMeasureLabel: '指标', createKpi: '创建 KPI 卡片',
    noKpiCards: '尚无 KPI 卡片 — 请在上方创建。',
    workspaceSourceLabel: '工作簿数据源', connectSource: '连接工作簿', noWorkspaceSources: '此工作区中没有可读取的工作簿。',
    sourceConnected: (title, rows) => `已连接数据源“${title}” — 读取 ${rows} 行。`,
    reportPages: '报告页', addPage: '添加页面', pageNameLabel: '页面名称', renamePage: '重命名页面', pageBack: '返回',
    deleteVisual: '移除可视化', moveLeft: '左移', moveRight: '右移', moveUp: '上移', moveDown: '下移',
    resizeWider: '加宽', resizeTaller: '加高', visualGallery: '可视化库', visualKindLabel: '图表类型', visualTitleLabel: '标题',
    visualCategoryLabel: '类别', visualValuesLabel: '值', visualAggregationLabel: '聚合', addVisual: '添加可视化',
    noVisuals: '此页面尚无可视化。', reportActionFailed: code => `报告操作被拒绝 (${code})。`,
    crossFilterAppliedOn: (field, value) => `已将筛选 ${field} = ${value} 应用于图表、矩阵和 KPI 卡片。`,
    slicers: '切片器', addSlicer: '添加切片器', slicerFieldLabel: '切片器字段', removeSlicer: '移除切片器',
    slicerOmitted: count => `另有 ${count} 个值未显示。`, drillDown: '向下钻取', drillUp: '向上钻取', filterByCategory: '按类别筛选', authoringFailed: code => `操作被拒绝 (${code})。`, datasetCreated: name => `已创建空数据集“${name}”。`, kpiCreated: title => `已创建 KPI 卡片“${title}”。`,
    kpiCardLabel: 'KPI 卡片', updateKpi: '应用卡片', removeKpi: '移除卡片', moveKpiUp: '卡片左移', moveKpiDown: '卡片右移', kpiUpdated: title => `KPI 卡片“${title}”已更新。`, exportSvg: 'SVG',
    sealSnapshot: '封装离线快照', verifySnapshot: '验证快照', snapshotSealed: (rows, bytes) => `离线快照已封装：${rows} 行，${bytes} 字节。`,
    snapshotVerified: rows => `快照已验证：已解密 ${rows} 行。`, snapshotFailed: code => `快照操作被拒绝 (${code})。`,
    passphraseLabel: '加密文件的口令', exportEncrypted: '加密 (.vinsight)', exportedEncrypted: bytes => `已导出加密容器（${bytes} 字节）。`,
    reopenedIdentical: '已打开加密文件 — 内容与已保存模型一致。', reopenedDiffers: difference => `已打开加密文件 — 字段 ${difference} 存在差异。`,
  },
};

export function insightCopy(locale: WorkspaceLocale): InsightCopy {
  return {
    ...COPY[locale],
    aggregation: (value) => AGGREGATION_LABELS[locale][value],
    measureLabel: (value) => MEASURE_LABELS[locale][value],
    noActivePage: SCREEN_READER_COPY[locale].noActivePage,
    screenReaderSummary: SCREEN_READER_COPY[locale].summary,
  };
}

const MEASURE_LABELS: Readonly<Record<WorkspaceLocale, Readonly<Record<InsightKpiMeasure, string>>>> = {
  'de-DE': { revenue: 'Umsatz', margin: 'Bruttomarge', activeUsers: 'Aktive Nutzer', anomaly: 'Anomalierate' },
  'en-US': { revenue: 'Revenue', margin: 'Gross margin', activeUsers: 'Active users', anomaly: 'Anomaly rate' },
  'ru-RU': { revenue: 'Выручка', margin: 'Валовая маржа', activeUsers: 'Активные пользователи', anomaly: 'Доля аномалий' },
  'it-IT': { revenue: 'Ricavi', margin: 'Margine lordo', activeUsers: 'Utenti attivi', anomaly: 'Tasso di anomalie' },
  'es-ES': { revenue: 'Ingresos', margin: 'Margen bruto', activeUsers: 'Usuarios activos', anomaly: 'Tasa de anomalías' },
  'ja-JP': { revenue: '売上', margin: '粗利益率', activeUsers: 'アクティブユーザー', anomaly: '異常率' },
  'zh-CN': { revenue: '收入', margin: '毛利率', activeUsers: '活跃用户', anomaly: '异常率' },
};

const AGGREGATION_LABELS: Readonly<Record<WorkspaceLocale, Readonly<Record<AggregationFunction, string>>>> = {
  'de-DE': { SUM: 'Summe', COUNT: 'Anzahl', AVG: 'Mittelwert', MIN: 'Minimum', MAX: 'Maximum', COUNT_DISTINCT: 'Eindeutige zählen' },
  'en-US': { SUM: 'Sum', COUNT: 'Count', AVG: 'Average', MIN: 'Minimum', MAX: 'Maximum', COUNT_DISTINCT: 'Distinct count' },
  'ru-RU': { SUM: 'Сумма', COUNT: 'Количество', AVG: 'Среднее', MIN: 'Минимум', MAX: 'Максимум', COUNT_DISTINCT: 'Число уникальных' },
  'it-IT': { SUM: 'Somma', COUNT: 'Conteggio', AVG: 'Media', MIN: 'Minimo', MAX: 'Massimo', COUNT_DISTINCT: 'Conteggio distinti' },
  'es-ES': { SUM: 'Suma', COUNT: 'Recuento', AVG: 'Promedio', MIN: 'Mínimo', MAX: 'Máximo', COUNT_DISTINCT: 'Recuento distinto' },
  'ja-JP': { SUM: '合計', COUNT: '件数', AVG: '平均', MIN: '最小', MAX: '最大', COUNT_DISTINCT: '一意の件数' },
  'zh-CN': { SUM: '求和', COUNT: '计数', AVG: '平均值', MIN: '最小值', MAX: '最大值', COUNT_DISTINCT: '去重计数' },
};

const SCREEN_READER_COPY: Readonly<Record<WorkspaceLocale, { noActivePage: string; summary: InsightCopy['screenReaderSummary'] }>> = {
  'de-DE': { noActivePage: 'Der Insight-Bericht hat keine aktive Seite.', summary: (dataset, page, visuals, filters) => `${dataset}. Seite ${page}. ${visuals} sichtbare Visualisierungen, ${filters} aktive Filter.` },
  'en-US': { noActivePage: 'Insight report has no active page.', summary: (dataset, page, visuals, filters) => `${dataset}. Page ${page}. ${visuals} visible visuals, ${filters} active filters.` },
  'ru-RU': { noActivePage: 'В отчёте Insight нет активной страницы.', summary: (dataset, page, visuals, filters) => `${dataset}. Страница ${page}. Видимых визуализаций: ${visuals}, активных фильтров: ${filters}.` },
  'it-IT': { noActivePage: 'Il report Insight non ha una pagina attiva.', summary: (dataset, page, visuals, filters) => `${dataset}. Pagina ${page}. Visualizzazioni visibili: ${visuals}; filtri attivi: ${filters}.` },
  'es-ES': { noActivePage: 'El informe de Insight no tiene ninguna página activa.', summary: (dataset, page, visuals, filters) => `${dataset}. Página ${page}. ${visuals} visualizaciones visibles y ${filters} filtros activos.` },
  'ja-JP': { noActivePage: 'Insight レポートにアクティブなページがありません。', summary: (dataset, page, visuals, filters) => `${dataset}。ページ ${page}。表示中のビジュアル ${visuals} 件、適用中のフィルター ${filters} 件。` },
  'zh-CN': { noActivePage: 'Insight 报告没有活动页面。', summary: (dataset, page, visuals, filters) => `${dataset}。页面 ${page}。可见图表 ${visuals} 个，活动筛选器 ${filters} 个。` },
};

export function useInsightCopy(): InsightCopy {
  const { locale } = useWorkspaceLocale();
  return insightCopy(locale);
}
