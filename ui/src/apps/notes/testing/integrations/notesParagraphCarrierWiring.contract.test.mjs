// STATUS: PLATIN — Integration & Release, **Notes · Paket 21**: Quellvertrag des Träger-Erzeugers
//
// Warum eine `.mjs`: eine `.ts`-Prüfdatei hat in diesem Projekt **keine** Node-Typen — `node:fs` ergäbe `TS2307`.
//
// Was dieser Vertrag prüft: dass der Erzeuger den **einen** vorhandenen Trägerpfad benutzt (Paket 7), dass **kein**
// zweites Format, **kein** zweiter Parser und **keine** zweite MIME-Konstante entsteht, dass die Referenz die
// **vorhandene** Vokabel benutzt (`noteWorkspaceUri` + `#line-<n>`), und dass Schicht 5 (das Binden) ehrlich als
// `NOT_TESTED` benannt ist. Er behauptet **nicht**, dass ein Zug im Browser ankommt — dafür fehlt der Browser.
//
// **Kommentare werden vor jeder „darf nicht vorkommen"-Prüfung entfernt**: der Kopf des Moduls *nennt* die
// verbotenen Namen — *ein Satz über eine verbotene Sache ist nicht die Sache*.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const notes = path.resolve(here, '../..');
const carrierDir = path.resolve(notes, 'integrations');
const dropZoneDir = path.resolve(notes, 'drop-zone');

const read = (relative) => readFileSync(path.resolve(notes, relative), 'utf8');
/** Entfernt Kommentare — dieselbe Form wie in den übrigen Verträgen dieses Pakets. */
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const carrier = read('integrations/notesParagraphCarrier.ts');
const carrierCode = code(carrier);
const allIntegrationFiles = readdirSync(carrierDir, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name);
const dropZoneFiles = readdirSync(dropZoneDir, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name);
/**
 * **Die Erzeuger-Seite**: der Träger plus die Ablagezone (Paket 12) — *das sind die Dateien, die keinen zweiten
 * Träger bauen dürfen.* `event.dataTransfer` beim **Empfangen** ist erlaubt und deshalb hier nicht verboten.
 */
const buildingSites = code([carrier, ...dropZoneFiles.map((name) => read(`drop-zone/${name}`))].join('\n'));

describe('Notes · Paket 21 — ein Trägerpfad, ein Format', () => {
  it('benutzt den **vorhandenen** Erzeuger und Serialisierer (Paket 7)', () => {
    expect(carrier).toContain("from '../../../shared/workspace-interaction'");
    expect(carrier).toContain('createWorkspaceDragPayload(');
    expect(carrier).toContain('serializeWorkspaceDragPayload(');
    expect(carrierCode).not.toContain('JSON.stringify');
    expect(carrierCode).not.toContain('JSON.parse');
    expect(carrierCode).not.toContain('astraea.workspace.drag');
  });

  it('erfindet **keine** zweite Trägerform: keine MIME, kein Schema, kein `setData`', () => {
    // Die **eine** MIME-Konstante kommt aus der Shell — hier wird sie nur benannt.
    expect(carrier).toContain('FABRIC_WORKSPACE_OBJECT_DRAG_MIME');
    expect(carrier).toContain("from '../../../shell/fabric/fabricGraphWorkspaceDrop'");
    // Die **Erzeuger**-Seite setzt nichts selbst und liest nichts: *ein Erzeuger schreibt den Träger, er empfängt ihn nicht.*
    expect(carrierCode).not.toContain('setData(');
    expect(carrierCode).not.toContain('dataTransfer');
    expect(buildingSites).not.toContain('application/x-astraea');
    expect(buildingSites).not.toContain('new WorkspaceInteractionRegistry');
    expect(buildingSites).not.toContain('registerAdapter');
    expect(buildingSites).not.toContain('registerAppManifest');
  });

  it('führt **keine** zweite Objektart- und **keine** zweite Absichtsliste', () => {
    // Die Objektart ist **eine** benannte Konstante (gelesen aus dem vorhandenen Modell, nicht erfunden) …
    expect(carrier).toContain("export const NOTES_CARRIER_OBJECT_KIND = 'TextBlock' as const");
    expect((carrierCode.match(/TextBlock/g) ?? [])).toHaveLength(1);
    // … und die Absichten sind **typisiert** gegen die vorhandene Absichtsliste (Paket 4).
    expect(carrier).toContain('NOTES_CARRIER_INTENTS: readonly WorkspaceDropIntent[]');
    expect(carrier).toContain("Object.freeze(['COPY', 'LIVE_REFERENCE'])");
    // Kein zweites Wörterbuch über die Codes des vorhandenen Erzeugers: der Satz kommt aus dem Fehler selbst.
    expect(carrier).toContain('new WorkspaceInteractionError(code as WorkspaceInteractionErrorCode).message');
  });

  it('benennt den Absatz mit der **vorhandenen** Referenz-Vokabel', () => {
    // Dieselbe Vokabel wie der vorhandene Notes→Tasks-Weg — kein neues URI-Schema.
    expect(carrier).toContain('noteWorkspaceUri(');
    expect(carrier).toContain("from './notesWorkspaceActions'");
    expect(carrier).toContain('#line-${lineIndex}');
    expect(carrierCode).not.toContain('vgt://workspace'); // die URI entsteht **nicht** hier, sondern dort
  });
});

