// STATUS: PLATIN — Release Alpha 0.1: professionelle, deterministische Beispieldokumente.
//
// Der Nutzerbefund „die Beispieldokumente nach der Installation sind Murx" war messbar:
// das Grid trug ein paar Zahlen, der Writer etwas Text und eine Mockup-Tabelle ohne
// Quelle, die übrigen Apps hingen an leeren bzw. austauschbaren Vorgabemodellen.
//
// Diese Datei baut deshalb **Beispieldokumente, die eine echte Arbeitsprobe sind**:
//   * ein Quartalsmodell mit Formeln, Zahlenformaten, Spaltenbreiten und Szenarien,
//   * ein Writer-Dokument, dessen Quartalstabelle **keine Kopie**, sondern eine
//     Live-Referenz auf das Grid-Beispieldokument ist (`writerData.workspaceEmbeds`,
//     `createWriterWorkspaceEmbed`, Modus `Live`; der Refresh läuft über
//     `refreshWriterWorkspaceEmbeds` im bestehenden Propagation-Pfad),
//   * ein Board-Review-Deck, echte Projektnotizen/-aufgaben, ein Architektur-Whiteboard,
//     ein Editorial-Layout, ein Volltext-PDF und ein gefüllter Vault.
//
// Regeln, die diese Datei einhält:
//   * deterministische IDs und relative Zeitstempel (kein `randomUUID` für Seed-Inhalte),
//   * keine erfundene „Verschlüsselung" und keine Sicherheitszusage in den Daten —
//     der Vault markiert Integrität ehrlich als `unverified`,
//   * keine zweite Persistenz und kein zweiter Snapshot-Mechanismus: der Writer-Embed
//     wird mit dem vorhandenen `createWriterWorkspaceEmbed` erzeugt.
import {
  WorkspaceDocument,
  ChartObject,
  TableObject,
  TextBlockObject,
  Paragraph,
  GridCell,
  PdfPageModel,
  PresentSlide,
  TaskItem,
  VaultFile,
  WhiteboardObjectModel,
} from '../../shared/contracts/workspace';
import { DEFAULT_PRESENT_SECTIONS } from '../../apps/present/contracts/types';
import { DEFAULT_NOTEBOOKS } from '../../apps/notes/contracts/notesEditor';
import { DEFAULT_TASKS } from '../../apps/tasks/model/taskDefaults';
import { DEFAULT_INSIGHT_MODEL } from '../../apps/insight/domain/types';
import { DEFAULT_CONNECT_MODEL } from '../../apps/connect/domain/types';
import { DEFAULT_AUTOMATE_MODEL } from '../../apps/automate/model/types';
import { createWriterWorkspaceEmbed } from '../../apps/writer/public/workspace/writerWorkspaceIntegration';
import { createPublishFrame } from '../../apps/publish/model/publishDocumentEngine';
import { createPublishProject } from '../../apps/publish/model/publishDocumentFactory';

const SEED_NOW = Date.now();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const DEFAULT_CARDS = DEFAULT_TASKS.map((task, index) => ({
  id: `card-${index + 1}`,
  title: task.title,
  column: task.plannerColumn ?? (task.completed ? 'done' : 'todo'),
  assignee: task.assignee,
  tags: task.tags ?? ['workspace'],
  linkedTaskId: task.id,
  priority: task.priority,
  dueDate: task.dueDate,
  description: task.description,
  checklist: task.checklist ?? [],
}));

/**
 * Zwei reale Release-Aufgaben ergänzen das Projektboard, damit das Beispiel den
 * Alpha-Stand dieser Runde abbildet (native Abnahme + Live-Referenz-Demo). Sie sind
 * fachliche Aufgaben des Projekts, keine erfundenen Nutzerdaten.
 */
const RELEASE_EXTRA_TASKS: TaskItem[] = [
  {
    id: 'task-5',
    title: 'Nativen Alpha-Gegentest am gebauten Fenster durchführen',
    description: 'Installierte Alpha starten, Kernpfade prüfen und Findings mit Build-ID dokumentieren.',
    completed: false,
    progress: 20,
    priority: 'high',
    startDate: '2026-10-19',
    dueDate: '2026-10-26',
    projectId: 'project-workspace-release',
    phaseId: 'phase-release',
    estimateHours: 16,
    plannerColumn: 'in_progress',
    tags: ['release', 'native'],
    assignee: 'Release Team',
  },
  {
    id: 'task-6',
    title: 'Live-Referenz Writer ↔ Grid im Board-Review zeigen',
    description: 'Eine Zelle im Quartalsmodell ändern und den aktualisierten Live-Bereich im Writer präsentieren.',
    completed: false,
    progress: 60,
    priority: 'medium',
    startDate: '2026-10-18',
    dueDate: '2026-10-23',
    projectId: 'project-workspace-release',
    phaseId: 'phase-review',
    estimateHours: 8,
    plannerColumn: 'in_progress',
    tags: ['demo', 'fabric'],
    assignee: 'Release Team',
  },
];

const releaseTasks: TaskItem[] = [...DEFAULT_TASKS, ...RELEASE_EXTRA_TASKS];
const releaseCards = [
  ...DEFAULT_CARDS,
  ...RELEASE_EXTRA_TASKS.map((task) => ({
    id: `card-${task.id}`,
    title: task.title,
    column: task.plannerColumn ?? 'todo',
    tags: task.tags ?? ['workspace'],
    linkedTaskId: task.id,
    priority: task.priority,
    dueDate: task.dueDate,
    description: task.description,
    checklist: [],
  })),
];

const SEED_PAGE_SETUP = {
  paperSize: 'A4' as const,
  orientation: 'portrait' as const,
  margins: 'normal' as const,
  paperColor: 'white' as const,
  showPageNumbers: true,
  headerText: '',
  footerText: '',
};

/** Einheitlicher Zellhelfer: Wert plus optionale Formatierung. */
function cell(value: GridCell['value'], extra: Omit<GridCell, 'value'> = {}): GridCell {
  return { value, ...extra };
}

const MONEY: Omit<GridCell, 'value'> = { format: 'currency', dataType: 'currency' };
const MONEY_BOLD: Omit<GridCell, 'value'> = { ...MONEY, bold: true };
const PERCENT: Omit<GridCell, 'value'> = { format: 'percent', dataType: 'percent' };
const HEADER: Omit<GridCell, 'value'> = {
  bold: true,
  background: '#e2e8f0',
  text_color: '#0f172a',
  border: 'outline',
  alignment: 'left',
};

// ---------------------------------------------------------------------------------------------
// Grid-Beispiel: Quartalsmodell 2026 (Sheet 1), Annahmen & Szenarien (Sheet 2)
// ---------------------------------------------------------------------------------------------

