// STATUS: PLATIN — Release 0.1: Die Beispieldokumente sind eine echte Arbeitsprobe.
//
// Der Nutzerbefund „die Beispieldokumente nach der Installation sind Murx“ wird hier
// messbar beantwortet: das Grid-Beispiel ist ein Quartalsmodell mit Formeln, Formaten
// und Layout-Metadaten; alle übrigen Seeds tragen professionelle, in sich schlüssige
// Inhalte. Zusätzlich gelten die harten Invarianten weiter (WOM-Schema, IDs, Typen) —
// dieser Zeuge prüft deshalb Struktur **und** Inhalt, nicht hübsche Absichten.
import { describe, expect, it } from 'vitest';
import type { Paragraph, TableObject, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { initialDocs } from '../../../../app/bootstrap/seedData';
import { validateWorkspaceDocumentInvariants } from '../../../../platform/workspace/model/workspaceObjectModel';

const documents = Object.values(initialDocs);

function byKind(kind: string): WorkspaceDocument {
  const document = documents.find((candidate) => candidate.kind === kind);
  if (!document) throw new Error(`Seed fehlt: ${kind}`);
  return document;
}

function table(document: WorkspaceDocument, objectId: string): TableObject {
  const object = document.objects[objectId];
  if (!object || object.type !== 'Table') throw new Error(`Tabelle ${objectId} fehlt`);
  return object.data;
}

function paragraphs(document: WorkspaceDocument): Paragraph[] {
  const block = document.root_object_ids.map((id) => document.objects[id]).find((object) => object?.type === 'TextBlock');
  return block?.type === 'TextBlock' ? block.data.paragraphs : [];
}

const grid = byKind('Grid');

describe('Grid-Beispiel: echtes Quartalsmodell statt ein paar Zahlen', () => {
  it('trägt ein deterministisches, vollständig modelliertes Quartalsmodell mit Formeln', () => {
    const quarterTable = table(grid, 'table-grid-1');
    const cells = quarterTable.cells;

    // Titel + Kopfzeile.
    expect(cells.A1?.value).toBe('Astraea Workspace · Quartalsmodell 2026 (USD)');
    expect(cells.A2?.value).toBe('Kennzahl');
    expect(cells.B2?.value).toBe('Q1');
    expect(cells.E2?.value).toBe('Q4');
    expect(cells.F2?.value).toBe('Gesamt');

    // Echte Kennzahlen inklusive berechneter Summen (cached value + formula).
    expect(cells.B3?.value).toBe(420_000);
    expect(cells.E3?.value).toBe(542_000);
    expect(cells.F3).toMatchObject({ value: 1_925_000, formula: '=SUM(B3:E3)', format: 'currency' });
    expect(cells.F4).toMatchObject({ value: 1_143_000, formula: '=SUM(B4:E4)' });
    expect(cells.B5?.formula).toBe('=B3-B4');
    expect(cells.F6?.formula).toBe('=F5/F3');
    expect(cells.F6?.format).toBe('percent');
    // Multiplikation/Division im Produktblock (=B*C, Kostensumme, Marge).
    expect(cells.D11?.formula).toBe('=B11*C11');
    expect(cells.F15?.formula).toBe('=SUM(F11:F14)');
    expect(cells.H15?.format).toBe('percent');
    // Zahlenformate sind gesetzt (Währung/Prozent), nicht nur nackte Zahlen.
    const currencyCells = Object.values(cells).filter((entry) => entry.format === 'currency');
    const percentCells = Object.values(cells).filter((entry) => entry.format === 'percent');
    expect(currencyCells.length).toBeGreaterThan(10);
    expect(percentCells.length).toBeGreaterThan(5);
  });

  it('hat ein zweites Blatt mit Annahmen und Szenarien (kein halbfertiges Arbeitsblatt)', () => {
    const assumptions = table(grid, 'table-grid-2');
    expect(assumptions.cells.A2?.value).toBe('Parameter');
    expect(assumptions.cells.B3?.value).toBe(1_925_000);
    expect(assumptions.cells.B5?.formula).toBe('=B3*(1+B4)');
    expect(assumptions.cells.A14?.value).toBe('Konservativ');
    expect(assumptions.cells.A16?.value).toBe('Ambitioniert');
  });

  it('nutzt die vorhandenen Grid-Layout-Metadaten (Spaltenbreiten, Fixierung, Filter-/Formatregeln)', () => {
    const sheets = grid.gridData?.sheets ?? [];
    expect(sheets).toHaveLength(2);
    expect(sheets[0]).toMatchObject({ name: 'Quartalsmodell', tableObjectId: 'table-grid-1', freezeRows: 2, freezeCols: 1 });
    expect(sheets[0]!.colWidths?.[0]).toBeGreaterThan(150);
    expect(sheets[0]!.conditionalFormatting?.length ?? 0).toBeGreaterThan(0);
    expect(sheets[1]!.name).toBe('Annahmen & Szenarien');
    expect(grid.gridData?.namedRanges?.length ?? 0).toBeGreaterThan(0);
    expect(grid.gridData?.activeSheetId).toBe('sheet-1');
    // Das Diagramm ist ein echtes Objekt des Grid-Dokuments.
    const chart = grid.objects['chart-revenue-1'];
    expect(chart?.type).toBe('Chart');
  });
});

describe('Writer-Beispiel: professionelles Dokument, nicht Platzhaltertext', () => {
  const writer = byKind('Writer');
  const writerParagraphs = paragraphs(writer);

  it('hat Titel, Executive Summary, mehrere Abschnitte, Liste und eine sinnvolle Fußzeile', () => {
    expect(writerParagraphs.length).toBeGreaterThanOrEqual(18);
    const styleNames = writerParagraphs.map((paragraph) => paragraph.style.style_name);
    expect(styleNames).toContain('title');
    expect(styleNames.filter((name) => name === 'heading1').length).toBeGreaterThanOrEqual(3);
    expect(styleNames.filter((name) => name === 'heading2').length).toBeGreaterThanOrEqual(2);
    expect(writerParagraphs.some((paragraph) => paragraph.style.list_style === 'bullet')).toBe(true);
    expect(writerParagraphs.some((paragraph) => paragraph.style.list_style === 'number')).toBe(true);
    // Callout: hervorgehobener Absatz mit eigener Fläche und Rahmen.
    expect(writerParagraphs.some((paragraph) => Boolean(paragraph.style.shading?.fillColor))).toBe(true);
    const text = writerParagraphs.map((paragraph) => paragraph.spans.map((span) => span.text).join('')).join('\n');
    expect(text).toContain('Executive Summary');
    expect(text).toContain('Quartalszahlen 2026');
    expect(text.length).toBeGreaterThan(2_500);
    expect(writer.writerData?.pageSetup.footerText).toContain('{PAGE}');
    expect(writer.writerData?.pageSetup.headerText).toContain('Astraea');
  });

  it('verlinkt die Quartalstabelle als Live-Embed (und hält keine Mockup-Tabelle mehr)', () => {
    expect(writer.writerData?.tables ?? []).toHaveLength(0);
    const embeds = writer.writerData?.workspaceEmbeds ?? [];
    expect(embeds.length).toBeGreaterThanOrEqual(2);
    expect(embeds.every((embed) => embed.mode === 'Live')).toBe(true);
    expect(embeds.every((embed) => embed.sourceDocumentId === grid.id)).toBe(true);
    expect(embeds.some((embed) => embed.kind === 'grid-range')).toBe(true);
    expect(embeds.some((embed) => embed.kind === 'grid-chart')).toBe(true);
  });
});

describe('Present-Beispiel: Board-Review-Deck mit Finanz- und Architekturbezug', () => {
  const present = byKind('Present');

  it('enthält ein inhaltlich schlüssiges Deck mit Sektionen und Review-Status', () => {
    const slides = present.presentData?.slides ?? [];
    expect(slides.length).toBeGreaterThanOrEqual(5);
    expect(present.presentData?.sections?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(slides.map((slide) => slide.title).join(' ')).toContain('Board Review');
    expect(slides.some((slide) => slide.layout === 'chart' && slide.chartReferenceId === 'ref-chart-present')).toBe(true);
    // Die Live-Chart-Referenz ist ein echtes Objekt dieses Dokuments.
    expect(present.objects['ref-chart-present']?.type).toBe('WorkspaceReference');
    expect(present.presentData?.collaboration?.review.status).toBe('in-review');
    expect(slides.every((slide) => Boolean(slide.speakerNotes && slide.speakerNotes.length > 20))).toBe(true);
  });
});

describe('Notes, Tasks und Whiteboard: echte Projektdaten', () => {
  it('Notes tragen Projektjournal und Board-Review-Notizen mit Inhalt', () => {
    const notes = byKind('Notes');
    const pages = (notes.noteData?.sections ?? []).flatMap((section) => section.pages);
    expect(pages.length).toBeGreaterThanOrEqual(5);
    expect(pages.some((page) => page.id === 'page-release-journal' && page.content.length > 500)).toBe(true);
    expect(pages.some((page) => page.id === 'page-board-review' && page.content.includes('1.925.000'))).toBe(true);
  });

  it('Tasks tragen realistische Aufgaben und vier Projektphasen', () => {
    const tasks = byKind('Tasks');
    expect(tasks.workManagementData?.tasks.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(tasks.workManagementData?.milestones?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(tasks.workManagementData?.cards?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(tasks.id).toBe('work-management');
  });

  it('Whiteboard zeigt die Systemarchitektur mit Knoten, Verbindungen und Review-Fragen', () => {
    const whiteboard = byKind('Whiteboard');
    const items = whiteboard.whiteboardData?.items ?? [];
    expect(items.length).toBeGreaterThanOrEqual(12);
    expect(items.filter((item) => item.type === 'process').length).toBeGreaterThanOrEqual(4);
    expect(items.filter((item) => item.type === 'connector').length).toBeGreaterThanOrEqual(4);
    expect(items.filter((item) => item.type === 'frame').length).toBeGreaterThanOrEqual(1);
    expect(items.filter((item) => item.type === 'sticky').length).toBeGreaterThanOrEqual(3);
    expect(items.map((item) => item.text).join(' ')).toContain('Workspace Core');
  });
});

describe('Publish, PDF und Vault: echte Dokumente statt Demo-Platzhalter', () => {
  it('Publish trägt ein Editorial-Layout mit Titel, Deck, zwei Spalten und zweiter Seite', () => {
    const publish = byKind('Publish');
    const model = publish.publishData!;
    expect(model.pages.length).toBeGreaterThanOrEqual(2);
    expect(model.frames.length).toBeGreaterThanOrEqual(8);
    const page1 = model.pages[0]!;
    expect(page1.frameIds.length).toBeGreaterThanOrEqual(5);
    const contents = model.frames.map((frame) => frame.content).join('\n');
    expect(contents).toContain('Souveräne Produktivität');
    expect(contents).toContain('Workspace-Fabric');
    expect(contents).toContain('Alpha');
    // Jede Seiten-Referenz zeigt auf einen existierenden Rahmen.
    const frameIds = new Set(model.frames.map((frame) => frame.id));
    for (const page of model.pages) {
      for (const frameId of page.frameIds) expect(frameIds.has(frameId), `Seite ${page.id} verweist auf ${frameId}`).toBe(true);
    }
  });

  it('PDF ist ein vollständiges Review-Dokument mit drei Seiten und echten Abschnitten', () => {
    const pdf = byKind('PdfStudio');
    expect(pdf.pdfData?.numPages).toBe(pdf.pdfData?.pages.length);
    expect(pdf.pdfData?.pages.length).toBeGreaterThanOrEqual(3);
    expect(pdf.pdfData?.pages[0]?.sections.length).toBeGreaterThanOrEqual(4);
    expect(pdf.pdfData?.pages[0]?.sections[1]?.content).toContain('Release 0.1');
    expect(pdf.pdfData?.annotations).toHaveLength(1);
    expect(pdf.pdfData?.annotations[0]?.text).toContain('Alpha-Umfang');
  });

  it('Vault enthält Projektdateien, ohne eine ungeprüfte Integrität zu behaupten', () => {
    const vault = byKind('Vault');
    const files = vault.vaultData?.files ?? [];
    expect(files.length).toBeGreaterThanOrEqual(5);
    expect(files.filter((file) => file.sourceType === 'workspace-document').length).toBeGreaterThanOrEqual(4);
    // Ehrlichkeit: kein Seed behauptet eine verifizierte Integrität, die niemand geprüft hat.
    expect(files.every((file) => file.integrityState === 'unverified')).toBe(true);
    expect(files.some((file) => file.documentId === 'revenue-grid')).toBe(true);
    expect(files.some((file) => file.documentId === 'strategy-writer')).toBe(true);
  });
});

describe('Alle Seeds bleiben kanonische Workspace-Dokumente', () => {
  it('erfüllen die WOM-Invarianten und haben eindeutige IDs', () => {
    const ids = new Set<string>();
    for (const document of documents) {
      expect(() => validateWorkspaceDocumentInvariants(document), document.id).not.toThrow();
      expect(ids.has(document.id), `doppelte Seed-ID ${document.id}`).toBe(false);
      ids.add(document.id);
      expect(document.title.length).toBeGreaterThan(3);
      expect(document.kind.length).toBeGreaterThan(0);
    }
  });

  it('enthalten die Kernmodule mit professionellem Inhalt (Insight/Connect/Automate)', () => {
    const insight = byKind('Insight');
    expect(insight.insightData?.records?.length ?? 0).toBeGreaterThan(0);
    expect(insight.insightData?.kpis?.length ?? 0).toBeGreaterThan(0);
    const connect = byKind('Connect');
    expect(connect.connectData?.messages?.length ?? 0).toBeGreaterThan(0);
    expect(connect.connectData?.events?.length ?? 0).toBeGreaterThan(0);
    const automate = byKind('Automate');
    expect(automate.automateData?.nodes?.length ?? 0).toBeGreaterThan(0);
    expect(automate.automateData?.connections?.length ?? 0).toBeGreaterThan(0);
  });
});
