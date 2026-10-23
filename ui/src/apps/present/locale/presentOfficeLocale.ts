// STATUS: PLATIN — seven-locale copy for Present productivity and rehearsal surfaces.
import type { PresentWorkspaceIntegrationKind } from '../../../shared/contracts/workspace';
import type { PresentSearchHit } from '../productivity/presentProductivity';
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';

type SearchField = PresentSearchHit['field'];
type Pacing = 'too_slow' | 'optimal' | 'too_fast';
type SourceKind = 'Grid' | 'Tasks' | 'Whiteboard' | 'Draw' | 'Writer' | 'PdfStudio' | 'Vault';

export interface PresentProductivityCopy {
  title: string; subtitle: string; close: string; searchReplace: string; findPlaceholder: string; replacementPlaceholder: string;
  replaceAll: string; caseSensitive: string; noMatches: string; searchSlide: (slide: number) => string;
  searchFields: Readonly<Record<SearchField, string>>; occurrencesReplaced: (count: number) => string;
  reusedSlides: (count: number, fileName: string) => string; duplicateGroups: (count: number) => string;
  duplicateSlideIndexes: (indexes: string) => string; reuseSlides: string; importDescription: string; chooseDeck: string;
  deckHygiene: string; removeUnusedMasters: string; removedMasters: (count: number) => string; noUnusedMasters: string;
  errors: Readonly<{ replace: string; cleanup: string; import: string }>;
}

export interface PresentSpeakerCoachCopy {
  title: string; close: string; score: string; speakingRate: string; fillersDetected: string; totalDuration: string;
  summaryHeading: string; summaryForScore: (score: number) => string; strengths: string; improvements: string;
  slideAnalysis: string; slide: (number: number) => string; selectSlide: (number: number, title: string) => string; actual: string; target: string; pace: string;
  pacing: Readonly<Record<Pacing, string>>; tipFast: string; tipSlow: string;
  tipTimeExceeded: (actual: number, target: number) => string; tipBrief: string; tipFillers: (count: number) => string;
  tipBalanced: string; strengthPace: (wpm: number) => string; strengthNoFillers: string; strengthFewFillers: string;
  strengthTiming: string; improveFast: (wpm: number) => string; improveSlow: (wpm: number) => string;
  improveFillers: (count: number, examples: string) => string; improveTiming: (count: number) => string;
  refresh: string; done: string; seconds: (value: number) => string;
  errors: Readonly<{ generic: string }>;
}

export interface PresentWorkspaceIntegrationCopy {
  sourceKinds: Readonly<Record<SourceKind, string>>;
  targetKinds: Readonly<Record<PresentWorkspaceIntegrationKind, string>>;
  range: string; kpi: string; taskList: string; taskKpi: string;
  snapshotMetrics: Readonly<{ document: string; version: string; paragraphs: string; range: string; values: string; sum: string; average: string }>;
  snapshotDetails: Readonly<{
    chart: string; integrity: string;
    integrityStates: Readonly<{ unverified: string; verified: string; mismatch: string; unavailable: string }>;
    role: string; linkedDocuments: (count: number) => string;
  }>;
  inspector: Readonly<{ workspaceProperties: string; workspaceReference: string; objectTitle: string; source: string; uri: string }>;
  gridRange: (sheetName: string, range: string) => string; gridRangeDescription: (range: string) => string;
  gridKpi: (sheetName: string) => string; gridKpiDescription: (range: string) => string;
  gridChartFallback: string; gridChartDescription: string; taskListDescription: string; taskKpiDescription: string;
  whiteboardFrameFallback: string; whiteboardFrameDescription: string; drawFrameFallback: string; drawFrameDescription: string;
  writerDocumentFallback: string; writerParagraphFallback: (paragraph: number) => string; writerSectionDescription: string;
  pdfPage: (page: number, title: string) => string; pdfPageDescription: string;
  vaultAssetFallback: string; vaultAssetDescription: (mimeType: string, sizeBytes: number) => string;
}

export interface PresentOfficeCopy {
  productivity: PresentProductivityCopy;
  speakerCoach: PresentSpeakerCoachCopy;
  workspaceIntegration: PresentWorkspaceIntegrationCopy;
}