export const initialGridTable: TableObject = {
  id: 'table-grid-1',
  rows: 25,
  cols: 10,
  cells: {
    A1: cell('Astraea Workspace · Quartalsmodell 2026 (USD)', { bold: true, fontSize: 14, alignment: 'left', text_color: '#0f172a' }),
    A2: cell('Kennzahl', HEADER),
    B2: cell('Q1', { ...HEADER, alignment: 'right' }),
    C2: cell('Q2', { ...HEADER, alignment: 'right' }),
    D2: cell('Q3', { ...HEADER, alignment: 'right' }),
    E2: cell('Q4', { ...HEADER, alignment: 'right' }),
    F2: cell('Gesamt', { ...HEADER, alignment: 'right' }),
    G2: cell('Ø Quartal', { ...HEADER, alignment: 'right' }),

    A3: cell('Umsatz', { bold: true }),
    B3: cell(420_000, MONEY),
    C3: cell(465_000, MONEY),
    D3: cell(498_000, MONEY),
    E3: cell(542_000, MONEY),
    F3: cell(1_925_000, { ...MONEY_BOLD, formula: '=SUM(B3:E3)' }),
    G3: cell(481_250, { ...MONEY, formula: '=AVERAGE(B3:E3)' }),

    A4: cell('Kosten (inkl. Overhead)', { bold: true }),
    B4: cell(268_000, MONEY),
    C4: cell(279_000, MONEY),
    D4: cell(291_000, MONEY),
    E4: cell(305_000, MONEY),
    F4: cell(1_143_000, { ...MONEY_BOLD, formula: '=SUM(B4:E4)' }),
    G4: cell(285_750, { ...MONEY, formula: '=AVERAGE(B4:E4)' }),

    A5: cell('Rohergebnis', { bold: true }),
    B5: cell(152_000, { ...MONEY_BOLD, formula: '=B3-B4' }),
    C5: cell(186_000, { ...MONEY_BOLD, formula: '=C3-C4' }),
    D5: cell(207_000, { ...MONEY_BOLD, formula: '=D3-D4' }),
    E5: cell(237_000, { ...MONEY_BOLD, formula: '=E3-E4' }),
    F5: cell(782_000, { ...MONEY_BOLD, formula: '=SUM(B5:E5)' }),
    G5: cell(195_500, { ...MONEY, formula: '=AVERAGE(B5:E5)' }),

    A6: cell('Marge', { bold: true }),
    B6: cell(0.361905, PERCENT),
    C6: cell(0.4, PERCENT),
    D6: cell(0.415663, PERCENT),
    E6: cell(0.437269, PERCENT),
    F6: cell(0.406234, { ...PERCENT, bold: true, formula: '=F5/F3' }),
    G6: cell(0.403709, { ...PERCENT, formula: '=AVERAGE(B6:E6)' }),

    A7: cell('Umsatzwachstum zum Vorquartal', { italic: true, text_color: '#475569' }),
    B7: cell('—', { alignment: 'right', text_color: '#94a3b8' }),
    C7: cell(0.107143, { ...PERCENT, formula: '=C3/B3-1' }),
    D7: cell(0.070968, { ...PERCENT, formula: '=D3/C3-1' }),
    E7: cell(0.088353, { ...PERCENT, formula: '=E3/D3-1' }),
    F7: cell(0.290476, { ...PERCENT, formula: '=E3/B3-1' }),
    G7: cell('', {}),

    A9: cell('Produktmix Q4 · Direktkosten', { bold: true, fontSize: 12, text_color: '#0f172a' }),
    A10: cell('Produkt', HEADER),
    B10: cell('Preis/Stück', { ...HEADER, alignment: 'right' }),
    C10: cell('Stückzahl', { ...HEADER, alignment: 'right' }),
    D10: cell('Umsatz', { ...HEADER, alignment: 'right' }),
    E10: cell('Kosten/Stück', { ...HEADER, alignment: 'right' }),
    F10: cell('Gesamtkosten', { ...HEADER, alignment: 'right' }),
    G10: cell('Rohergebnis', { ...HEADER, alignment: 'right' }),
    H10: cell('Marge', { ...HEADER, alignment: 'right' }),

    A11: cell('Astraea Enterprise Core'),
    B11: cell(1_400, MONEY),
    C11: cell(220, { format: 'number', dataType: 'integer' }),
    D11: cell(308_000, { ...MONEY_BOLD, formula: '=B11*C11' }),
    E11: cell(620, MONEY),
    F11: cell(136_400, { ...MONEY, formula: '=E11*C11' }),
    G11: cell(171_600, { ...MONEY_BOLD, formula: '=D11-F11' }),
    H11: cell(0.557143, { ...PERCENT, formula: '=G11/D11' }),

    A12: cell('Sovereign Mesh'),
    B12: cell(900, MONEY),
    C12: cell(150, { format: 'number', dataType: 'integer' }),
    D12: cell(135_000, { ...MONEY_BOLD, formula: '=B12*C12' }),
    E12: cell(380, MONEY),
    F12: cell(57_000, { ...MONEY, formula: '=E12*C12' }),
    G12: cell(78_000, { ...MONEY_BOLD, formula: '=D12-F12' }),
    H12: cell(0.577778, { ...PERCENT, formula: '=G12/D12' }),

    A13: cell('KeyVault HSM Enclave'),
    B13: cell(1_600, MONEY),
    C13: cell(45, { format: 'number', dataType: 'integer' }),
    D13: cell(72_000, { ...MONEY_BOLD, formula: '=B13*C13' }),
    E13: cell(760, MONEY),
    F13: cell(34_200, { ...MONEY, formula: '=E13*C13' }),
    G13: cell(37_800, { ...MONEY_BOLD, formula: '=D13-F13' }),
    H13: cell(0.525, { ...PERCENT, formula: '=G13/D13' }),

    A14: cell('Publish Studio Add-on'),
    B14: cell(300, MONEY),
    C14: cell(90, { format: 'number', dataType: 'integer' }),
    D14: cell(27_000, { ...MONEY_BOLD, formula: '=B14*C14' }),
    E14: cell(90, MONEY),
    F14: cell(8_100, { ...MONEY, formula: '=E14*C14' }),
    G14: cell(18_900, { ...MONEY_BOLD, formula: '=D14-F14' }),
    H14: cell(0.7, { ...PERCENT, formula: '=G14/D14' }),

    A15: cell('Summe Produkte Q4', { bold: true }),
    B15: cell('', {}),
    C15: cell(505, { format: 'number', dataType: 'integer', bold: true, formula: '=SUM(C11:C14)' }),
    D15: cell(542_000, { ...MONEY_BOLD, formula: '=SUM(D11:D14)' }),
    E15: cell('', {}),
    F15: cell(235_700, { ...MONEY_BOLD, formula: '=SUM(F11:F14)' }),
    G15: cell(306_300, { ...MONEY_BOLD, formula: '=SUM(G11:G14)' }),
    H15: cell(0.565129, { ...PERCENT, bold: true, formula: '=G15/D15' }),

    A17: cell('Hinweis: Produktumsätze sind Umsatz der Q4-Zeile; Overhead ist in Zeile 4 enthalten.', { italic: true, fontSize: 9, text_color: '#64748b' }),
  },
};

export const initialGridTable2: TableObject = {
  id: 'table-grid-2',
  rows: 25,
  cols: 8,
  cells: {
    A1: cell('Annahmen und Szenarien 2027', { bold: true, fontSize: 14, alignment: 'left', text_color: '#0f172a' }),
    A2: cell('Parameter', HEADER),
    B2: cell('Wert', { ...HEADER, alignment: 'right' }),
    C2: cell('Einheit', HEADER),
    D2: cell('Kommentar', HEADER),

    A3: cell('Umsatzbasis 2026'),
    B3: cell(1_925_000, MONEY),
    C3: cell('USD'),
    D3: cell('Summe Q1–Q4 aus „Quartalsmodell“'),

    A4: cell('Planwachstum 2027'),
    B4: cell(0.08, PERCENT),
    C4: cell('%'),
    D4: cell('Konservatives Planszenario'),

    A5: cell('Planumsatz 2027', { bold: true }),
    B5: cell(2_079_000, { ...MONEY_BOLD, formula: '=B3*(1+B4)' }),
    C5: cell('USD'),
    D5: cell('Basis × (1 + Wachstum)'),

    A6: cell('Preissteigerung'),
    B6: cell(0.03, PERCENT),
    C6: cell('%'),
    D6: cell('Angenommene Preisentwicklung'),

    A7: cell('Kostenquote'),
    B7: cell(0.58, PERCENT),
    C7: cell('%'),
    D7: cell('Plankosten als Anteil des Umsatzes'),

    A8: cell('Plankosten 2027', { bold: true }),
    B8: cell(1_205_820, { ...MONEY_BOLD, formula: '=B5*B7' }),
    C8: cell('USD'),
    D8: cell('Planumsatz × Kostenquote'),

    A9: cell('Planergebnis 2027', { bold: true }),
    B9: cell(873_180, { ...MONEY_BOLD, formula: '=B5-B8' }),
    C9: cell('USD'),
    D9: cell('Umsatz − Kosten'),

    A10: cell('Planmarge 2027', { bold: true }),
    B10: cell(0.42, { ...PERCENT, bold: true, formula: '=B9/B5' }),
    C10: cell('%'),
    D10: cell('Ergebnis ÷ Umsatz'),

    A12: cell('Szenarienvergleich', { bold: true, fontSize: 12, text_color: '#0f172a' }),
    A13: cell('Szenario', HEADER),
    B13: cell('Umsatz 2027', { ...HEADER, alignment: 'right' }),
    C13: cell('Ergebnis 2027', { ...HEADER, alignment: 'right' }),
    D13: cell('Marge', { ...HEADER, alignment: 'right' }),

    A14: cell('Konservativ'),
    B14: cell(2_079_000, MONEY),
    C14: cell(873_180, MONEY),
    D14: cell(0.42, PERCENT),

    A15: cell('Basis'),
    B15: cell(2_200_000, MONEY),
    C15: cell(946_000, MONEY),
    D15: cell(0.43, PERCENT),

    A16: cell('Ambitioniert'),
    B16: cell(2_420_000, MONEY),
    C16: cell(1_065_000, MONEY),
    D16: cell(0.44, PERCENT),

    A18: cell('Hinweis: Werte sind ein synthetisches Planbeispiel, keine Prognose.', { italic: true, fontSize: 9, text_color: '#64748b' }),
  },
};

