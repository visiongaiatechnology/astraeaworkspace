// STATUS: PLATIN — Release 0.1: Die Writer-Quartalstabelle ist eine ECHTE Live-Referenz
// auf das Grid-Beispieldokument — keine Mockup-Tabelle im Writer.
//
// Der Nutzerbefund war zweigeteilt: das Grid-Beispiel trug „nur ein paar Zahlen“, und der
// Writer hatte eine Tabelle ohne Quelle. Diese Datei beweist am **ausgelieferten Seed**:
//
//   1. die Tabelle im Writer ist ein `writerData.workspaceEmbeds`-Grid-Range-Embed,
//      erzeugt über `createWriterWorkspaceEmbed` (Modus `Live`) — nicht `writerData.tables`;
//   2. der Embed zeigt auf `revenue-grid` / `table-grid-1` / `A2:F6` und sein Snapshot
//      entspricht dem aktuellen Grid-Inhalt (gleiche Werte wie im Grid-Beispiel);
//   3. ändert sich das Grid-Beispieldokument, aktualisiert `refreshWriterWorkspaceEmbeds`
//      den Snapshot — und nur den, der wirklich live ist (Frozen bleibt Frozen).
import { describe, expect, it } from 'vitest';
import type { Paragraph, TableObject, WorkspaceDocument, WriterWorkspaceEmbed } from '../../../../../shared/contracts/workspace';
import { initialDocs } from '../../../../../app/bootstrap/seedData';
import {
  createWriterWorkspaceEmbed,
  refreshWriterWorkspaceEmbeds,
} from '../../../public/workspace/writerWorkspaceIntegration';

function seeded<K extends 'Grid' | 'Writer'>(kind: K): WorkspaceDocument {
  const found = Object.values(initialDocs).find((document) => document.kind === kind);
  if (!found) throw new Error(`Seed fehlt: ${kind}`);
  return found;
}

const gridDocument = seeded('Grid');
const writerDocument = seeded('Writer');

function gridTable(document: WorkspaceDocument, objectId: string): TableObject {
  const object = document.objects[objectId];
  if (!object || object.type !== 'Table') throw new Error(`Grid-Tabelle ${objectId} fehlt`);
  return object.data;
}

function writerParagraphIds(document: WorkspaceDocument): Set<string> {
  const block = document.root_object_ids
    .map((id) => document.objects[id])
    .find((object) => object?.type === 'TextBlock');
  const paragraphs = block?.type === 'TextBlock' ? block.data.paragraphs : [];
  return new Set(paragraphs.map((paragraph: Paragraph) => paragraph.id));
}

function liveGridRangeEmbed(document: WorkspaceDocument): WriterWorkspaceEmbed {
  const embeds = document.writerData?.workspaceEmbeds ?? [];
  const embed = embeds.find((candidate) => candidate.kind === 'grid-range');
  if (!embed) throw new Error('Der Writer-Seed trägt keinen grid-range-Embed.');
  return embed;
}

function liveGridChartEmbed(document: WorkspaceDocument): WriterWorkspaceEmbed {
  const embeds = document.writerData?.workspaceEmbeds ?? [];
  const embed = embeds.find((candidate) => candidate.kind === 'grid-chart');
  if (!embed) throw new Error('Der Writer-Seed trägt keinen grid-chart-Embed.');
  return embed;
}

/** Alle Zeilen eines Tabellen-Snapshots als `label → zellen` für gut lesbare Zusicherungen. */
function snapshotRow(embed: WriterWorkspaceEmbed, label: string): string[] {
  if (embed.snapshot.type !== 'table') throw new Error('Snapshot ist keine Tabelle.');
  const row = embed.snapshot.rows.find((candidate) => candidate[0] === label);
  if (!row) throw new Error(`Snapshot-Zeile „${label}“ fehlt.`);
  return row;
}