export const PRESENT_OFFICE_COPY: Readonly<Record<WorkspaceLocale, PresentOfficeCopy>> = {
  'en-US': {
    productivity: {
      title: 'Views and productivity', subtitle: 'Search, replace, reuse slides, find duplicates, and clean up masters.', close: 'Close productivity tools',
      searchReplace: 'Search and replace', findPlaceholder: 'Find literal text…', replacementPlaceholder: 'Replace with…', replaceAll: 'Replace all', caseSensitive: 'Case-sensitive', noMatches: 'No matches.',
      searchSlide: (slide) => `Slide ${slide}`, searchFields: { title: 'Title', subtitle: 'Subtitle', speakerNotes: 'Speaker notes', bullet: 'Bullet', 'card-title': 'Card title', 'card-description': 'Card description', 'scene-text': 'Canvas text', 'table-cell': 'Table cell', 'chart-title': 'Chart title' },
      occurrencesReplaced: (count) => `${count} occurrence${count === 1 ? '' : 's'} replaced.`, reusedSlides: (count, fileName) => `Reused ${count} slide${count === 1 ? '' : 's'} from ${fileName}.`,
      duplicateGroups: (count) => `Duplicate groups: ${count}`, duplicateSlideIndexes: (indexes) => `Slides ${indexes}`, reuseSlides: 'Reuse slides',
      importDescription: 'Import a bounded PPTX or ODP package. Imported slides receive fresh technical IDs while keeping Morph identity.', chooseDeck: 'Choose PPTX or ODP',
      deckHygiene: 'Deck hygiene', removeUnusedMasters: 'Remove unused masters', removedMasters: (count) => `Removed ${count} unused master${count === 1 ? '' : 's'}.`, noUnusedMasters: 'No unused masters found.',
      errors: { replace: 'Text could not be replaced. Check the search and replacement values, then try again.', cleanup: 'Unused masters could not be removed. Try again.', import: 'The presentation could not be imported. Check that it is a supported PPTX or ODP file and try again.' },
    },
    speakerCoach: {
      title: 'Speaker coach analysis', close: 'Close speaker coach analysis', score: 'Overall score', speakingRate: 'Speaking rate (WPM)', fillersDetected: 'Fillers detected', totalDuration: 'Total duration',
      summaryHeading: 'Feedback summary', summaryForScore: (score) => score >= 85 ? 'Excellent rehearsal. The presentation is ready for a confident delivery.' : score >= 70 ? 'Solid rehearsal. Timing and filler words can still be refined.' : 'This rehearsal can improve. Focus on speaking pace and slide timing.',
      strengths: 'Strengths', improvements: 'Opportunities to improve', slideAnalysis: 'Slide-by-slide analysis', slide: (number) => `Slide ${number}`, selectSlide: (number, title) => `Select slide ${number}: ${title}`, actual: 'Actual', target: 'Target', pace: 'Pace',
      pacing: { too_slow: 'Slow', optimal: 'On target', too_fast: 'Fast' }, tipFast: 'Speaking pace is fast. Add deliberate pauses.', tipSlow: 'Speaking pace is slow. Increase vocal energy.',
      tipTimeExceeded: (actual, target) => `Slide exceeded its time target (${actual}s of ${target}s).`, tipBrief: 'This section is brief. Expand on its key points.', tipFillers: (count) => `Frequent filler words (${count}). Use more concise phrasing.`, tipBalanced: 'Good balance between pace and timing.',
      strengthPace: (wpm) => `Confident speaking pace (${wpm} words per minute).`, strengthNoFillers: 'Clear delivery without filler words.', strengthFewFillers: 'Controlled word choice with few filler words.', strengthTiming: 'All slides stayed close to their time targets.',
      improveFast: (wpm) => `Overall pace is high at ${wpm} WPM. Slow down for key messages.`, improveSlow: (wpm) => `Overall pace is low at ${wpm} WPM. Add more variation.`,
      improveFillers: (count, examples) => `Reduce filler words: ${count} detected${examples ? ` (for example: ${examples})` : ''}.`, improveTiming: (count) => `${count} slide${count === 1 ? '' : 's'} moved away from the planned timing.`,
      refresh: 'Recalculate', done: 'Done', seconds: (value) => `${value} s`, errors: { generic: 'Speaker coach analysis could not be completed. Try again.' },
    },
    workspaceIntegration: {
      sourceKinds: { Grid: 'Grid', Tasks: 'Tasks', Whiteboard: 'Whiteboard', Draw: 'Draw', Writer: 'Writer', PdfStudio: 'PDF Studio', Vault: 'Vault' },
      targetKinds: { 'grid-range': 'Grid range', 'grid-chart': 'Grid chart', 'grid-kpi': 'Grid KPI', 'project-timeline': 'Project timeline', 'task-list': 'Task list', 'task-kpi': 'Task metrics', 'project-milestone': 'Project milestone', 'database-table': 'Database table', 'database-chart': 'Database chart', 'whiteboard-frame': 'Workspace frame', 'writer-section': 'Writer section', 'pdf-page': 'PDF page', 'forms-dashboard': 'Forms dashboard', 'vault-asset': 'Vault asset', 'space-context': 'Workspace context' },
      range: 'Range', kpi: 'KPI', taskList: 'Task list', taskKpi: 'Task metrics', snapshotMetrics: { document: 'Document', version: 'Version', paragraphs: 'Paragraphs', range: 'Range', values: 'Values', sum: 'Sum', average: 'Average' }, snapshotDetails: { chart: 'Chart', integrity: 'Integrity', integrityStates: { unverified: 'unverified', verified: 'verified', mismatch: 'mismatch', unavailable: 'unavailable' }, role: 'Role', linkedDocuments: (count) => `${count} linked document${count === 1 ? '' : 's'}` }, inspector: { workspaceProperties: 'Workspace Properties', workspaceReference: 'Workspace Reference', objectTitle: 'Workspace object title', source: 'Source', uri: 'URI' }, gridRange: (sheet, range) => `${sheet} · ${range}`, gridRangeDescription: (range) => `Live table range ${range}`,
      gridKpi: (sheet) => `${sheet} · KPI`, gridKpiDescription: (range) => `Numeric KPI summary from ${range}`, gridChartFallback: 'Grid chart', gridChartDescription: 'Canonical Grid chart object',
      taskListDescription: 'Live task list from the canonical work model', taskKpiDescription: 'Live task completion, blocker, and overdue metrics', whiteboardFrameFallback: 'Whiteboard frame', whiteboardFrameDescription: 'Frame and bounded contained-object snapshot',
      drawFrameFallback: 'Draw frame', drawFrameDescription: 'Structured Draw frame and bounded contained-object snapshot', writerDocumentFallback: 'Writer document', writerParagraphFallback: (paragraph) => `Paragraph ${paragraph}`, writerSectionDescription: 'Writer section starting at this paragraph',
      pdfPage: (page, title) => title ? `Page ${page} · ${title}` : `Page ${page}`, pdfPageDescription: 'Canonical PDF Studio page preview', vaultAssetFallback: 'Vault asset', vaultAssetDescription: (mime, bytes) => `${mime} · ${bytes.toLocaleString('en-US')} bytes`,
    },
  },
  'de-DE': {
    productivity: {
      title: 'Ansichten und Produktivität', subtitle: 'Suchen, ersetzen, Folien wiederverwenden, Duplikate finden und Master bereinigen.', close: 'Produktivitätswerkzeuge schließen',
      searchReplace: 'Suchen und ersetzen', findPlaceholder: 'Exakten Text suchen…', replacementPlaceholder: 'Ersetzen durch…', replaceAll: 'Alle ersetzen', caseSensitive: 'Groß-/Kleinschreibung beachten', noMatches: 'Keine Treffer.',
      searchSlide: (slide) => `Folie ${slide}`, searchFields: { title: 'Titel', subtitle: 'Untertitel', speakerNotes: 'Sprechernotizen', bullet: 'Aufzählungspunkt', 'card-title': 'Kartentitel', 'card-description': 'Kartenbeschreibung', 'scene-text': 'Text auf der Folie', 'table-cell': 'Tabellenzelle', 'chart-title': 'Diagrammtitel' },
      occurrencesReplaced: (count) => `${count} Treffer ersetzt.`, reusedSlides: (count, fileName) => `${count} Folien aus ${fileName} wiederverwendet.`,
      duplicateGroups: (count) => `Duplikatgruppen: ${count}`, duplicateSlideIndexes: (indexes) => `Folien ${indexes}`, reuseSlides: 'Folien wiederverwenden',
      importDescription: 'Ein begrenztes PPTX- oder ODP-Paket importieren. Wiederverwendete Folien erhalten neue technische IDs und behalten ihre Morph-Identität.', chooseDeck: 'PPTX oder ODP auswählen',
      deckHygiene: 'Präsentation bereinigen', removeUnusedMasters: 'Unbenutzte Master entfernen', removedMasters: (count) => `${count} unbenutzte Master entfernt.`, noUnusedMasters: 'Keine unbenutzten Master gefunden.',
      errors: { replace: 'Der Text konnte nicht ersetzt werden. Prüfe Such- und Ersatztext und versuche es erneut.', cleanup: 'Unbenutzte Master konnten nicht entfernt werden. Versuche es erneut.', import: 'Die Präsentation konnte nicht importiert werden. Prüfe, ob es eine unterstützte PPTX- oder ODP-Datei ist, und versuche es erneut.' },
    },
    speakerCoach: {
      title: 'Analyse des Sprechtrainers', close: 'Analyse des Sprechtrainers schließen', score: 'Gesamtbewertung', speakingRate: 'Sprechtempo (WPM)', fillersDetected: 'Füllwörter erkannt', totalDuration: 'Gesamtdauer',
      summaryHeading: 'Zusammenfassung', summaryForScore: (score) => score >= 85 ? 'Sehr gute Probe. Die Präsentation ist bereit für einen überzeugenden Auftritt.' : score >= 70 ? 'Solide Probe. Timing und Füllwörter lassen sich noch verfeinern.' : 'Die Probe kann verbessert werden. Achte besonders auf Sprechtempo und Folienzeiten.',
      strengths: 'Stärken', improvements: 'Verbesserungspotenziale', slideAnalysis: 'Analyse nach Folien', slide: (number) => `Folie ${number}`, selectSlide: (number, title) => `Folie ${number} auswählen: ${title}`, actual: 'Ist', target: 'Soll', pace: 'Tempo',
      pacing: { too_slow: 'Langsam', optimal: 'Im Zielbereich', too_fast: 'Schnell' }, tipFast: 'Das Sprechtempo ist hoch. Setze gezielte Pausen.', tipSlow: 'Das Sprechtempo ist niedrig. Sprich dynamischer.',
      tipTimeExceeded: (actual, target) => `Die Folienzeit wurde überschritten (${actual}s statt ${target}s).`, tipBrief: 'Dieser Abschnitt ist knapp. Vertiefe die Kernpunkte.', tipFillers: (count) => `Viele Füllwörter (${count}). Formuliere prägnanter.`, tipBalanced: 'Gute Balance aus Tempo und Zeitmanagement.',
      strengthPace: (wpm) => `Souveränes Sprechtempo (${wpm} Wörter pro Minute).`, strengthNoFillers: 'Klare Artikulation ohne Füllwörter.', strengthFewFillers: 'Kontrollierte Wortwahl mit wenigen Füllwörtern.', strengthTiming: 'Alle Folien lagen nahe an ihren Zeitvorgaben.',
      improveFast: (wpm) => `Das Gesamttempo ist mit ${wpm} WPM hoch. Sprich bei Kernbotschaften langsamer.`, improveSlow: (wpm) => `Das Gesamttempo ist mit ${wpm} WPM niedrig. Variiere die Dynamik stärker.`,
      improveFillers: (count, examples) => `Füllwörter reduzieren: ${count} erkannt${examples ? ` (zum Beispiel: ${examples})` : ''}.`, improveTiming: (count) => `${count} Folie${count === 1 ? '' : 'n'} wich vom geplanten Timing ab.`,
      refresh: 'Neu berechnen', done: 'Fertig', seconds: (value) => `${value} s`, errors: { generic: 'Die Analyse des Sprechtrainers konnte nicht abgeschlossen werden. Versuche es erneut.' },
    },
    workspaceIntegration: {
      sourceKinds: { Grid: 'Tabellen', Tasks: 'Aufgaben', Whiteboard: 'Whiteboard', Draw: 'Zeichnen', Writer: 'Textverarbeitung', PdfStudio: 'PDF Studio', Vault: 'Tresor' },
      targetKinds: { 'grid-range': 'Tabellenbereich', 'grid-chart': 'Tabellendiagramm', 'grid-kpi': 'Tabellenkennzahl', 'project-timeline': 'Projektzeitachse', 'task-list': 'Aufgabenliste', 'task-kpi': 'Aufgabenmetriken', 'project-milestone': 'Projektmeilenstein', 'database-table': 'Datenbanktabelle', 'database-chart': 'Datenbankdiagramm', 'whiteboard-frame': 'Workspace-Rahmen', 'writer-section': 'Textabschnitt', 'pdf-page': 'PDF-Seite', 'forms-dashboard': 'Formularübersicht', 'vault-asset': 'Tresorobjekt', 'space-context': 'Workspace-Kontext' },
      range: 'Bereich', kpi: 'Kennzahl', taskList: 'Aufgabenliste', taskKpi: 'Aufgabenmetriken', snapshotMetrics: { document: 'Dokument', version: 'Version', paragraphs: 'Absätze', range: 'Bereich', values: 'Werte', sum: 'Summe', average: 'Durchschnitt' }, snapshotDetails: { chart: 'Diagramm', integrity: 'Integrität', integrityStates: { unverified: 'nicht verifiziert', verified: 'verifiziert', mismatch: 'Abweichung', unavailable: 'nicht verfügbar' }, role: 'Rolle', linkedDocuments: (count) => `${count} ${count === 1 ? 'verknüpftes Dokument' : 'verknüpfte Dokumente'}` }, inspector: { workspaceProperties: 'Workspace-Eigenschaften', workspaceReference: 'Workspace-Verweis', objectTitle: 'Titel des Workspace-Objekts', source: 'Quelle', uri: 'URI' }, gridRange: (sheet, range) => `${sheet} · ${range}`, gridRangeDescription: (range) => `Live-Tabellenbereich ${range}`,
      gridKpi: (sheet) => `${sheet} · Kennzahl`, gridKpiDescription: (range) => `Numerische Kennzahl für ${range}`, gridChartFallback: 'Tabellendiagramm', gridChartDescription: 'Kanonisches Tabellen-Diagrammobjekt',
      taskListDescription: 'Live-Aufgabenliste aus dem kanonischen Arbeitsmodell', taskKpiDescription: 'Live-Metriken für erledigte, blockierte und überfällige Aufgaben', whiteboardFrameFallback: 'Whiteboard-Rahmen', whiteboardFrameDescription: 'Rahmen und begrenzter Snapshot der enthaltenen Objekte',
      drawFrameFallback: 'Zeichenrahmen', drawFrameDescription: 'Strukturierter Zeichenrahmen und begrenzter Snapshot der enthaltenen Objekte', writerDocumentFallback: 'Textdokument', writerParagraphFallback: (paragraph) => `Absatz ${paragraph}`, writerSectionDescription: 'Textabschnitt ab diesem Absatz',
      pdfPage: (page, title) => title ? `Seite ${page} · ${title}` : `Seite ${page}`, pdfPageDescription: 'Kanonische PDF-Studio-Seitenvorschau', vaultAssetFallback: 'Tresorobjekt', vaultAssetDescription: (mime, bytes) => `${mime} · ${bytes.toLocaleString('de-DE')} Bytes`,
    },
  },
  'ru-RU': {
    productivity: {
      title: 'Просмотр и продуктивность', subtitle: 'Поиск и замена, повторное использование слайдов, поиск дубликатов и очистка шаблонов.', close: 'Закрыть инструменты продуктивности',
      searchReplace: 'Поиск и замена', findPlaceholder: 'Найти точный текст…', replacementPlaceholder: 'Заменить на…', replaceAll: 'Заменить все', caseSensitive: 'Учитывать регистр', noMatches: 'Совпадений нет.',
      searchSlide: (slide) => `Слайд ${slide}`, searchFields: { title: 'Заголовок', subtitle: 'Подзаголовок', speakerNotes: 'Заметки докладчика', bullet: 'Пункт списка', 'card-title': 'Заголовок карточки', 'card-description': 'Описание карточки', 'scene-text': 'Текст на слайде', 'table-cell': 'Ячейка таблицы', 'chart-title': 'Заголовок диаграммы' },
      occurrencesReplaced: (count) => `Заменено вхождений: ${count}.`, reusedSlides: (count, fileName) => `Повторно использовано слайдов: ${count} (из ${fileName}).`,
      duplicateGroups: (count) => `Группы дубликатов: ${count}`, duplicateSlideIndexes: (indexes) => `Слайды ${indexes}`, reuseSlides: 'Повторно использовать слайды',
      importDescription: 'Импорт ограниченного пакета PPTX или ODP. Слайды получают новые технические идентификаторы, сохраняя идентичность Morph.', chooseDeck: 'Выбрать PPTX или ODP',
      deckHygiene: 'Очистка презентации', removeUnusedMasters: 'Удалить неиспользуемые образцы', removedMasters: (count) => `Удалено неиспользуемых образцов: ${count}.`, noUnusedMasters: 'Неиспользуемых образцов нет.',
      errors: { replace: 'Не удалось заменить текст. Проверьте текст поиска и замены и повторите попытку.', cleanup: 'Не удалось удалить неиспользуемые образцы. Повторите попытку.', import: 'Не удалось импортировать презентацию. Проверьте, что файл имеет поддерживаемый формат PPTX или ODP, и повторите попытку.' },
    },
    speakerCoach: {
      title: 'Анализ выступления', close: 'Закрыть анализ выступления', score: 'Общая оценка', speakingRate: 'Темп речи (слов/мин)', fillersDetected: 'Слова-паразиты', totalDuration: 'Общая длительность',
      summaryHeading: 'Итоговый отзыв', summaryForScore: (score) => score >= 85 ? 'Отличная репетиция. Презентация готова к уверенному выступлению.' : score >= 70 ? 'Хорошая репетиция. Можно улучшить тайминг и сократить слова-паразиты.' : 'Репетицию можно улучшить. Сосредоточьтесь на темпе речи и времени слайдов.',
      strengths: 'Сильные стороны', improvements: 'Что можно улучшить', slideAnalysis: 'Разбор по слайдам', slide: (number) => `Слайд ${number}`, selectSlide: (number, title) => `Выбрать слайд ${number}: ${title}`, actual: 'Факт', target: 'План', pace: 'Темп',
      pacing: { too_slow: 'Медленно', optimal: 'В норме', too_fast: 'Быстро' }, tipFast: 'Темп речи высокий. Делайте осознанные паузы.', tipSlow: 'Темп речи низкий. Добавьте выразительности.',
      tipTimeExceeded: (actual, target) => `Превышено время слайда: ${actual} с вместо ${target} с.`, tipBrief: 'Этот раздел слишком краткий. Раскройте основные мысли.', tipFillers: (count) => `Много слов-паразитов (${count}). Формулируйте короче.`, tipBalanced: 'Хороший баланс темпа и времени.',
      strengthPace: (wpm) => `Уверенный темп речи: ${wpm} слов в минуту.`, strengthNoFillers: 'Чёткая речь без слов-паразитов.', strengthFewFillers: 'Сдержанный выбор слов с минимумом слов-паразитов.', strengthTiming: 'Время всех слайдов близко к плану.',
      improveFast: (wpm) => `Общий темп высок: ${wpm} слов/мин. Замедляйтесь на ключевых тезисах.`, improveSlow: (wpm) => `Общий темп низок: ${wpm} слов/мин. Добавьте динамики.`,
      improveFillers: (count, examples) => `Сократите слова-паразиты: найдено ${count}${examples ? ` (например: ${examples})` : ''}.`, improveTiming: (count) => `Отклонение от плана по времени слайдов: ${count}.`,
      refresh: 'Пересчитать', done: 'Готово', seconds: (value) => `${value} с`, errors: { generic: 'Не удалось завершить анализ выступления. Повторите попытку.' },
    },
    workspaceIntegration: {
      sourceKinds: { Grid: 'Таблицы', Tasks: 'Задачи', Whiteboard: 'Доска', Draw: 'Рисование', Writer: 'Текстовый редактор', PdfStudio: 'PDF Studio', Vault: 'Хранилище' },
      targetKinds: { 'grid-range': 'Диапазон таблицы', 'grid-chart': 'Диаграмма таблицы', 'grid-kpi': 'Показатель таблицы', 'project-timeline': 'Шкала проекта', 'task-list': 'Список задач', 'task-kpi': 'Показатели задач', 'project-milestone': 'Этап проекта', 'database-table': 'Таблица базы данных', 'database-chart': 'Диаграмма базы данных', 'whiteboard-frame': 'Область доски', 'writer-section': 'Раздел документа', 'pdf-page': 'Страница PDF', 'forms-dashboard': 'Панель форм', 'vault-asset': 'Объект хранилища', 'space-context': 'Контекст Workspace' },
      range: 'Диапазон', kpi: 'Показатель', taskList: 'Список задач', taskKpi: 'Показатели задач', snapshotMetrics: { document: 'Документ', version: 'Версия', paragraphs: 'Абзацы', range: 'Диапазон', values: 'Значения', sum: 'Сумма', average: 'Среднее' }, snapshotDetails: { chart: 'Диаграмма', integrity: 'Целостность', integrityStates: { unverified: 'не проверено', verified: 'проверено', mismatch: 'несоответствие', unavailable: 'недоступно' }, role: 'Роль', linkedDocuments: (count) => { const remainder100 = count % 100; const remainder10 = count % 10; const noun = remainder100 >= 11 && remainder100 <= 14 ? 'связанных документов' : remainder10 === 1 ? 'связанный документ' : remainder10 >= 2 && remainder10 <= 4 ? 'связанных документа' : 'связанных документов'; return `${count} ${noun}`; } }, inspector: { workspaceProperties: 'Свойства Workspace', workspaceReference: 'Ссылка Workspace', objectTitle: 'Название объекта Workspace', source: 'Источник', uri: 'URI' }, gridRange: (sheet, range) => `${sheet} · ${range}`, gridRangeDescription: (range) => `Текущий диапазон таблицы ${range}`,
      gridKpi: (sheet) => `${sheet} · показатель`, gridKpiDescription: (range) => `Числовая сводка по диапазону ${range}`, gridChartFallback: 'Диаграмма таблицы', gridChartDescription: 'Канонический объект диаграммы таблицы',
      taskListDescription: 'Текущий список задач из основной модели', taskKpiDescription: 'Текущие показатели выполнения, блокировок и просрочек', whiteboardFrameFallback: 'Область доски', whiteboardFrameDescription: 'Область и ограниченный снимок содержащихся объектов',
      drawFrameFallback: 'Область рисунка', drawFrameDescription: 'Структурированная область рисунка и ограниченный снимок объектов', writerDocumentFallback: 'Документ редактора', writerParagraphFallback: (paragraph) => `Абзац ${paragraph}`, writerSectionDescription: 'Раздел документа, начиная с этого абзаца',
      pdfPage: (page, title) => title ? `Страница ${page} · ${title}` : `Страница ${page}`, pdfPageDescription: 'Канонический просмотр страницы PDF Studio', vaultAssetFallback: 'Объект хранилища', vaultAssetDescription: (mime, bytes) => `${mime} · ${bytes.toLocaleString('ru-RU')} байт`,
    },
  },
  'it-IT': {
    productivity: {
      title: 'Visualizzazioni e produttività', subtitle: 'Cerca e sostituisci, riutilizza diapositive, trova duplicati e ripulisci i master.', close: 'Chiudi gli strumenti di produttività',
      searchReplace: 'Cerca e sostituisci', findPlaceholder: 'Trova testo esatto…', replacementPlaceholder: 'Sostituisci con…', replaceAll: 'Sostituisci tutto', caseSensitive: 'Distingui maiuscole e minuscole', noMatches: 'Nessuna corrispondenza.',
      searchSlide: (slide) => `Diapositiva ${slide}`, searchFields: { title: 'Titolo', subtitle: 'Sottotitolo', speakerNotes: 'Note del relatore', bullet: 'Punto elenco', 'card-title': 'Titolo della scheda', 'card-description': 'Descrizione della scheda', 'scene-text': 'Testo della diapositiva', 'table-cell': 'Cella della tabella', 'chart-title': 'Titolo del grafico' },
      occurrencesReplaced: (count) => `Occorrenze sostituite: ${count}.`, reusedSlides: (count, fileName) => `Riutilizzate ${count} diapositive da ${fileName}.`, duplicateGroups: (count) => `Gruppi duplicati: ${count}`, duplicateSlideIndexes: (indexes) => `Diapositive ${indexes}`,
      reuseSlides: 'Riutilizza diapositive', importDescription: 'Importa un pacchetto PPTX o ODP entro i limiti. Le diapositive riutilizzate ricevono nuovi ID tecnici mantenendo l’identità Morph.', chooseDeck: 'Scegli PPTX o ODP', deckHygiene: 'Pulizia presentazione', removeUnusedMasters: 'Rimuovi master inutilizzati', removedMasters: (count) => `Rimossi ${count} master inutilizzati.`, noUnusedMasters: 'Nessun master inutilizzato trovato.',
      errors: { replace: 'Impossibile sostituire il testo. Controlla i valori di ricerca e sostituzione e riprova.', cleanup: 'Impossibile rimuovere i master inutilizzati. Riprova.', import: 'Impossibile importare la presentazione. Verifica che il file PPTX o ODP sia supportato e riprova.' },
    },
    speakerCoach: {
      title: 'Analisi del relatore', close: 'Chiudi l’analisi del relatore', score: 'Punteggio complessivo', speakingRate: 'Velocità di eloquio (parole/min)', fillersDetected: 'Intercalari rilevati', totalDuration: 'Durata totale',
      summaryHeading: 'Riepilogo feedback', summaryForScore: (score) => score >= 85 ? 'Ottima prova. La presentazione è pronta per un’esposizione sicura.' : score >= 70 ? 'Prova solida. Tempi e intercalari possono ancora essere perfezionati.' : 'La prova può migliorare. Concentrati sul ritmo e sui tempi delle diapositive.',
      strengths: 'Punti di forza', improvements: 'Possibili miglioramenti', slideAnalysis: 'Analisi per diapositiva', slide: (number) => `Diapositiva ${number}`, selectSlide: (number, title) => `Seleziona la diapositiva ${number}: ${title}`, actual: 'Effettivo', target: 'Obiettivo', pace: 'Ritmo',
      pacing: { too_slow: 'Lento', optimal: 'Adeguato', too_fast: 'Veloce' }, tipFast: 'Il ritmo è veloce. Inserisci pause intenzionali.', tipSlow: 'Il ritmo è lento. Aumenta l’energia vocale.', tipTimeExceeded: (actual, target) => `Tempo della diapositiva superato (${actual}s rispetto a ${target}s).`, tipBrief: 'Questa sezione è breve. Approfondisci i punti chiave.', tipFillers: (count) => `Molti intercalari (${count}). Usa frasi più concise.`, tipBalanced: 'Buon equilibrio tra ritmo e tempi.',
      strengthPace: (wpm) => `Ritmo sicuro (${wpm} parole al minuto).`, strengthNoFillers: 'Esposizione chiara senza intercalari.', strengthFewFillers: 'Scelta delle parole controllata e con pochi intercalari.', strengthTiming: 'Tutte le diapositive sono vicine ai tempi previsti.', improveFast: (wpm) => `Il ritmo complessivo è alto: ${wpm} parole/min. Rallenta sui messaggi chiave.`, improveSlow: (wpm) => `Il ritmo complessivo è basso: ${wpm} parole/min. Aggiungi dinamismo.`, improveFillers: (count, examples) => `Riduci gli intercalari: ${count}${examples ? ` rilevati (ad esempio: ${examples})` : ''}.`, improveTiming: (count) => `${count} diapositive si sono discostate dai tempi previsti.`,
      refresh: 'Ricalcola', done: 'Fine', seconds: (value) => `${value} s`, errors: { generic: 'Impossibile completare l’analisi del relatore. Riprova.' },
    },
    workspaceIntegration: {
      sourceKinds: { Grid: 'Fogli di calcolo', Tasks: 'Attività', Whiteboard: 'Lavagna', Draw: 'Disegno', Writer: 'Scrittura', PdfStudio: 'PDF Studio', Vault: 'Archivio' },
      targetKinds: { 'grid-range': 'Intervallo del foglio', 'grid-chart': 'Grafico del foglio', 'grid-kpi': 'Indicatore del foglio', 'project-timeline': 'Cronologia del progetto', 'task-list': 'Elenco attività', 'task-kpi': 'Metriche attività', 'project-milestone': 'Traguardo del progetto', 'database-table': 'Tabella del database', 'database-chart': 'Grafico del database', 'whiteboard-frame': 'Riquadro lavagna', 'writer-section': 'Sezione documento', 'pdf-page': 'Pagina PDF', 'forms-dashboard': 'Dashboard moduli', 'vault-asset': 'Elemento archivio', 'space-context': 'Contesto Workspace' },
      range: 'Intervallo', kpi: 'Indicatore', taskList: 'Elenco attività', taskKpi: 'Metriche attività', snapshotMetrics: { document: 'Documento', version: 'Versione', paragraphs: 'Paragrafi', range: 'Intervallo', values: 'Valori', sum: 'Somma', average: 'Media' }, snapshotDetails: { chart: 'Grafico', integrity: 'Integrità', integrityStates: { unverified: 'non verificato', verified: 'verificato', mismatch: 'non corrispondente', unavailable: 'non disponibile' }, role: 'Ruolo', linkedDocuments: (count) => `${count} ${count === 1 ? 'documento collegato' : 'documenti collegati'}` }, inspector: { workspaceProperties: 'Proprietà Workspace', workspaceReference: 'Riferimento Workspace', objectTitle: 'Titolo dell’oggetto Workspace', source: 'Origine', uri: 'URI' }, gridRange: (sheet, range) => `${sheet} · ${range}`, gridRangeDescription: (range) => `Intervallo live della tabella ${range}`, gridKpi: (sheet) => `${sheet} · indicatore`, gridKpiDescription: (range) => `Riepilogo numerico di ${range}`, gridChartFallback: 'Grafico del foglio', gridChartDescription: 'Oggetto canonico del grafico del foglio', taskListDescription: 'Elenco live delle attività dal modello canonico', taskKpiDescription: 'Metriche live di completamento, blocchi e scadenze', whiteboardFrameFallback: 'Riquadro lavagna', whiteboardFrameDescription: 'Riquadro e snapshot limitato degli oggetti contenuti', drawFrameFallback: 'Riquadro di disegno', drawFrameDescription: 'Riquadro di disegno strutturato e snapshot limitato degli oggetti', writerDocumentFallback: 'Documento Writer', writerParagraphFallback: (paragraph) => `Paragrafo ${paragraph}`, writerSectionDescription: 'Sezione Writer a partire da questo paragrafo', pdfPage: (page, title) => title ? `Pagina ${page} · ${title}` : `Pagina ${page}`, pdfPageDescription: 'Anteprima canonica della pagina PDF Studio', vaultAssetFallback: 'Elemento archivio', vaultAssetDescription: (mime, bytes) => `${mime} · ${bytes.toLocaleString('it-IT')} byte`,
    },
  },
  'es-ES': {
    productivity: {
      title: 'Vistas y productividad', subtitle: 'Busca y reemplaza, reutiliza diapositivas, encuentra duplicados y limpia patrones.', close: 'Cerrar herramientas de productividad',
      searchReplace: 'Buscar y reemplazar', findPlaceholder: 'Buscar texto literal…', replacementPlaceholder: 'Reemplazar por…', replaceAll: 'Reemplazar todo', caseSensitive: 'Distinguir mayúsculas y minúsculas', noMatches: 'No hay coincidencias.',
      searchSlide: (slide) => `Diapositiva ${slide}`, searchFields: { title: 'Título', subtitle: 'Subtítulo', speakerNotes: 'Notas del presentador', bullet: 'Viñeta', 'card-title': 'Título de tarjeta', 'card-description': 'Descripción de tarjeta', 'scene-text': 'Texto de diapositiva', 'table-cell': 'Celda de tabla', 'chart-title': 'Título del gráfico' },
      occurrencesReplaced: (count) => `Reemplazos realizados: ${count}.`, reusedSlides: (count, fileName) => `Se reutilizaron ${count} diapositivas de ${fileName}.`, duplicateGroups: (count) => `Grupos duplicados: ${count}`, duplicateSlideIndexes: (indexes) => `Diapositivas ${indexes}`,
      reuseSlides: 'Reutilizar diapositivas', importDescription: 'Importa un paquete PPTX u ODP dentro de los límites. Las diapositivas reutilizadas reciben nuevos ID técnicos y conservan la identidad Morph.', chooseDeck: 'Elegir PPTX u ODP', deckHygiene: 'Limpieza de la presentación', removeUnusedMasters: 'Eliminar patrones sin usar', removedMasters: (count) => `Se eliminaron ${count} patrones sin usar.`, noUnusedMasters: 'No se encontraron patrones sin usar.',
      errors: { replace: 'No se pudo reemplazar el texto. Comprueba los valores de búsqueda y reemplazo e inténtalo de nuevo.', cleanup: 'No se pudieron eliminar los patrones sin usar. Inténtalo de nuevo.', import: 'No se pudo importar la presentación. Comprueba que sea un archivo PPTX u ODP compatible e inténtalo de nuevo.' },
    },
    speakerCoach: {
      title: 'Análisis del presentador', close: 'Cerrar análisis del presentador', score: 'Puntuación general', speakingRate: 'Ritmo de habla (palabras/min)', fillersDetected: 'Muletillas detectadas', totalDuration: 'Duración total',
      summaryHeading: 'Resumen de comentarios', summaryForScore: (score) => score >= 85 ? 'Excelente ensayo. La presentación está lista para una exposición segura.' : score >= 70 ? 'Buen ensayo. Aún se pueden mejorar los tiempos y las muletillas.' : 'El ensayo puede mejorar. Céntrate en el ritmo y el tiempo de las diapositivas.',
      strengths: 'Puntos fuertes', improvements: 'Aspectos que mejorar', slideAnalysis: 'Análisis por diapositiva', slide: (number) => `Diapositiva ${number}`, selectSlide: (number, title) => `Seleccionar diapositiva ${number}: ${title}`, actual: 'Real', target: 'Objetivo', pace: 'Ritmo',
      pacing: { too_slow: 'Lento', optimal: 'Adecuado', too_fast: 'Rápido' }, tipFast: 'El ritmo es rápido. Añade pausas deliberadas.', tipSlow: 'El ritmo es lento. Aporta más energía vocal.', tipTimeExceeded: (actual, target) => `Se superó el tiempo previsto (${actual}s frente a ${target}s).`, tipBrief: 'Esta sección es breve. Amplía los puntos clave.', tipFillers: (count) => `Hay muchas muletillas (${count}). Usa frases más concisas.`, tipBalanced: 'Buen equilibrio entre ritmo y tiempo.',
      strengthPace: (wpm) => `Ritmo seguro (${wpm} palabras por minuto).`, strengthNoFillers: 'Exposición clara sin muletillas.', strengthFewFillers: 'Elección de palabras controlada y con pocas muletillas.', strengthTiming: 'Todas las diapositivas se ajustaron al tiempo previsto.', improveFast: (wpm) => `El ritmo general es alto: ${wpm} palabras/min. Reduce la velocidad en las ideas clave.`, improveSlow: (wpm) => `El ritmo general es bajo: ${wpm} palabras/min. Añade dinamismo.`, improveFillers: (count, examples) => `Reduce las muletillas: ${count}${examples ? ` detectadas (por ejemplo: ${examples})` : ''}.`, improveTiming: (count) => `${count} diapositivas se desviaron del tiempo previsto.`,
      refresh: 'Recalcular', done: 'Listo', seconds: (value) => `${value} s`, errors: { generic: 'No se pudo completar el análisis del presentador. Inténtalo de nuevo.' },
    },
    workspaceIntegration: {
      sourceKinds: { Grid: 'Hojas de cálculo', Tasks: 'Tareas', Whiteboard: 'Pizarra', Draw: 'Dibujo', Writer: 'Escritura', PdfStudio: 'PDF Studio', Vault: 'Bóveda' },
      targetKinds: { 'grid-range': 'Rango de hoja', 'grid-chart': 'Gráfico de hoja', 'grid-kpi': 'Indicador de hoja', 'project-timeline': 'Cronología del proyecto', 'task-list': 'Lista de tareas', 'task-kpi': 'Métricas de tareas', 'project-milestone': 'Hito del proyecto', 'database-table': 'Tabla de base de datos', 'database-chart': 'Gráfico de base de datos', 'whiteboard-frame': 'Marco de pizarra', 'writer-section': 'Sección del documento', 'pdf-page': 'Página PDF', 'forms-dashboard': 'Panel de formularios', 'vault-asset': 'Elemento de bóveda', 'space-context': 'Contexto de Workspace' },
      range: 'Rango', kpi: 'Indicador', taskList: 'Lista de tareas', taskKpi: 'Métricas de tareas', snapshotMetrics: { document: 'Documento', version: 'Versión', paragraphs: 'Párrafos', range: 'Rango', values: 'Valores', sum: 'Suma', average: 'Promedio' }, snapshotDetails: { chart: 'Gráfico', integrity: 'Integridad', integrityStates: { unverified: 'sin verificar', verified: 'verificado', mismatch: 'no coincide', unavailable: 'no disponible' }, role: 'Rol', linkedDocuments: (count) => `${count} ${count === 1 ? 'documento vinculado' : 'documentos vinculados'}` }, inspector: { workspaceProperties: 'Propiedades de Workspace', workspaceReference: 'Referencia de Workspace', objectTitle: 'Título del objeto de Workspace', source: 'Origen', uri: 'URI' }, gridRange: (sheet, range) => `${sheet} · ${range}`, gridRangeDescription: (range) => `Rango de tabla activo ${range}`, gridKpi: (sheet) => `${sheet} · indicador`, gridKpiDescription: (range) => `Resumen numérico de ${range}`, gridChartFallback: 'Gráfico de hoja', gridChartDescription: 'Objeto canónico de gráfico de hoja', taskListDescription: 'Lista de tareas activa del modelo canónico', taskKpiDescription: 'Métricas activas de tareas completadas, bloqueadas y vencidas', whiteboardFrameFallback: 'Marco de pizarra', whiteboardFrameDescription: 'Marco e instantánea limitada de los objetos contenidos', drawFrameFallback: 'Marco de dibujo', drawFrameDescription: 'Marco de dibujo estructurado e instantánea limitada de los objetos', writerDocumentFallback: 'Documento de escritura', writerParagraphFallback: (paragraph) => `Párrafo ${paragraph}`, writerSectionDescription: 'Sección del documento desde este párrafo', pdfPage: (page, title) => title ? `Página ${page} · ${title}` : `Página ${page}`, pdfPageDescription: 'Vista previa canónica de la página de PDF Studio', vaultAssetFallback: 'Elemento de bóveda', vaultAssetDescription: (mime, bytes) => `${mime} · ${bytes.toLocaleString('es-ES')} bytes`,
    },
  },
  'ja-JP': {
    productivity: {
      title: '表示と生産性', subtitle: '検索と置換、スライドの再利用、重複の検出、マスターの整理を行います。', close: '生産性ツールを閉じる',
      searchReplace: '検索と置換', findPlaceholder: '完全一致するテキストを検索…', replacementPlaceholder: '置換後のテキスト…', replaceAll: 'すべて置換', caseSensitive: '大文字と小文字を区別', noMatches: '一致する項目はありません。',
      searchSlide: (slide) => `スライド ${slide}`, searchFields: { title: 'タイトル', subtitle: 'サブタイトル', speakerNotes: '発表者ノート', bullet: '箇条書き', 'card-title': 'カードのタイトル', 'card-description': 'カードの説明', 'scene-text': 'スライド上のテキスト', 'table-cell': '表のセル', 'chart-title': 'グラフのタイトル' },
      occurrencesReplaced: (count) => `${count} 件を置換しました。`, reusedSlides: (count, fileName) => `${fileName} から ${count} 枚のスライドを再利用しました。`, duplicateGroups: (count) => `重複グループ: ${count}`, duplicateSlideIndexes: (indexes) => `スライド ${indexes}`,
      reuseSlides: 'スライドを再利用', importDescription: 'サイズ制限内の PPTX または ODP パッケージを読み込みます。再利用するスライドには新しい技術 ID が割り当てられ、Morph ID は維持されます。', chooseDeck: 'PPTX / ODP を選択', deckHygiene: 'デッキの整理', removeUnusedMasters: '未使用のマスターを削除', removedMasters: (count) => `未使用のマスターを ${count} 件削除しました。`, noUnusedMasters: '未使用のマスターはありません。',
      errors: { replace: 'テキストを置換できませんでした。検索語と置換後のテキストを確認して再試行してください。', cleanup: '未使用のマスターを削除できませんでした。再試行してください。', import: 'プレゼンテーションを読み込めませんでした。対応する PPTX または ODP ファイルか確認して再試行してください。' },
    },
    speakerCoach: {
      title: '発表者コーチ分析', close: '発表者コーチ分析を閉じる', score: '総合スコア', speakingRate: '話す速度（語/分）', fillersDetected: 'フィラー語', totalDuration: '合計時間',
      summaryHeading: 'フィードバック', summaryForScore: (score) => score >= 85 ? '非常に良いリハーサルです。自信を持って発表できます。' : score >= 70 ? '安定したリハーサルです。時間配分とフィラー語をさらに改善できます。' : '改善の余地があります。話す速度とスライドの時間配分を見直してください。',
      strengths: '良い点', improvements: '改善点', slideAnalysis: 'スライドごとの分析', slide: (number) => `スライド ${number}`, selectSlide: (number, title) => `スライド ${number} を選択: ${title}`, actual: '実績', target: '目標', pace: '速度',
      pacing: { too_slow: '遅い', optimal: '適切', too_fast: '速い' }, tipFast: '話す速度が速めです。意識して間を取りましょう。', tipSlow: '話す速度が遅めです。抑揚をつけましょう。', tipTimeExceeded: (actual, target) => `スライドの時間を超過しました（${target} 秒の予定に対して ${actual} 秒）。`, tipBrief: '説明が短めです。要点を詳しく説明しましょう。', tipFillers: (count) => `フィラー語が多くあります（${count} 件）。簡潔に表現しましょう。`, tipBalanced: '速度と時間配分のバランスが良好です。',
      strengthPace: (wpm) => `安定した話す速度です（1 分あたり ${wpm} 語）。`, strengthNoFillers: 'フィラー語のない明瞭な発表です。', strengthFewFillers: 'フィラー語が少なく、言葉選びが安定しています。', strengthTiming: 'すべてのスライドが予定時間に収まりました。', improveFast: (wpm) => `全体の速度は ${wpm} 語/分で速めです。重要なメッセージではゆっくり話しましょう。`, improveSlow: (wpm) => `全体の速度は ${wpm} 語/分で遅めです。抑揚を増やしましょう。`, improveFillers: (count, examples) => `フィラー語を減らしましょう: ${count} 件${examples ? `（例: ${examples}）` : ''}。`, improveTiming: (count) => `予定時間から外れたスライド: ${count} 枚。`,
      refresh: '再計算', done: '完了', seconds: (value) => `${value} 秒`, errors: { generic: '発表者コーチ分析を完了できませんでした。再試行してください。' },
    },
    workspaceIntegration: {
      sourceKinds: { Grid: '表計算', Tasks: 'タスク', Whiteboard: 'ホワイトボード', Draw: '描画', Writer: '文書作成', PdfStudio: 'PDF Studio', Vault: '保管庫' },
      targetKinds: { 'grid-range': 'シート範囲', 'grid-chart': 'シート グラフ', 'grid-kpi': 'シート指標', 'project-timeline': 'プロジェクトのタイムライン', 'task-list': 'タスク一覧', 'task-kpi': 'タスク指標', 'project-milestone': 'プロジェクトのマイルストーン', 'database-table': 'データベース テーブル', 'database-chart': 'データベース グラフ', 'whiteboard-frame': 'ホワイトボード フレーム', 'writer-section': '文書セクション', 'pdf-page': 'PDF ページ', 'forms-dashboard': 'フォーム ダッシュボード', 'vault-asset': '保管庫アセット', 'space-context': 'Workspace コンテキスト' },
      range: '範囲', kpi: '指標', taskList: 'タスク一覧', taskKpi: 'タスク指標', snapshotMetrics: { document: '文書', version: 'バージョン', paragraphs: '段落', range: '範囲', values: '値', sum: '合計', average: '平均' }, snapshotDetails: { chart: 'グラフ', integrity: '整合性', integrityStates: { unverified: '未検証', verified: '検証済み', mismatch: '不一致', unavailable: '利用不可' }, role: '役割', linkedDocuments: (count) => `関連ドキュメント ${count} 件` }, inspector: { workspaceProperties: 'Workspace のプロパティ', workspaceReference: 'Workspace 参照', objectTitle: 'Workspace オブジェクトのタイトル', source: 'ソース', uri: 'URI' }, gridRange: (sheet, range) => `${sheet} · ${range}`, gridRangeDescription: (range) => `ライブ表範囲 ${range}`, gridKpi: (sheet) => `${sheet} · 指標`, gridKpiDescription: (range) => `${range} の数値指標サマリー`, gridChartFallback: 'シート グラフ', gridChartDescription: '標準のシート グラフ オブジェクト', taskListDescription: '標準作業モデルのライブ タスク一覧', taskKpiDescription: '完了、ブロック、期限超過に関するライブ指標', whiteboardFrameFallback: 'ホワイトボード フレーム', whiteboardFrameDescription: 'フレームと内部オブジェクトの制限付きスナップショット', drawFrameFallback: '描画フレーム', drawFrameDescription: '構造化された描画フレームとオブジェクトの制限付きスナップショット', writerDocumentFallback: '文書', writerParagraphFallback: (paragraph) => `段落 ${paragraph}`, writerSectionDescription: 'この段落から始まる文書セクション', pdfPage: (page, title) => title ? `ページ ${page} · ${title}` : `ページ ${page}`, pdfPageDescription: 'PDF Studio の標準ページ プレビュー', vaultAssetFallback: '保管庫アセット', vaultAssetDescription: (mime, bytes) => `${mime} · ${bytes.toLocaleString('ja-JP')} バイト`,
    },
  },
  'zh-CN': {
    productivity: {
      title: '视图与效率', subtitle: '搜索和替换、复用幻灯片、查找重复项并清理母版。', close: '关闭效率工具',
      searchReplace: '搜索和替换', findPlaceholder: '查找完全匹配的文本…', replacementPlaceholder: '替换为…', replaceAll: '全部替换', caseSensitive: '区分大小写', noMatches: '没有匹配项。',
      searchSlide: (slide) => `第 ${slide} 张幻灯片`, searchFields: { title: '标题', subtitle: '副标题', speakerNotes: '演讲者备注', bullet: '项目符号', 'card-title': '卡片标题', 'card-description': '卡片说明', 'scene-text': '幻灯片文本', 'table-cell': '表格单元格', 'chart-title': '图表标题' },
      occurrencesReplaced: (count) => `已替换 ${count} 处。`, reusedSlides: (count, fileName) => `已从 ${fileName} 复用 ${count} 张幻灯片。`, duplicateGroups: (count) => `重复组：${count}`, duplicateSlideIndexes: (indexes) => `幻灯片 ${indexes}`,
      reuseSlides: '复用幻灯片', importDescription: '导入大小受限的 PPTX 或 ODP 包。复用的幻灯片会获得新的技术 ID，同时保留 Morph 身份。', chooseDeck: '选择 PPTX 或 ODP', deckHygiene: '演示文稿清理', removeUnusedMasters: '删除未使用的母版', removedMasters: (count) => `已删除 ${count} 个未使用的母版。`, noUnusedMasters: '没有未使用的母版。',
      errors: { replace: '无法替换文本。请检查搜索内容和替换内容后重试。', cleanup: '无法删除未使用的母版。请重试。', import: '无法导入演示文稿。请确认文件为受支持的 PPTX 或 ODP 格式后重试。' },
    },
    speakerCoach: {
      title: '演讲者辅导分析', close: '关闭演讲者辅导分析', score: '总体评分', speakingRate: '语速（词/分钟）', fillersDetected: '检测到的填充词', totalDuration: '总时长',
      summaryHeading: '反馈摘要', summaryForScore: (score) => score >= 85 ? '排练效果出色，演示文稿已准备好进行自信展示。' : score >= 70 ? '排练效果不错，还可以继续优化时间安排和填充词。' : '排练仍有提升空间，请重点关注语速和幻灯片时长。',
      strengths: '优势', improvements: '改进建议', slideAnalysis: '逐张幻灯片分析', slide: (number) => `第 ${number} 张`, selectSlide: (number, title) => `选择第 ${number} 张幻灯片：${title}`, actual: '实际', target: '目标', pace: '语速',
      pacing: { too_slow: '偏慢', optimal: '合适', too_fast: '偏快' }, tipFast: '语速偏快，请有意识地停顿。', tipSlow: '语速偏慢，请增强表达活力。', tipTimeExceeded: (actual, target) => `幻灯片时长超出目标（${target} 秒，实际 ${actual} 秒）。`, tipBrief: '这部分内容较简短，请展开关键要点。', tipFillers: (count) => `填充词较多（${count} 个），请使用更简洁的表达。`, tipBalanced: '语速与时间安排平衡良好。',
      strengthPace: (wpm) => `语速稳定（每分钟 ${wpm} 词）。`, strengthNoFillers: '表达清晰，没有使用填充词。', strengthFewFillers: '用词克制，填充词较少。', strengthTiming: '所有幻灯片都接近目标时长。', improveFast: (wpm) => `整体语速偏快：每分钟 ${wpm} 词。请在重点内容处放慢速度。`, improveSlow: (wpm) => `整体语速偏慢：每分钟 ${wpm} 词。请增加表达变化。`, improveFillers: (count, examples) => `请减少填充词：检测到 ${count} 个${examples ? `（例如：${examples}）` : ''}。`, improveTiming: (count) => `${count} 张幻灯片偏离了计划时长。`,
      refresh: '重新计算', done: '完成', seconds: (value) => `${value} 秒`, errors: { generic: '无法完成演讲者辅导分析。请重试。' },
    },
    workspaceIntegration: {
      sourceKinds: { Grid: '表格', Tasks: '任务', Whiteboard: '白板', Draw: '绘图', Writer: '文档', PdfStudio: 'PDF Studio', Vault: '保险库' },
      targetKinds: { 'grid-range': '表格范围', 'grid-chart': '表格图表', 'grid-kpi': '表格指标', 'project-timeline': '项目时间线', 'task-list': '任务列表', 'task-kpi': '任务指标', 'project-milestone': '项目里程碑', 'database-table': '数据库表格', 'database-chart': '数据库图表', 'whiteboard-frame': '白板画框', 'writer-section': '文档章节', 'pdf-page': 'PDF 页面', 'forms-dashboard': '表单仪表板', 'vault-asset': '保险库资源', 'space-context': 'Workspace 上下文' },
      range: '范围', kpi: '指标', taskList: '任务列表', taskKpi: '任务指标', snapshotMetrics: { document: '文档', version: '版本', paragraphs: '段落', range: '范围', values: '数值', sum: '总和', average: '平均值' }, snapshotDetails: { chart: '图表', integrity: '完整性', integrityStates: { unverified: '未验证', verified: '已验证', mismatch: '不匹配', unavailable: '不可用' }, role: '角色', linkedDocuments: (count) => `${count} 个关联文档` }, inspector: { workspaceProperties: 'Workspace 属性', workspaceReference: 'Workspace 引用', objectTitle: 'Workspace 对象标题', source: '来源', uri: 'URI' }, gridRange: (sheet, range) => `${sheet} · ${range}`, gridRangeDescription: (range) => `实时表格范围 ${range}`, gridKpi: (sheet) => `${sheet} · 指标`, gridKpiDescription: (range) => `${range} 的数值指标摘要`, gridChartFallback: '表格图表', gridChartDescription: '规范表格图表对象', taskListDescription: '来自规范任务模型的实时任务列表', taskKpiDescription: '实时完成、阻塞和逾期任务指标', whiteboardFrameFallback: '白板画框', whiteboardFrameDescription: '画框及其中对象的有限快照', drawFrameFallback: '绘图画框', drawFrameDescription: '结构化绘图画框及对象的有限快照', writerDocumentFallback: 'Writer 文档', writerParagraphFallback: (paragraph) => `第 ${paragraph} 段`, writerSectionDescription: '从此段开始的文档章节', pdfPage: (page, title) => title ? `第 ${page} 页 · ${title}` : `第 ${page} 页`, pdfPageDescription: '规范 PDF Studio 页面预览', vaultAssetFallback: '保险库资源', vaultAssetDescription: (mime, bytes) => `${mime} · ${bytes.toLocaleString('zh-CN')} 字节`,
    },
  },
};