export const initialChart: ChartObject = {
  id: 'chart-revenue-1',
  chart_type: 'column',
  title: 'Umsatz, Kosten und Rohergebnis 2026',
  categories: ['Q1', 'Q2', 'Q3', 'Q4'],
  series: [
    { name: 'Umsatz', values: [420_000, 465_000, 498_000, 542_000], color: '#3b82f6' },
    { name: 'Kosten', values: [268_000, 279_000, 291_000, 305_000], color: '#f97316' },
    { name: 'Rohergebnis', values: [152_000, 186_000, 207_000, 237_000], color: '#10b981' },
  ],
  data_source_link: 'vgt://workspace/document/revenue-grid/range/B3:E5',
};

const gridDocument: WorkspaceDocument = {
  id: 'revenue-grid',
  title: 'Revenue-2026 · Quartalsmodell',
  kind: 'Grid',
  created_at: SEED_NOW - 3 * DAY,
  modified_at: SEED_NOW - 2 * HOUR,
  version: 1,
  theme_id: 'default',
  root_object_ids: ['table-grid-1', 'table-grid-2', 'chart-revenue-1'],
  objects: {
    'table-grid-1': { type: 'Table', data: initialGridTable },
    'table-grid-2': { type: 'Table', data: initialGridTable2 },
    'chart-revenue-1': { type: 'Chart', data: initialChart },
  },
  gridData: {
    sheets: [
      {
        id: 'sheet-1',
        name: 'Quartalsmodell',
        tableObjectId: 'table-grid-1',
        tabColor: '#2563eb',
        freezeRows: 2,
        freezeCols: 1,
        showGridlines: true,
        colWidths: { 0: 210, 1: 110, 2: 110, 3: 110, 4: 110, 5: 120, 6: 120, 7: 90 },
        conditionalFormatting: [
          { id: 'cf-margin-low', range: 'B6:E6', kind: 'cell', operator: 'less-than', value: 0.4, background: '#fef3c7', priority: 1 },
          { id: 'cf-margin-good', range: 'F6:F6', kind: 'cell', operator: 'greater-than', value: 0.4, background: '#dcfce7', priority: 2 },
        ],
      },
      {
        id: 'sheet-2',
        name: 'Annahmen & Szenarien',
        tableObjectId: 'table-grid-2',
        tabColor: '#0f766e',
        freezeRows: 2,
        freezeCols: 1,
        showGridlines: true,
        colWidths: { 0: 220, 1: 130, 2: 80, 3: 320 },
      },
    ],
    activeSheetId: 'sheet-1',
    namedRanges: [
      { id: 'nr-revenue', name: 'Umsatz_Q1_Q4', sheetId: 'sheet-1', range: 'B3:E3' },
      { id: 'nr-profit', name: 'Rohergebnis_Q1_Q4', sheetId: 'sheet-1', range: 'B5:E5' },
    ],
    properties: { title: 'Quartalsmodell 2026', author: 'Astraea Workspace Demo', currency: 'USD' },
  },
};

// ---------------------------------------------------------------------------------------------
// Writer-Beispiel: professioneller Bericht mit LIVE-Embed auf das Grid (keine Mockup-Tabelle)
// ---------------------------------------------------------------------------------------------

function paragraph(
  id: string,
  style: Partial<Paragraph['style']>,
  spans: Paragraph['spans'],
): Paragraph {
  return {
    id,
    style: {
      alignment: 'left',
      line_height: 1.6,
      space_before: 0,
      space_after: 8,
      ...style,
    },
    spans,
  };
}

