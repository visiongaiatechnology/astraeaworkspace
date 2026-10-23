// STATUS: PLATIN — **Paket 22 (Writer)**: Render-Vertrag des sichtbaren Einstiegs (Quellenseite)
//
// ## Warum das Markup geprüft wird ✓✓
//
// Der **Erzeuger** ist unit-getestet ✓ (`writerWorkspaceCarrier.test.ts` ✓). Was ein kopfloser Lauf **nicht**
// auslösen kann, ist das **Binden** ✓ (`draggable` ✓, `dragstart` ✓, `setData` ✓) — dafür fehlt der Browser ✓.
// Geprüft wird hier das, was wirklich da ist: **drei echte Knöpfe** ✓ (jeder sagt **eine** Behandlungsart ✓),
// die sichtbare Aussage ✓ und der **benannte** Grund ✓. *Keine Farbe sagt einen Zustand allein* ✓.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import { WriterWorkspaceCarrierControl } from '../../../integrations/workspace-carrier/WriterWorkspaceCarrierControl';
import {
  carryWriterWorkspaceSection,
  createWriterWorkspaceCarrierState,
} from '../../../integrations/workspace-carrier/writerWorkspaceCarrier';
import type { WriterWorkspaceCarrierState } from '../../../integrations/workspace-carrier/writerWorkspaceCarrier';
import {
  WRITER_WORKSPACE_DROP_INTENT_LABEL,
  WRITER_WORKSPACE_LIVE_MODE_LABEL,
} from '../../../integrations/workspace-drop/writerWorkspaceDropZoneContract';

const writer: WorkspaceDocument = {
  schema_version: 2,
  id: 'writer-story',
  title: 'Story',
  kind: 'Writer',
  created_at: 1,
  modified_at: 1,
  version: 5,
  theme_id: 'cosmic-obsidian',
  root_object_ids: ['tb-letter'],
  objects: {
    'tb-letter': {
      type: 'TextBlock',
      data: {
        id: 'tb-letter',
        paragraphs: [{
          id: 'p1',
          style: { alignment: 'left', line_height: 1.2, space_before: 0, space_after: 0 },
          spans: [{ text: 'Vertraulicher Absatz' }],
        }],
      },
    },
  },
};

const markupOf = (state: WriterWorkspaceCarrierState): string => renderToStaticMarkup(
  <WriterWorkspaceCarrierControl
    state={state}
    onCarry={() => undefined}
    onDragStart={() => undefined}
    onClear={() => undefined}
  />,
);

const bereitgestellt = (integrationKind: 'copy' | 'live', mode?: 'Live' | 'Frozen') =>
  carryWriterWorkspaceSection(createWriterWorkspaceCarrierState(), {
    document: writer,
    integrationKind,
    ...(mode === undefined ? {} : { requestedMode: mode }),
  });

describe('Paket 22 — der sichtbare Einstieg', () => {
  it('bietet drei **echte** Knöpfe — und jeder Weg steht als Wort da', () => {
    const markup = markupOf(createWriterWorkspaceCarrierState());
    expect(markup).toContain('data-writer-carrier-action="copy"');
    expect(markup).toContain('data-writer-carrier-action="live"');
    expect(markup).toContain('data-writer-carrier-action="frozen"');
    // **Gezogen, nicht gelockert:** genau die drei Wege, alle ohne Klick untätig.
    expect((markup.match(/<button type="button"/g) ?? [])).toHaveLength(3);
    // Die Wörter kommen aus dem **einen** Register — kein zweiter Wortschatz.
    expect(markup).toContain(WRITER_WORKSPACE_DROP_INTENT_LABEL.COPY);
    expect(markup).toContain(WRITER_WORKSPACE_LIVE_MODE_LABEL.Live);
    expect(markup).toContain(WRITER_WORKSPACE_LIVE_MODE_LABEL.Frozen);
  });

  it('zeigt den bereitgestellten Träger mit Kennungen, Art und Griff', () => {
    const markup = markupOf(bereitgestellt('copy'));
    expect(markup).toContain('data-writer-carrier="ready"');
    expect(markup).toContain('data-writer-carrier-kind="copy"');
    expect(markup).toContain('data-writer-carrier-mode=""');
    expect(markup).toContain('data-writer-carrier-document="writer-story"');
    expect(markup).toContain('data-writer-carrier-object="tb-letter"');
    expect(markup).toContain('Bereitgestellt');
    expect(markup).toContain('tb-letter');
    // Der **Zeiger**-Weg: ein Griff, der ziehbar ist (das Binden selbst bleibt `NOT_TESTED`).
    expect(markup).toContain('data-writer-carrier-handle="true"');
    expect(markup).toContain('draggable="true"');
    expect(markup).toContain('data-writer-carrier-clear');
    expect((markup.match(/<button type="button"/g) ?? [])).toHaveLength(4);
  });

  it('sagt den Modus, wenn er gesagt wurde — und sonst **nicht**', () => {
    const mitModus = markupOf(bereitgestellt('live', 'Frozen'));
    expect(mitModus).toContain('data-writer-carrier-kind="live"');
    expect(mitModus).toContain('data-writer-carrier-mode="Frozen"');
    expect(mitModus).toContain('Bereitgestellt:');
    const ohneModus = markupOf(bereitgestellt('live'));
    expect(ohneModus).toContain('data-writer-carrier-mode=""');
  });

  it('nennt die Ablehnung als Wort — und bietet **keinen** Griff an', () => {
    const abgelehnt = carryWriterWorkspaceSection(createWriterWorkspaceCarrierState(), {
      document: { id: 'x', kind: 'Grid' },
      integrationKind: 'copy',
    });
    const markup = markupOf(abgelehnt);
    expect(markup).toContain('data-writer-carrier="carrier-source-not-writer"');
    expect(markup).toContain('data-writer-carrier-refusal="carrier-source-not-writer"');
    expect(markup).toContain('Nur ein Writer-Dokument');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).not.toContain('data-writer-carrier-handle');
  });

  // **Kein zweiter Wächter über dieselbe Regel** ✗✓ (eigener Fehler, gemessen): hier stand eine Zusicherung
  // gegen den Hover-Verstecker als **Zeichenkette** ✗ — und *der globale Vertrag `writerHoverGate` scannt
  // **jede** `.tsx` unter `apps/writer` nach genau dieser Zeichenkette* ✓, **auch die Tests** ✓. Die Zusicherung
  // hat damit die Regel gebrochen, die sie festhalten wollte ✗✓. *Die Regel hat **eine** Autorität*
  // (`writerHoverGate.contract.test.mjs` ✓) — *eine zweite Aussage über dieselbe Frage wäre eine zweite
  // Wahrheit* ✓ (dieselbe Falle, die `testImportDepth` für Import-Zeichenketten dokumentiert ✓).
});