type PresentWorkspaceSnapshotMetricKey = keyof PresentWorkspaceIntegrationCopy['snapshotMetrics'];

const WRITER_SNAPSHOT_METRIC_KEYS: Readonly<Record<string, PresentWorkspaceSnapshotMetricKey>> = {
  Document: 'document', Version: 'version', Paragraphs: 'paragraphs',
};

const GRID_KPI_SNAPSHOT_METRIC_KEYS: Readonly<Record<string, PresentWorkspaceSnapshotMetricKey>> = {
  Range: 'range', Values: 'values', Sum: 'sum', Average: 'average',
};

export function presentWorkspaceSnapshotMetricLabel(
  locale: WorkspaceLocale,
  integrationKind: PresentWorkspaceIntegrationKind,
  label: string,
): string {
  const keys = integrationKind === 'writer-section'
    ? WRITER_SNAPSHOT_METRIC_KEYS
    : integrationKind === 'grid-kpi'
      ? GRID_KPI_SNAPSHOT_METRIC_KEYS
      : undefined;
  const metricKey = keys?.[label];
  return metricKey ? PRESENT_OFFICE_COPY[locale].workspaceIntegration.snapshotMetrics[metricKey] : label;
}

export function presentSpeakerCoachFailureCopy(locale: WorkspaceLocale, _cause: unknown): string {
  return PRESENT_OFFICE_COPY[locale].speakerCoach.errors.generic;
}

export function presentProductivityFailureCopy(locale: WorkspaceLocale, _cause: unknown, action: keyof PresentProductivityCopy['errors']): string {
  return PRESENT_OFFICE_COPY[locale].productivity.errors[action];
}