export const initialWriterText: TextBlockObject = {
  id: 'writer-block-1',
  paragraphs: [
    paragraph('p-title', { style_name: 'title', line_height: 1.15, space_after: 4 }, [
      { text: 'Astraea Workspace — Architektur- und Quartalsbericht 2026', bold: true, font_size_pt: 23 },
    ]),
    paragraph('p-subtitle', { style_name: 'subtitle', line_height: 1.4, space_after: 18 }, [
      { text: 'Board Review · Release 0.1 Alpha · Stand: 18. Oktober 2026', italic: true, font_size_pt: 11, text_color: '#475569' },
    ]),

    paragraph('p-exec-heading', { style_name: 'heading1', heading_level: 1, line_height: 1.3, space_before: 4, space_after: 8, keep_with_next: true }, [
      { text: 'Executive Summary', bold: true, font_size_pt: 16 },
    ]),
    paragraph('p-exec-body', {}, [
      {
        text:
          'Astraea Workspace ist eine local-first Arbeitsumgebung: Dokumente bleiben ohne '
          + 'Cloud-Zwang nutzbar, Netzwerkzugriffe sind explizit richtliniengebunden, und die '
          + 'verschlüsselte Ablage gehört zur Workspace-Core-Grenze — nicht zur Oberfläche. '
          + 'Im Geschäftsjahr 2026 wurden 1.925.000 USD Umsatz bei 1.143.000 USD Kosten '
          + 'erwirtschaftet. Das entspricht einem Rohergebnis von 782.000 USD und einer '
          + 'Marge von 40,6 %.',
      },
    ]),
    paragraph(
      'p-exec-callout',
      {
        space_before: 6,
        space_after: 14,
        background_color: '#eef6ff',
        shading: { fillColor: '#eef6ff', opacityPercent: 100 },
        borders: {
          left: { style: 'solid', widthPt: 3, color: '#2563eb', spacingPt: 6 },
          top: { style: 'solid', widthPt: 0.5, color: '#bfdbfe', spacingPt: 4 },
          bottom: { style: 'solid', widthPt: 0.5, color: '#bfdbfe', spacingPt: 4 },
          right: { style: 'solid', widthPt: 0.5, color: '#bfdbfe', spacingPt: 4 },
        },
      },
      [
        { text: 'Entscheidung erforderlich: ', bold: true, text_color: '#1d4ed8' },
        {
          text:
            'Das Board bestätigt den Alpha-Umfang (Writer, Grid, Present, Notes, Tasks) und '
            + 'die Reihenfolge der verbleibenden nativen Gates. Die Zahlen in Abschnitt 2 sind '
            + 'eine Live-Referenz auf das Grid-Beispieldokument und werden dort aktualisiert.',
        },
      ],
    ),

    paragraph('p-quartal-heading', { style_name: 'heading1', heading_level: 1, line_height: 1.3, space_before: 10, space_after: 6, keep_with_next: true }, [
      { text: 'Quartalszahlen 2026', bold: true, font_size_pt: 16 },
    ]),
    paragraph('p-quartal-intro', { space_after: 10 }, [
      {
        text:
          'Die folgende Tabelle ist keine eingefügte Kopie. Sie ist ein Live-Bereich des '
          + 'Workspace-Dokuments „Revenue-2026 · Quartalsmodell“; das Grid bleibt die einzige '
          + 'Datenquelle. Wird dort eine Zelle geändert, aktualisiert der Workspace-Fabric-Pfad '
          + 'diesen Snapshot über refreshWriterWorkspaceEmbeds — der Bericht zeigt danach die '
          + 'neuen Werte.',
      },
    ]),
    paragraph('p-quartal-caption', { style_name: 'caption', line_height: 1.4, space_after: 14 }, [
      { text: 'Quelle: Revenue-2026.vgrid · Sheet „Quartalsmodell“ · Bereich A2:F6 · Modus: Live', italic: true, font_size_pt: 9, text_color: '#64748b' },
    ]),

    paragraph('p-chart-heading', { style_name: 'heading2', heading_level: 2, line_height: 1.3, space_before: 8, space_after: 6, keep_with_next: true }, [
      { text: 'Umsatz- und Ergebnisverlauf', bold: true, font_size_pt: 14 },
    ]),
    paragraph('p-chart-anchor', { space_after: 12 }, [
      {
        text:
          'Umsatz und Rohergebnis wachsen über alle vier Quartale; im vierten Quartal liegt die '
          + 'Marge bei 43,7 %. Die Darstellung wird aus demselben Grid-Dokument gespeist wie die '
          + 'Tabelle oben und ist damit ebenfalls eine Live-Referenz.',
      },
    ]),

    paragraph('p-massnahmen-heading', { style_name: 'heading1', heading_level: 1, line_height: 1.3, space_before: 10, space_after: 6, keep_with_next: true }, [
      { text: 'Maßnahmen und nächste Schritte', bold: true, font_size_pt: 16 },
    ]),
    paragraph('p-massnahme-1', { list_style: 'bullet', list_level: 0, left_indent_mm: 8, space_after: 4 }, [
      { text: 'Native Dateipersistenz als Standardpfad: „Gespeichert“ erscheint erst nach bestätigtem Dateischreiben (Name, Größe, SHA-256).' },
    ]),
    paragraph('p-massnahme-2', { list_style: 'bullet', list_level: 0, left_indent_mm: 8, space_after: 4 }, [
      { text: 'Writer/Grid-Integration: Live-Bereiche statt kopierter Tabellen; ein Refresh-Pfad, eine Snapshot-Grenze.' },
    ]),
    paragraph('p-massnahme-3', { list_style: 'bullet', list_level: 0, left_indent_mm: 8, space_after: 4 }, [
      { text: 'Release-Gates: Installer, Export-Integrität und Modul-Kennzeichnung werden vor der Alpha-Auslieferung geprüft.' },
    ]),
    paragraph('p-massnahme-4', { list_style: 'bullet', list_level: 0, left_indent_mm: 8, space_after: 12 }, [
      { text: 'Board-Entscheidung: Restumfang der Alpha und Termin für den nativen Gegentest bestätigen.' },
    ]),

    paragraph('p-risiken-heading', { style_name: 'heading2', heading_level: 2, line_height: 1.3, space_before: 8, space_after: 6, keep_with_next: true }, [
      { text: 'Risiken und offene Punkte', bold: true, font_size_pt: 14 },
    ]),
    paragraph('p-risiko-1', { list_style: 'number', list_level: 0, left_indent_mm: 8, space_after: 4 }, [
      { text: 'Native Multi-Monitor- und Datei-Gates sind nur auf echter Windows-Hardware abschließend prüfbar.' },
    ]),
    paragraph('p-risiko-2', { list_style: 'number', list_level: 0, left_indent_mm: 8, space_after: 4 }, [
      { text: 'Große Dokumente nahe der Bild- bzw. Dateigrenze brauchen einen bewussten Lasttest; die Grenzen sind benannt, nicht still.' },
    ]),
    paragraph('p-risiko-3', { list_style: 'number', list_level: 0, left_indent_mm: 8, space_after: 12 }, [
      { text: 'Preview-Module bleiben als Vorschau gekennzeichnet und werden nicht als Kernfunktion zugesagt.' },
    ]),

    paragraph('p-fazit-heading', { style_name: 'heading1', heading_level: 1, line_height: 1.3, space_before: 10, space_after: 6, keep_with_next: true }, [
      { text: 'Fazit', bold: true, font_size_pt: 16 },
    ]),
    paragraph('p-fazit-body', { space_after: 0 }, [
      {
        text:
          'Release 0.1 ist ein ehrlicher Alpha-Stand: die Kernmodule funktionieren im lokalen '
          + 'Arbeitsfluss, die Integritätsgrenzen sind sichtbar und benannt, und keine Anzeige '
          + 'behauptet eine Fähigkeit, die nicht belegt ist. Der nächste Schritt ist die '
          + 'natürliche Nutzerprobe am gebauten Fenster — erst sie macht aus „implementiert“ '
          + 'ein „abgenommen“.',
      },
    ]),
  ],
};

const writerDocumentBase: WorkspaceDocument = {
  id: 'strategy-writer',
  title: 'Astraea Workspace · Architektur- und Quartalsbericht 2026',
  kind: 'Writer',
  created_at: SEED_NOW - 6 * DAY,
  modified_at: SEED_NOW - 90 * 60_000,
  version: 1,
  theme_id: 'default',
  root_object_ids: ['writer-block-1'],
  objects: {
    'writer-block-1': { type: 'TextBlock', data: initialWriterText },
  },
  writerData: {
    pageSetup: {
      ...SEED_PAGE_SETUP,
      headerText: 'Astraea Workspace · Open Core 0.1 Alpha',
      footerText: 'Vertraulich · Board Review 2026 · Seite {PAGE} von {NUMPAGES}',
    },
    tables: [],
  },
};

/**
 * Die Live-Referenzen des Writer-Beispiels.
 *
 * Beide werden mit dem **vorhandenen** Einfügepfad erzeugt (`createWriterWorkspaceEmbed`),
 * damit Seed und UI nie zwei verschiedene Snapshot-Formate schreiben. Der Grid-Range-Embed
 * zeigt auf `revenue-grid/table-grid-1!A2:F6`, der Diagramm-Embed auf das Chart-Objekt
 * desselben Grid-Dokuments. Der spätere Refresh läuft über `refreshWriterWorkspaceEmbeds`
 * im bestehenden `useWorkspaceDocumentUpdates`-Pfad.
 */
const writerWorkspaceEmbeds = [
  createWriterWorkspaceEmbed({
    writerDocument: writerDocumentBase,
    sourceDocument: gridDocument,
    kind: 'grid-range',
    mode: 'Live',
    sourceObjectId: 'table-grid-1',
    sourceSelector: 'A2:F6',
    anchorParagraphId: 'p-quartal-intro',
    id: 'embed-revenue-quarters',
    now: SEED_NOW - 90 * 60_000,
  }),
  createWriterWorkspaceEmbed({
    writerDocument: writerDocumentBase,
    sourceDocument: gridDocument,
    kind: 'grid-chart',
    mode: 'Live',
    sourceObjectId: 'chart-revenue-1',
    anchorParagraphId: 'p-chart-anchor',
    id: 'embed-revenue-chart',
    now: SEED_NOW - 90 * 60_000,
  }),
];

const writerDocument: WorkspaceDocument = {
  ...writerDocumentBase,
  writerData: { ...writerDocumentBase.writerData!, workspaceEmbeds: writerWorkspaceEmbeds },
};

// ---------------------------------------------------------------------------------------------
// Present-Beispiel: Board-Review-Deck (Inhalt passt zu Bericht und Quartalszahlen)
// ---------------------------------------------------------------------------------------------

