// STATUS: PLATIN — Integration & Release, Paket 1: PDF Studios Anwendung des Versionsvertrags
//
// Die Prüfung ist rein (kein DOM, keine Ablage) und läuft headless vollständig. Sie deckt die drei Fälle ab, die
// im Betrieb über Datenverlust entscheiden — und den vierten, gefährlichsten: **keine Angabe**.
import { describe, expect, it } from 'vitest';
import { WORKSPACE_SCHEMA_VERSIONS } from '../../../../../platform/workspace/integrations/workspaceSchemaVersion';
import {
  PDF_STUDIO_SCHEMA_FIELD,
  PDF_STUDIO_SCHEMA_VERSION,
  assertPdfStudioSchema,
  resolvePdfStudioSchema,
  withPdfStudioSchema,
} from '../pdfStudioSchema';

describe('PDF Studio benutzt den gemeinsamen Vertrag', () => {
  it('die Version ist abgeleitet, nicht abgeschrieben', () => {
    // Der eigentliche Punkt dieser Datei: Es gibt **eine** Stelle mit der Zahl.
    expect(PDF_STUDIO_SCHEMA_VERSION).toBe(WORKSPACE_SCHEMA_VERSIONS.PdfStudio);
  });

  it('der eigene, aktuelle Zustand wird durchgelassen', () => {
    expect(() => assertPdfStudioSchema(withPdfStudioSchema({ pages: [] }))).not.toThrow();
    expect(withPdfStudioSchema({ pages: 1 })[PDF_STUDIO_SCHEMA_FIELD]).toBe(PDF_STUDIO_SCHEMA_VERSION);
  });

  it('eine **neuere** Version wird abgelehnt — nicht „best effort" gelesen', () => {
    expect(() => assertPdfStudioSchema({ schemaVersion: PDF_STUDIO_SCHEMA_VERSION + 1 })).toThrow(/newer-than-supported/u);
  });

  it('eine **vorhandene, aber unsinnige** Angabe wird abgelehnt', () => {
    // `undefined` ist hier **absichtlich nicht** dabei: Eine Ablage aus der Zeit **vor** der Versionierung wird
    // als `legacy` benannt und beim nächsten Speichern gestempelt — nicht heimlich als „Version 1" gedeutet und
    // auch nicht abgelehnt, denn das würde jede bestehende Ablage unlesbar machen.
    for (const wert of [null, 0, -1, 1.5, NaN, '1', {}]) {
      expect(() => assertPdfStudioSchema({ schemaVersion: wert }), `Wert ${String(wert)}`).toThrow();
    }
    expect(() => assertPdfStudioSchema(null)).not.toThrow(); // kein Feld = Altbestand
    expect(() => assertPdfStudioSchema(undefined)).not.toThrow();
  });

  it('der Altbestand wird **benannt**, nicht stillschweigend durchgewinkt', () => {
    // Der Unterschied, der zählt: `legacy` ist ein **Ergebnis**, keine Ausnahme. Wer die Ablage liest, kann
    // darauf reagieren (stempeln) — und niemand kann behaupten, es sei „geprüft" gewesen.
    expect(resolvePdfStudioSchema({})).toEqual({ verdict: 'legacy', reason: 'written-before-versioning' });
    expect(resolvePdfStudioSchema({ schemaVersion: PDF_STUDIO_SCHEMA_VERSION })).toEqual({ verdict: 'current', version: PDF_STUDIO_SCHEMA_VERSION });
  });

  it('der Fehler nennt die Art und den Grund', () => {
    try {
      assertPdfStudioSchema({ schemaVersion: 99 });
      throw new Error('hätte werfen müssen');
    } catch (fehler) {
      expect((fehler as { kind?: string }).kind).toBe('PdfStudio');
      expect((fehler as { reason?: string }).reason).toBe('newer-than-supported');
    }
  });
});
