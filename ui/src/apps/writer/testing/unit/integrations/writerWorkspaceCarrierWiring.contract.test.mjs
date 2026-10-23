// STATUS: PLATIN — **Paket 22 (Writer)**: Quellvertrag des Träger-Erzeugers
//
// Warum eine `.mjs`: eine `.ts`-Prüfdatei hat hier **keine** Node-Typen ✓ (`node:fs` → `TS2307` ✓).
//
// Was dieser Vertrag **nicht** kann ✗: das Binden des Ziehens auslösen ✓ — dafür fehlt der Browser ✓. Er
// prüft, **dass** die Quellenseite einen Aufrufer hat ✓ und **dass** sie das **eine** Format benutzt ✓
// (kein zweiter Trägerpfad ✓, kein zweiter Parser ✓, keine zweite MIME ✓).
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const writer = path.resolve(here, '../../..');
const read = (relative) => readFileSync(path.resolve(writer, relative), 'utf8');
/** Entfernt Kommentare — *ein Satz über eine Sache ist nicht die Sache* ✓. */
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const editor = read('editor/WriterEditor.tsx');
const carrier = read('integrations/workspace-carrier/writerWorkspaceCarrier.ts');
const control = read('integrations/workspace-carrier/WriterWorkspaceCarrierControl.tsx');
const hook = read('integrations/workspace-carrier/useWriterWorkspaceCarrier.ts');

const CARRIER_DIR = path.resolve(writer, 'integrations/workspace-carrier');
const allCarrierCode = code(
  readdirSync(CARRIER_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => read(`integrations/workspace-carrier/${entry.name}`))
    .join('\n'),
);

describe('Paket 22 (Writer) — der Erzeuger hat einen Aufrufer', () => {
  it('hängt die Quellenseite an die Writer-Oberfläche', () => {
    expect(editor).toContain('useWriterWorkspaceCarrier({ document })');
    expect(editor).toContain('<WriterWorkspaceCarrierControl');
    expect(editor).toContain('state={workspaceCarrier.state}');
    expect(editor).toContain('onCarry={workspaceCarrier.carry}');
    expect(editor).toContain('onDragStart={workspaceCarrier.onDragStart}');
    expect(editor).toContain('onClear={workspaceCarrier.clear}');
  });

  it('bietet drei gesagte Wege — keiner davon still', () => {
    expect(control).toContain("onClick={() => onCarry('copy')}");
    expect(control).toContain("onClick={() => onCarry('live', 'Live')}");
    expect(control).toContain("onClick={() => onCarry('live', 'Frozen')}");
    // *Ein Knopf, der ohne Klick etwas setzt, wäre der Defekt aus Paket 15* ✗.
    expect(code(control)).not.toContain('useEffect(');
  });
});

describe('Paket 22 (Writer) — ein Format, kein zweiter Trägerpfad', () => {
  it('baut den Träger mit den **vorhandenen** Funktionen aus Paket 7', () => {
    expect(carrier).toContain('serializeWorkspaceDragPayload(createWorkspaceDragPayload({');
    expect(carrier).toContain('documentId:');
    expect(carrier).toContain('objectId,');
    expect(carrier).toContain('objectKind: WRITER_WORKSPACE_CARRIER_SECTION_KIND,');
    expect(carrier).toContain('sourceApp: WRITER_WORKSPACE_CARRIER_SOURCE_APP,');
    expect(carrier).toContain('supportedIntents,');
  });

  it('parst nichts selbst und erfindet keine zweite Feldliste', () => {
    expect(allCarrierCode).not.toContain('JSON.parse');
    expect(allCarrierCode).not.toContain('parseWorkspaceDragPayload');
    expect(allCarrierCode).not.toContain("'documentId', 'objectId'");
    expect(allCarrierCode).not.toContain('new WorkspaceInteractionRegistry');
    expect(allCarrierCode).not.toContain('registerAdapter');
  });

  it('benutzt die **eine** MIME aus Paket 4', () => {
    expect(hook).toContain('FABRIC_WORKSPACE_OBJECT_DRAG_MIME');
    expect(hook).toContain("from '../../../../shell/fabric/fabricGraphWorkspaceDrop'");
    expect(allCarrierCode).not.toContain('application/x-astraea');
  });

  it('trägt den Modus **nur**, wenn er gesagt wurde — abwesend statt `undefined`', () => {
    expect(carrier).toContain('...(mode === undefined ? {} : { mode })');
    expect(hook).toContain('...(mode === undefined ? {} : { requestedMode: mode })');
    expect(carrier).not.toContain('mode: undefined');
  });

  it('nimmt die Wörter aus dem **einen** Register', () => {
    expect(control).toContain("from '../workspace-drop/writerWorkspaceDropZoneContract'");
    expect(control).toContain('WRITER_WORKSPACE_DROP_INTENT_LABEL.COPY');
    expect(control).toContain('WRITER_WORKSPACE_LIVE_MODE_LABEL.Live');
    expect(control).toContain('WRITER_WORKSPACE_LIVE_MODE_LABEL.Frozen');
  });

  it('nennt das ungeprüfte Binden ausdrücklich', () => {
    expect(hook).toContain('NOT_TESTED');
    expect(control).toContain('NOT_TESTED');
  });

  it('versteckt keinen Zustand hinter Hover', () => {
    expect(allCarrierCode).not.toContain('opacity-0');
  });
});