const PRESENT_SLIDES: PresentSlide[] = [
  {
    id: 'slide-1',
    sectionId: 'sec-overview',
    title: 'Astraea Workspace · Board Review 2026',
    subtitle: 'Local-first Produktivität, explizite Grenzen, belastbare Alpha',
    category: 'Board Review',
    layout: 'cards',
    cards: [
      { id: 'card-1', title: '01 · Local-first', description: 'Kernmodule arbeiten ohne Cloud-Zwang; Netzwerkzugriffe sind richtliniengebunden und auditierbar.', colorTheme: 'blue' },
      { id: 'card-2', title: '02 · Verschlüsselte Ablage', description: 'Die Container- und Schlüsselgrenze liegt im Workspace Core; die Oberfläche behauptet keine eigene Krypto.', colorTheme: 'emerald' },
      { id: 'card-3', title: '03 · Workspace Fabric', description: 'Live-Referenzen verbinden Writer, Grid und Present über genau einen Snapshot- und Refresh-Pfad.', colorTheme: 'purple' },
    ],
    speakerNotes:
      'Einstieg: Warum local-first für die Zielkunden zählt. Drei Karten = drei Säulen. Betonen, dass die Sicherheitsgrenze im Core liegt und die UI sie nur darstellt.',
  },
  {
    id: 'slide-2',
    sectionId: 'sec-overview',
    title: 'Agenda und Entscheidungsbedarf',
    subtitle: 'Was heute entschieden wird — und was bewusst offen bleibt',
    category: 'Agenda',
    layout: 'bullet-list',
    bulletPoints: [
      'Quartalszahlen 2026 und Produktmix (Live aus Revenue-2026)',
      'Architektur und Sicherheitsgrenzen: Core, Vault, NetGate',
      'Release-Status Alpha 0.1: belegte Kernpfade und offene native Gates',
      'Entscheidung: Alpha-Umfang bestätigen, Termin für den Nutzer-Gegentest setzen',
    ],
    speakerNotes:
      'Agenda kurz halten. Den Unterschied zwischen „implementiert“, „getestet“ und „nativ abgenommen“ ausdrücklich nennen.',
  },
  {
    id: 'slide-3',
    sectionId: 'sec-financials',
    title: 'Umsatz- und Ergebnisentwicklung 2026',
    subtitle: 'Live-Referenz auf das Grid-Dokument „Revenue-2026“',
    category: 'Live Financials',
    layout: 'chart',
    chartReferenceId: 'ref-chart-present',
    speakerNotes:
      'Auf die Live-Kopplung hinweisen: Ändert sich eine Zelle im Quartalsmodell, folgt diese Darstellung über den Workspace-Fabric-Pfad. Umsatz 1.925.000 USD, Rohergebnis 782.000 USD, Marge 40,6 %.',
  },
  {
    id: 'slide-4',
    sectionId: 'sec-security',
    title: 'Architektur und Sicherheitsgrenzen',
    subtitle: 'Eine Grenze pro Verantwortung — nichts wird doppelt behauptet',
    category: 'Sovereign Architecture',
    layout: 'bullet-list',
    bulletPoints: [
      'Eine Krypto-Grenze: verschlüsselter Container und Schlüsselablage im Workspace Core',
      'NetGate entscheidet Netzwerkzugriffe explizit (allow/deny) und protokolliert sie',
      'Vault zeigt nur, was er gemessen hat — Integrität bleibt „unverified“, bis sie geprüft ist',
      'Import-/Export-Grenzen sind begrenzt und melden Informationsverlust sichtbar',
    ],
    speakerNotes:
      'Keine Sicherheitszusage aus Marketing-Sprache ableiten. Jede Aussage an eine Messung oder einen Test binden.',
  },
  {
    id: 'slide-5',
    sectionId: 'sec-security',
    title: 'Release-Status Alpha 0.1',
    subtitle: 'Kernmodule grün, Integrität im Standardpfad, native Gates benannt',
    category: 'Release Status',
    layout: 'bullet-list',
    bulletPoints: [
      'Writer: Text, Formatierung, Bilder, Tabellen und Save/Reopen als Kernpfad belegt',
      'Grid: reales Quartalsmodell mit Formeln, Formaten und Live-Bereichen für Writer',
      'Integrität: „Gespeichert“ nur nach bestätigtem Dateischreiben (Name, Größe, SHA-256)',
      'Offen: native Multi-Monitor-, Installer- und Export-Gegentests am Fenster',
    ],
    speakerNotes:
      'Status ehrlich halten: Alpha bedeutet getestete Kernpfade und benannte Rest-Gates. Das Board bestätigt den Umfang; die native Abnahme bleibt der letzte Schritt.',
  },
];

const presentDocument: WorkspaceDocument = {
  id: 'board-present',
  title: 'Board-Review · Q4 2026',
  kind: 'Present',
  created_at: SEED_NOW - 2 * DAY,
  modified_at: SEED_NOW - 3 * HOUR,
  version: 1,
  theme_id: 'default',
  root_object_ids: ['ref-chart-present'],
  objects: {
    'ref-chart-present': {
      type: 'WorkspaceReference',
      data: {
        id: 'ref-chart-present',
        uri: 'vgt://workspace/document/revenue-grid/object/chart-revenue-1',
        mode: 'Live',
      },
    },
  },
  presentData: {
    slides: PRESENT_SLIDES,
    sections: DEFAULT_PRESENT_SECTIONS,
    theme: 'dark',
    themeId: 'dark',
    aspectRatio: '16:9',
    collaboration: {
      activity: [
        { id: 'act-1', timestamp: SEED_NOW - 4 * HOUR, actor: 'Release Lead', action: 'review', summary: 'Deck für das Board-Review eingereicht (Alpha 0.1).' },
        { id: 'act-2', timestamp: SEED_NOW - 2 * HOUR, actor: 'Finance Review', action: 'comment', slideId: 'slide-3', summary: 'Quartalszahlen gegen Revenue-2026 geprüft.' },
      ],
      versions: [],
      review: { status: 'in-review', reviewMode: false, approvals: [] },
    },
  },
};

// ---------------------------------------------------------------------------------------------
// Notes-Beispiel: Projektjournal, das zu Bericht und Board-Review passt
// ---------------------------------------------------------------------------------------------

const projectNotesSection = {
  id: 'sec-project-journal',
  title: 'Projektjournal · Release 0.1',
  pages: [
    {
      id: 'page-release-journal',
      title: 'Release 0.1 · Arbeitsjournal',
      content: `# Release 0.1 · Arbeitsjournal

Ziel dieser Runde: **Kernmodule belastbar machen, Integrität ehrlich anzeigen.**

## Erledigt
- [x] Writer-Kernpfad (Text, Formatierung, Bilder, Tabellen) mit Release-Zeugen geprüft
- [x] Grid-Beispiel als echtes Quartalsmodell mit Formeln und Formaten
- [x] Writer-Quartalstabelle als **Live-Bereich** auf Revenue-2026 umgestellt
- [x] „Gespeichert“ an bestätigtes Dateischreiben gebunden
- [ ] Nativer Gegentest: Speichern → Prozess neu starten → Wiederöffnen

## Offene Entscheidungen
1. Alpha-Umfang bestätigen (Writer, Grid, Present, Notes, Tasks)
2. Termin für den nativen Gegentest festlegen
3. Preview-Module weiter als Vorschau kennzeichnen

Verknüpft: [[Board-Review · Q4 2026]] und [[Revenue-2026 · Quartalsmodell]]`,
      tags: ['release', 'journal', 'beta'],
      backlinks: ['page-board-review'],
      last_modified: SEED_NOW - 4 * HOUR,
    },
    {
      id: 'page-board-review',
      title: 'Board-Review · Q4 2026',
      content: `# Board-Review · Q4 2026

## Kennzahlen (Live aus Revenue-2026)
- Umsatz GJ 2026: **1.925.000 USD**
- Kosten GJ 2026: **1.143.000 USD**
- Rohergebnis: **782.000 USD**
- Marge: **40,6 %**

## Botschaften
1. Local-first ist Produktversprechen, nicht Marketing: Kernmodule funktionieren offline.
2. Sicherheitsgrenzen sind benannt und getestet — keine unbelegte Zusage.
3. Die Alpha ist ehrlich: belegte Kernpfade, offene native Gates.

## Entscheidungsvorlage
Bestätigung des Alpha-Umfangs und Freigabe des nativen Gegentests.

Zurück zum [[Release 0.1 · Arbeitsjournal]].`,
      tags: ['board', 'review', 'finance'],
      backlinks: ['page-release-journal'],
      last_modified: SEED_NOW - 3 * HOUR,
    },
  ],
};

const notesDocument: WorkspaceDocument = {
  id: 'notes-sovereign',
  title: 'Astraea Projektjournal (Alpha 0.1)',
  kind: 'Notes',
  created_at: SEED_NOW - 5 * DAY,
  modified_at: SEED_NOW - 4 * HOUR,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
  noteData: {
    id: 'nb-engineering',
    title: 'Astraea Projektjournal (Alpha 0.1)',
    sections: [projectNotesSection, ...DEFAULT_NOTEBOOKS[0]!.sections],
  },
};