describe('Notes · Paket 21 — fail-closed und Tastatur sind modelliert, nicht nachgerüstet', () => {
  it('jede Unbrauchbarkeit hat einen **benannten** Grund — und es gibt keinen halben Träger', () => {
    for (const reason of [
      'notes-carrier-document-missing', 'notes-carrier-document-kind-invalid', 'notes-carrier-page-missing',
      'notes-carrier-page-trashed', 'notes-carrier-page-locked', 'notes-carrier-line-invalid',
      'notes-carrier-line-empty', 'notes-carrier-key-unbound', 'notes-carrier-command-unknown',
    ]) {
      expect(carrier, reason).toContain(`'${reason}'`);
    }
    // Die Erfolgsform trägt **keinen** Grund und die Fehlerform **keinen** Träger — `reason?: never` / `carrier?: never`.
    expect(carrier).toContain('readonly reason?: never');
    expect(carrier).toContain('readonly carrier?: never');
  });

  it('die Tastatur ruft **denselben** Erzeuger — kein zweiter Weg', () => {
    expect(carrier).toContain('export function resolveNotesCarrierCommand(');
    expect(carrier).toContain('export function applyNotesCarrierCommand(');
    expect(carrier).toContain('const step = notesParagraphCarrier(request);');
    expect(carrier).toContain("return step.ok ? { ok: true, kind: 'carried', carrier: step.carrier } : { ok: false, reason: step.reason };");
  });

  it('bleibt Schicht 5 ehrlich: das **Binden** ist `NOT_TESTED`, und das Modul fasst kein DOM an', () => {
    expect(carrier).toContain('NOT_TESTED');
    expect(carrierCode).not.toContain('addEventListener');
    expect(carrierCode).not.toContain('globalThis.document');
    expect(carrierCode).not.toContain('document.createElement');
    expect(carrierCode).not.toContain('window.');
    expect(carrierCode).not.toContain('React');
  });

  it('jeder relative Import zeigt auf eine vorhandene Datei (auch die type-only)', () => {
    const specifierPattern = /(?:from\s+'([^']+)'|import\s+'([^']+)')/g;
    const missing = [];
    for (const name of allIntegrationFiles) {
      const file = path.resolve(carrierDir, name);
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(specifierPattern)) {
        const specifier = match[1] ?? match[2];
        if (!specifier || !specifier.startsWith('.')) continue;
        const base = path.resolve(path.dirname(file), specifier);
        const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.css`, `${base}.mjs`, path.join(base, 'index.ts')];
        if (!candidates.some((candidate) => existsSync(candidate))) missing.push(`${name} → ${specifier}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