describe('Writer-Seed: Quartalstabelle ist eine Live-Grid-Referenz', () => {
  it('trägt einen Live-grid-range-Embed auf das Grid-Beispieldokument statt einer Mockup-Tabelle', () => {
    const embed = liveGridRangeEmbed(writerDocument);

    expect(embed.mode).toBe('Live');
    expect(embed.sourceDocumentId).toBe(gridDocument.id);
    expect(embed.sourceDocumentId).toBe('revenue-grid');
    expect(embed.sourceObjectId).toBe('table-grid-1');
    expect(embed.sourceSelector).toBe('A2:F6');
    expect(embed.uri).toContain('revenue-grid');
    expect(embed.uri).toContain('table-grid-1');

    // Der Anker ist ein echter Absatz dieses Dokuments — sonst würde der Embed nie rendern.
    expect(writerParagraphIds(writerDocument).has(embed.anchorParagraphId)).toBe(true);

    // Der Writer hat **keine** eingebettete Mockup-Tabelle mehr.
    expect(writerDocument.writerData?.tables ?? []).toHaveLength(0);
  });

  it('zeigt exakt die Werte, die im Grid-Beispieldokument stehen (keine Kopie, keine Attrappe)', () => {
    const embed = liveGridRangeEmbed(writerDocument);
    expect(embed.snapshot.type).toBe('table');
    if (embed.snapshot.type !== 'table') return;

    const table = gridTable(gridDocument, 'table-grid-1');
    // Repräsentativer Abgleich gegen die echten Grid-Zellen: Kennzahl, Q1 und Gesamt.
    expect(table.cells.B3?.value).toBe(420_000);
    expect(table.cells.F5?.value).toBe(782_000);
    expect(embed.snapshot.columns).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);

    expect(snapshotRow(embed, 'Umsatz')).toEqual(['Umsatz', '$420,000.00', '$465,000.00', '$498,000.00', '$542,000.00', '$1,925,000.00']);
    expect(snapshotRow(embed, 'Kosten (inkl. Overhead)')).toEqual(['Kosten (inkl. Overhead)', '$268,000.00', '$279,000.00', '$291,000.00', '$305,000.00', '$1,143,000.00']);
    expect(snapshotRow(embed, 'Rohergebnis')[5]).toBe('$782,000.00');
    expect(snapshotRow(embed, 'Marge')[1]).toBe('36.2%');
    // Der Snapshot ist der, den der echte Einfügepfad für dieselben Zellen erzeugt.
    const recreated = createWriterWorkspaceEmbed({
      writerDocument,
      sourceDocument: gridDocument,
      kind: 'grid-range',
      mode: 'Live',
      sourceObjectId: 'table-grid-1',
      sourceSelector: 'A2:F6',
      anchorParagraphId: liveGridRangeEmbed(writerDocument).anchorParagraphId,
      id: 'embed-revenue-quarters',
      now: 1,
    });
    expect(embed.snapshot).toEqual(recreated.snapshot);
  });

  it('aktualisiert die Live-Tabelle, wenn sich das Grid-Beispieldokument ändert', () => {
    const updatedGrid = structuredClone(gridDocument) as WorkspaceDocument;
    const table = gridTable(updatedGrid, 'table-grid-1');
    table.cells.B3 = { ...table.cells.B3!, value: 455_000 };
    table.cells.F3 = { ...table.cells.F3!, value: 1_960_000 };
    updatedGrid.version = gridDocument.version + 1;
    updatedGrid.modified_at = gridDocument.modified_at + 60_000;
    // Auch das Diagramm ändert sich im selben Quelldokument.
    const chartObject = updatedGrid.objects['chart-revenue-1'];
    if (!chartObject || chartObject.type !== 'Chart') throw new Error('Chart-Objekt fehlt');
    chartObject.data.series[0]!.values[0] = 455_000;

    const refreshed = refreshWriterWorkspaceEmbeds(writerDocument, updatedGrid);
    expect(refreshed.updatedCount, 'beide Live-Embeds (Tabelle + Diagramm) werden aktualisiert').toBe(2);
    expect(refreshed.failedCount).toBe(0);

    const refreshedWriter = refreshed.document;
    const refreshedEmbed = liveGridRangeEmbed(refreshedWriter);
    expect(refreshedEmbed.sourceVersion).toBe(updatedGrid.version);
    expect(refreshedEmbed.updatedAt).toBe(updatedGrid.modified_at);
    expect(snapshotRow(refreshedEmbed, 'Umsatz')[1]).toBe('$455,000.00');
    expect(snapshotRow(refreshedEmbed, 'Umsatz')[5]).toBe('$1,960,000.00');
    // Der Writer selbst wird als Dokument fortgeschrieben (version/modified_at), die
    // übrigen Writer-Daten bleiben unangetastet.
    expect(refreshedWriter.version).toBe(writerDocument.version + 1);
    expect(refreshedWriter.writerData?.tables ?? []).toHaveLength(0);
    expect(refreshedWriter.id).toBe(writerDocument.id);

    const refreshedChart = liveGridChartEmbed(refreshedWriter);
    expect(refreshedChart.snapshot.type).toBe('chart');
    if (refreshedChart.snapshot.type === 'chart') {
      expect(refreshedChart.snapshot.series[0]!.values[0]).toBe(455_000);
    }
  });

  it('lässt Snapshot-Referenzen und fremde Quellen unangetastet', () => {
    const live = liveGridRangeEmbed(writerDocument);
    const snapshotDocument: WorkspaceDocument = {
      ...writerDocument,
      writerData: {
        ...writerDocument.writerData!,
        workspaceEmbeds: [{ ...live, mode: 'Snapshot' }],
      },
    };
    const changedGrid = structuredClone(gridDocument) as WorkspaceDocument;
    changedGrid.version += 5;
    changedGrid.modified_at += 5_000;

    const snapshotRefresh = refreshWriterWorkspaceEmbeds(snapshotDocument, changedGrid);
    expect(snapshotRefresh.updatedCount).toBe(0);
    expect(snapshotRefresh.document).toBe(snapshotDocument);

    // Eine Änderung an einem anderen Dokument darf den Grid-Embed nicht anfassen.
    const otherSource: WorkspaceDocument = { ...gridDocument, id: 'other-grid', version: 99, modified_at: gridDocument.modified_at + 99_000 };
    const unrelatedRefresh = refreshWriterWorkspaceEmbeds(writerDocument, otherSource);
    expect(unrelatedRefresh.updatedCount).toBe(0);
  });
});