// ---------------------------------------------------------------------------------------------
// Tasks-Beispiel: echtes Projektboard für Release 0.1
// ---------------------------------------------------------------------------------------------

const workManagementDocument: WorkspaceDocument = {
  id: 'work-management',
  title: 'Release-0.1 · Projektboard',
  kind: 'Tasks',
  created_at: SEED_NOW - 4 * DAY,
  modified_at: SEED_NOW - 5 * HOUR,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
  workManagementData: {
    tasks: releaseTasks,
    cards: releaseCards,
    milestones: [
      { id: 'm-1', name: 'Phase A · Kanonischer Workspace-Unterbau', startDate: '2026-09-01', endDate: '2026-09-12', progress: 100 },
      { id: 'm-2', name: 'Phase B · Kernmodule Writer & Grid', startDate: '2026-09-15', endDate: '2026-10-10', progress: 78 },
      { id: 'm-3', name: 'Phase C · Integrität, Installer & Release-Gates', startDate: '2026-10-13', endDate: '2026-11-07', progress: 25 },
      { id: 'm-4', name: 'Phase D · Alpha-Feedback & native Abnahme', startDate: '2026-11-10', endDate: '2026-12-05', progress: 0 },
    ],
  },
};

// ---------------------------------------------------------------------------------------------
// Whiteboard-Beispiel: echte Systemarchitektur (Frames, Knoten, Verbindungen, Review-Notizen)
// ---------------------------------------------------------------------------------------------

const whiteboardItems: WhiteboardObjectModel[] = [
  { id: 'wb-title', type: 'text', x: 40, y: 16, width: 760, height: 34, text: 'Astraea Workspace · Systemarchitektur (Alpha 0.1)', color: 'cyan', zIndex: 2 },
  {
    id: 'wb-frame-architecture',
    type: 'frame',
    x: 40,
    y: 60,
    width: 1180,
    height: 560,
    text: 'Architektur · Release 0.1',
    zIndex: 0,
  },
  { id: 'wb-ui', type: 'process', x: 80, y: 120, width: 240, height: 78, text: 'Editor-Oberflächen\nWriter · Grid · Present', zIndex: 1 },
  { id: 'wb-fabric', type: 'process', x: 400, y: 120, width: 250, height: 78, text: 'Workspace Fabric\nLive-Referenzen · Refresh', color: 'cyan', zIndex: 1 },
  { id: 'wb-core', type: 'process', x: 740, y: 120, width: 250, height: 78, text: 'Workspace Core (Rust)\nPersistenz · Krypto-Grenze', color: 'purple', zIndex: 1 },
  { id: 'wb-vault', type: 'process', x: 80, y: 330, width: 240, height: 90, text: 'KeyVault\nDPAPI · Geräteschlüssel', zIndex: 1 },
  { id: 'wb-netgate', type: 'decision', x: 400, y: 330, width: 250, height: 90, text: 'NetGate\nPolicy: allow/deny + Audit', zIndex: 1 },
  { id: 'wb-store', type: 'process', x: 740, y: 330, width: 250, height: 90, text: 'Verschlüsselter Datei-Store\nVWC · 128-MiB-Grenze', zIndex: 1 },
  { id: 'wb-conn-1', type: 'connector', x: 320, y: 156, width: 80, height: 1, text: '', fromId: 'wb-ui', toId: 'wb-fabric', connectorStyle: { route: 'straight', autoRoute: true }, zIndex: 1 },
  { id: 'wb-conn-2', type: 'connector', x: 650, y: 156, width: 90, height: 1, text: '', fromId: 'wb-fabric', toId: 'wb-core', connectorStyle: { route: 'straight', autoRoute: true }, zIndex: 1 },
  { id: 'wb-conn-3', type: 'connector', x: 865, y: 198, width: 1, height: 132, text: '', fromId: 'wb-core', toId: 'wb-store', connectorStyle: { route: 'straight', autoRoute: true }, zIndex: 1 },
  { id: 'wb-conn-4', type: 'connector', x: 525, y: 198, width: 1, height: 132, text: '', fromId: 'wb-fabric', toId: 'wb-netgate', connectorStyle: { route: 'straight', autoRoute: true }, zIndex: 1 },
  { id: 'wb-conn-5', type: 'connector', x: 200, y: 198, width: 1, height: 132, text: '', fromId: 'wb-ui', toId: 'wb-vault', connectorStyle: { route: 'straight', autoRoute: true }, zIndex: 1 },
  { id: 'wb-note-1', type: 'sticky', x: 80, y: 470, width: 240, height: 120, text: 'Offene Frage: Ist der Recovery-Pfad nach IndexedDB-Verlust nativ belegt?', color: 'yellow', zIndex: 2 },
  { id: 'wb-note-2', type: 'sticky', x: 400, y: 470, width: 250, height: 120, text: 'Prüfen: Live-Range-Refresh bei Grid-Änderung ist über refreshWriterWorkspaceEmbeds getestet.', color: 'cyan', zIndex: 2 },
  { id: 'wb-note-3', type: 'sticky', x: 740, y: 470, width: 250, height: 120, text: 'Entscheidung: Welche Preview-Module bleiben in Alpha 0.1 sichtbar?', color: 'purple', zIndex: 2 },
];

const whiteboardDocument: WorkspaceDocument = {
  id: 'whiteboard-canvas',
  title: 'Systemarchitektur · Release 0.1',
  kind: 'Whiteboard',
  created_at: SEED_NOW - 2 * DAY,
  modified_at: SEED_NOW - 6 * HOUR,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
  whiteboardData: {
    items: whiteboardItems,
    view: {
      backgroundStyle: 'dots',
      gridSize: 20,
      showRulers: true,
      guides: [],
      bookmarks: [],
      presentationPath: [],
      snapToGrid: true,
      snapToGuides: true,
    },
  },
};

// ---------------------------------------------------------------------------------------------
// PDF-Beispiel: echtes Review-Dokument statt „Sample Review Document“
// ---------------------------------------------------------------------------------------------

const pdfPages: PdfPageModel[] = [
  {
    pageNumber: 1,
    title: 'Astraea Workspace · Release-Review 0.1',
    subtitle: 'Board Review · Integrität, Grenzen und Alpha-Umfang',
    decorations: { headerText: 'Astraea Workspace · Open Core 0.1 Alpha', footerText: 'Vertraulich · Board Review 2026 · Seite 1' },
    sections: [
      { id: 'pdf-1-kicker', type: 'header', content: '1. Executive Summary' },
      {
        id: 'pdf-1-summary',
        type: 'paragraph',
        content:
          'Release 0.1 macht die Kernmodule Writer, Grid, Present, Notes und Tasks als ehrliche Alpha verfügbar. Dokumente bleiben local-first nutzbar; Netzwerkzugriffe sind richtliniengebunden; die verschlüsselte Ablage gehört zur Workspace-Core-Grenze.',
      },
      {
        id: 'pdf-1-callout',
        type: 'callout',
        content:
          'Entscheidungsvorlage: Alpha-Umfang bestätigen und den nativen Gegentest terminieren. Alle Kennzahlen dieses Dokuments stammen aus dem Grid-Beispieldokument Revenue-2026.',
      },
      { id: 'pdf-1-finance-header', type: 'header', content: '2. Quartalszahlen 2026' },
      {
        id: 'pdf-1-finance',
        type: 'paragraph',
        content:
          'Umsatz 1.925.000 USD, Kosten 1.143.000 USD, Rohergebnis 782.000 USD, Marge 40,6 %. Das vierte Quartal trägt 542.000 USD Umsatz bei einer Marge von 43,7 %.',
      },
    ],
  },
  {
    pageNumber: 2,
    title: 'Architektur und Sicherheitsgrenzen',
    subtitle: 'Eine Verantwortung pro Grenze — keine doppelte Zusage',
    decorations: { headerText: 'Astraea Workspace · Architektur', footerText: 'Vertraulich · Board Review 2026 · Seite 2' },
    sections: [
      { id: 'pdf-2-header-1', type: 'header', content: '3. Kernarchitektur' },
      {
        id: 'pdf-2-arch',
        type: 'paragraph',
        content:
          'Der Workspace Core (Rust) besitzt Persistenz und Krypto-Grenze. Die Oberflächen lesen und schreiben ausschließlich über das kanonische Dokumentmodell. Das Workspace Fabric verbindet Live-Referenzen zwischen Dokumenten, ohne eine zweite Kopie der Daten zu erzeugen.',
      },
      { id: 'pdf-2-header-2', type: 'header', content: '4. Sicherheitsgrenzen' },
      {
        id: 'pdf-2-security',
        type: 'paragraph',
        content:
          'NetGate entscheidet Netzwerkzugriffe explizit und protokolliert sie. KeyVault ist die Geräte-Schlüsselgrenze. Der Vault zeigt nur gemessene Zustände; nicht geprüfte Integrität wird als „unverified“ bezeichnet und nicht als sicher behauptet.',
      },
      {
        id: 'pdf-2-callout',
        type: 'callout',
        content:
          'Keine Anzeige in diesem Dokument behauptet eine Fähigkeit, die nicht durch Implementierung, Test oder native Probe belegt ist.',
      },
    ],
  },
  {
    pageNumber: 3,
    title: 'Release-Gates und nächste Schritte',
    subtitle: 'Belegt, getestet, nativ offen — getrennt benannt',
    decorations: { headerText: 'Astraea Workspace · Release-Gates', footerText: 'Vertraulich · Board Review 2026 · Seite 3' },
    sections: [
      { id: 'pdf-3-header-1', type: 'header', content: '5. Belegstand' },
      {
        id: 'pdf-3-status',
        type: 'paragraph',
        content:
          'Writer-Kernpfad, Grid-Quartalsmodell und Live-Referenz sind automatisiert belegt. „Gespeichert“ erscheint erst nach bestätigtem Dateischreiben (Name, Größe, SHA-256), nicht nach einer UI-Aktion.',
      },
      { id: 'pdf-3-header-2', type: 'header', content: '6. Offene native Gates' },
      {
        id: 'pdf-3-open',
        type: 'paragraph',
        content:
          'Native Multi-Monitor-Präsentation, Installer-Lauf und Export-Gegentests werden am gebauten Fenster abgenommen. Bis dahin bleibt der Status NATIVE_UNVERIFIED — das ist Teil der Alpha-Wahrheit, nicht ein Schönheitsfehler.',
      },
      {
        id: 'pdf-3-closing',
        type: 'callout',
        content: 'Nächster Schritt: Board-Entscheidung, dann nativer Gegentest mit der gebauten Alpha.',
      },
    ],
  },
];

const pdfDocument: WorkspaceDocument = {
  id: 'pdf-whitepaper',
  title: 'Astraea-Release-Review-0.1.pdf',
  kind: 'PdfStudio',
  created_at: SEED_NOW - 7 * DAY,
  modified_at: SEED_NOW - 8 * HOUR,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
  pdfData: {
    numPages: pdfPages.length,
    pages: pdfPages,
    annotations: [
      {
        id: 'anno-release-gate',
        page: 1,
        type: 'highlight',
        text: 'Entscheidungsvorlage: Alpha-Umfang bestätigen und den nativen Gegentest terminieren.',
        color: '#f59e0b',
        author: 'Sovereign Auditor',
        createdAt: SEED_NOW - 2 * HOUR,
      },
    ],
    redactions: [],
  },
};

// ---------------------------------------------------------------------------------------------
// Vault-Beispiel: echte Projektdateien, ehrlicher Integritätsstatus
// ---------------------------------------------------------------------------------------------

const seedVaultFiles: VaultFile[] = [
  {
    id: 'vault-file-grid',
    name: 'Revenue-2026.vgrid',
    kind: 'Grid',
    sizeBytes: 18_432,
    encryptedHash: '4f8c1d2a6b3e5f7091a2c4d6e8f0b1c3d5e7f90123456789abcdef0123456789',
    lastModified: SEED_NOW - 2 * HOUR,
    sourceType: 'workspace-document',
    documentId: 'revenue-grid',
    documentVersion: 1,
    integrityState: 'unverified',
    favorite: true,
    pinned: true,
    tags: ['finance', 'q4', 'live-source'],
    createdAt: SEED_NOW - 3 * DAY,
    owner: 'Release Team',
    association: { kind: 'document', documentId: 'revenue-grid', documentKind: 'Grid' } as never,
  },
  {
    id: 'vault-file-writer',
    name: 'Architektur-Quartalsbericht.vwriter',
    kind: 'Writer',
    sizeBytes: 46_080,
    encryptedHash: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678abcdef0123456789abcdef01',
    lastModified: SEED_NOW - 90 * 60_000,
    sourceType: 'workspace-document',
    documentId: 'strategy-writer',
    documentVersion: 1,
    integrityState: 'unverified',
    favorite: true,
    tags: ['board', 'review'],
    createdAt: SEED_NOW - 6 * DAY,
    owner: 'Release Team',
  },
  {
    id: 'vault-file-present',
    name: 'Board-Review-Q4.vpresent',
    kind: 'Present',
    sizeBytes: 30_720,
    encryptedHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    lastModified: SEED_NOW - 3 * HOUR,
    sourceType: 'workspace-document',
    documentId: 'board-present',
    documentVersion: 1,
    integrityState: 'unverified',
    tags: ['board', 'presentation'],
    createdAt: SEED_NOW - 2 * DAY,
    owner: 'Release Team',
  },
  {
    id: 'vault-file-pdf',
    name: 'Astraea-Release-Review-0.1.pdf',
    kind: 'PdfStudio',
    sizeBytes: 92_160,
    encryptedHash: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
    lastModified: SEED_NOW - 8 * HOUR,
    sourceType: 'workspace-document',
    documentId: 'pdf-whitepaper',
    documentVersion: 1,
    integrityState: 'unverified',
    tags: ['review', 'pdf'],
    createdAt: SEED_NOW - 7 * DAY,
    owner: 'Release Team',
  },
  {
    id: 'vault-file-policy',
    name: 'Sovereign-Policy-Auszug.txt',
    kind: 'PdfStudio',
    sizeBytes: 1_024,
    encryptedHash: '2233445566778899aabbccddeeff00112233445566778899aabbccddeeff0011',
    lastModified: SEED_NOW - 30 * HOUR,
    sourceType: 'attachment',
    mimeType: 'text/plain',
    payloadDataUrl: 'data:text/plain;base64,UnJlbGVhc2UgMC4xIC0gdmVydHJhdWxpY2hlciBBdXN6dWcgZGVyIFNvdmVyZWlnbi1Qb2xpY3kuIEtlaW5lIG9wZXJhdGl2ZSBa dXNhZ2Uu',
    integrityState: 'unverified',
    tags: ['policy', 'reference'],
    createdAt: SEED_NOW - 30 * HOUR,
    owner: 'Release Team',
  },
];

const vaultDocument: WorkspaceDocument = {
  id: 'vault-enclave',
  title: 'Astraea-Vault · Projektdateien',
  kind: 'Vault',
  created_at: SEED_NOW - 8 * DAY,
  modified_at: SEED_NOW - 12 * HOUR,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
  vaultData: {
    files: seedVaultFiles,
    shares: [],
  },
};

// ---------------------------------------------------------------------------------------------
// Publish-Beispiel: echtes Editorial-Layout (Titel, Deck, zwei Spalten, Pull-Quote, Seite 2)
// ---------------------------------------------------------------------------------------------

const publishBase = createPublishProject({ title: 'Astraea Workspace · Editorial Review 0.1', pages: 2, marginMm: 15, bleedMm: 3 });
const publishPage1 = publishBase.pages[0]!;
const publishPage2 = publishBase.pages[1]!;
const publishPage1Frames = [
  createPublishFrame('text', publishPage1.id, 0, {
    id: 'pub-ed-kicker',
    name: 'Kicker',
    xMm: 15,
    yMm: 16,
    widthMm: 180,
    heightMm: 7,
    content: 'ASTRAEA WORKSPACE · OPEN CORE 0.1 BETA · BOARD REVIEW',
    fontSizePt: 8,
    fontFamily: 'system-ui, sans-serif',
    semanticRole: 'H2',
  }),
  createPublishFrame('text', publishPage1.id, 0, {
    id: 'pub-ed-title',
    name: 'Titel',
    xMm: 15,
    yMm: 24,
    widthMm: 180,
    heightMm: 24,
    content: 'Souveräne Produktivität: Architektur- und Quartalsbericht 2026',
    fontSizePt: 25,
    fontFamily: 'Georgia, serif',
    paragraphStyleId: 'style-p-heading1',
    semanticRole: 'H1',
  }),
  createPublishFrame('text', publishPage1.id, 0, {
    id: 'pub-ed-deck',
    name: 'Deck',
    xMm: 15,
    yMm: 51,
    widthMm: 180,
    heightMm: 18,
    content:
      'Ein Editorial-Review für den Vorstand: Was Release 0.1 leistet, welche Grenzen bewusst bestehen bleiben und welche Entscheidungen jetzt anstehen.',
    fontSizePt: 12,
    fontFamily: 'Georgia, serif',
    semanticRole: 'P',
  }),
  createPublishFrame('text', publishPage1.id, 0, {
    id: 'pub-ed-body-1',
    name: 'Kolumne 1',
    xMm: 15,
    yMm: 76,
    widthMm: 87,
    heightMm: 196,
    content:
      'Astraea Workspace ist eine local-first Arbeitsumgebung. Kernmodule arbeiten ohne Cloud-Zwang, Netzwerkzugriffe sind richtliniengebunden und auditierbar, und die verschlüsselte Ablage gehört zur Workspace-Core-Grenze. Diese Grenze ist bewusst gezogen: die Oberfläche behauptet keine eigene Kryptografie, sie zeigt den gemessenen Zustand des Core.',
    semanticRole: 'P',
  }),
  createPublishFrame('text', publishPage1.id, 0, {
    id: 'pub-ed-body-2',
    name: 'Kolumne 2',
    xMm: 108,
    yMm: 76,
    widthMm: 87,
    heightMm: 196,
    content:
      'Die Quartalszahlen dieser Ausgabe sind eine Live-Referenz auf das Grid-Dokument Revenue-2026: 1.925.000 USD Umsatz, 1.143.000 USD Kosten, 782.000 USD Rohergebnis und 40,6 % Marge. Ändert sich eine Zelle, folgt die Darstellung über den Workspace-Fabric-Pfad — es gibt keine zweite Datenkopie in der Publikation.',
    semanticRole: 'P',
  }),
];
const publishPullQuote = createPublishFrame('text', publishPage1.id, 0, {
  id: 'pub-ed-pullquote',
  name: 'Pull-Quote',
  xMm: 15,
  yMm: 244,
  widthMm: 180,
  heightMm: 32,
  content: '„Eine Alpha ist ehrlich, wenn sie ihre Grenzen genauso deutlich zeigt wie ihre Funktionen.“',
  fontSizePt: 14,
  fontFamily: 'Georgia, serif',
  fillColor: '#f1f5f9',
  strokeColor: '#cbd5e1',
  strokeWidthPt: 0.75,
  semanticRole: 'Table',
});
publishPage1.frameIds = [...publishPage1Frames.map((frame) => frame.id), publishPullQuote.id];

const publishPage2Frames = [
  createPublishFrame('text', publishPage2.id, 1, {
    id: 'pub-ed-p2-kicker',
    name: 'Kicker',
    xMm: 15,
    yMm: 16,
    widthMm: 180,
    heightMm: 7,
    content: 'RELEASE-GATES · INTEGRITÄT · NÄCHSTE SCHRITTE',
    fontSizePt: 8,
    fontFamily: 'system-ui, sans-serif',
    semanticRole: 'H2',
  }),
  createPublishFrame('text', publishPage2.id, 1, {
    id: 'pub-ed-p2-title',
    name: 'Titel',
    xMm: 15,
    yMm: 24,
    widthMm: 180,
    heightMm: 16,
    content: 'Was belegt ist — und was nativ offen bleibt',
    fontSizePt: 22,
    fontFamily: 'Georgia, serif',
    paragraphStyleId: 'style-p-heading1',
    semanticRole: 'H1',
  }),
  createPublishFrame('text', publishPage2.id, 1, {
    id: 'pub-ed-p2-body-1',
    name: 'Kolumne 1',
    xMm: 15,
    yMm: 50,
    widthMm: 87,
    heightMm: 214,
    content:
      'Belegt: Writer-Kernpfad, Grid-Quartalsmodell und die Live-Referenz zwischen beiden. „Gespeichert“ erscheint erst nach bestätigtem Dateischreiben — mit Name, Größe und SHA-256. Fehler werden sichtbar gemeldet, auch im Fokus-Modus; das Dokument bleibt dirty, statt Arbeit still zu verwerfen.',
    semanticRole: 'P',
  }),
  createPublishFrame('text', publishPage2.id, 1, {
    id: 'pub-ed-p2-body-2',
    name: 'Kolumne 2',
    xMm: 108,
    yMm: 50,
    widthMm: 87,
    heightMm: 214,
    content:
      'Offen: native Multi-Monitor-Präsentation, Installer-Lauf und Export-Gegentests am gebauten Fenster. Preview-Module bleiben als Vorschau gekennzeichnet. Der nächste Schritt ist die Nutzerprobe — erst sie macht aus „implementiert“ ein „abgenommen“.',
    semanticRole: 'P',
  }),
];
publishPage2.frameIds = publishPage2Frames.map((frame) => frame.id);

const publishDocument: WorkspaceDocument = {
  id: 'publish-editorial',
  title: 'Astraea Editorial Review 0.1',
  kind: 'Publish',
  created_at: SEED_NOW - 3 * DAY,
  modified_at: SEED_NOW - 10 * HOUR,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
  publishData: {
    ...publishBase,
    revision: 2,
    pagesCount: publishBase.pages.length,
    activePageIndex: 0,
    masterPages: publishBase.masterPages.map((master) => ({
      ...master,
      headerText: 'Astraea Workspace · Editorial Review 0.1',
      footerText: 'Open Core 0.1 Alpha · lokal-first · Vertraulich',
      showPageNumbers: true,
    })),
    frames: [...publishPage1Frames, publishPullQuote, ...publishPage2Frames],
    selectedFrameId: null,
    sections: [{ id: 'section-editorial', name: 'Editorial Review', startPageId: publishPage1.id, startNumber: 1, prefix: '', numberFormat: 'arabic', includePrefix: false }],
  },
};

// ---------------------------------------------------------------------------------------------
// Insight / Connect / Automate: die vorhandenen Vorgabemodelle sind bereits fachlich gefüllt
// (Umsatz-/KPI-Datensatz, Audit-Postfach/Kalender, Security-Response-Flow). Sie werden
// unverändert übernommen, statt sie mit einer zweiten Kopie zu überschreiben.
// ---------------------------------------------------------------------------------------------

export const initialDocs: Record<string, WorkspaceDocument> = {
  'revenue-grid': gridDocument,
  'strategy-writer': writerDocument,

  'board-present': presentDocument,

  'notes-sovereign': notesDocument,

  'pdf-whitepaper': pdfDocument,

  'work-management': workManagementDocument,

  'vault-enclave': vaultDocument,

  'whiteboard-canvas': whiteboardDocument,

  'publish-editorial': publishDocument,

  'insight-analytics': {
    id: 'insight-analytics',
    title: 'Operations-BI · Quartalsauswertung',
    kind: 'Insight',
    created_at: SEED_NOW - 4 * DAY,
    modified_at: SEED_NOW - 11 * HOUR,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
    insightData: DEFAULT_INSIGHT_MODEL,
  },

  'connect-hub': {
    id: 'connect-hub',
    title: 'Projekt-Kommunikation · Q4',
    kind: 'Connect',
    created_at: SEED_NOW - 5 * DAY,
    modified_at: SEED_NOW - 9 * HOUR,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
    connectData: DEFAULT_CONNECT_MODEL,
  },

  'automate-workflow': {
    id: 'automate-workflow',
    title: 'NetGate Security Response',
    kind: 'Automate',
    created_at: SEED_NOW - 6 * DAY,
    modified_at: SEED_NOW - 7 * HOUR,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
    automateData: DEFAULT_AUTOMATE_MODEL,
  },
};
