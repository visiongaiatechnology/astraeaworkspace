// STATUS: PLATIN — Der Publish-Export ist ein Vorgang mit Ziel, Zustand und Fehlerpfad
//
// Gemessen vor der Behebung (Runde 59): `PublishView.handleExportPdf` rief `window.print()` auf — kein
// Dateiexport, kein Fortschritt, kein Fehlerzustand, keine Vorpruefung. Der echte Bauer (`buildPublishPdf`)
// existierte daneben und wurde nur vom Prepress-Dialog benutzt.
//
// Gemessen in Runde Publish-5: die Beschriftung sagte „PDF/X Export", der Aufruf uebergab `target: 'PDF'` —
// also gar kein PDF/X. Und `buildPublishHtml`, `buildPublishEpub` und `buildPublishPackage` existierten,
// waren aber aus **keiner** Komponente erreichbar.
//
// Ein gerenderter Test braucht ein DOM, das diese Umgebung nicht hat; gepinnt wird deshalb die Verdrahtung im
// Quelltext — mit entfernten Kommentaren, weil die Datei die alte Fassung erklaert.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
// Drei Ebenen hoch: interop → unit → testing → publish. Die neunte Wiederholung dieser Ebenenfalle im
// Projekt — der Importpfad-Waechter prueft auch `path.resolve`-Pfade und meldet sie im Gesamtlauf.
const publish = path.resolve(here, '../../..');
const read = (relative) => readFileSync(path.resolve(publish, relative), 'utf8');
const code = (relative) => read(relative).replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');

const view = code('PublishView.tsx');
const toolbar = code('editor/PublishToolbar.tsx');
const delivery = code('interchange/publishExportDelivery.ts');

describe('der Export erzeugt eine echte Datei', () => {
  it('ruft nicht mehr den Druckdialog auf', () => {
    expect(view).not.toContain('window.print()');
    expect(toolbar).not.toContain('window.print()');
  });

  it('benutzt den einen Exportweg statt eines eigenen Bauers in der Ansicht', () => {
    expect(view).toContain("import { buildPublishExport, deliverPublishExport, describePublishExport");
    expect(view).toContain('await buildPublishExport(model, { target, title:');
    // Kein zweiter Bauer und keine zweite Auslieferung in der Ansicht.
    expect(view).not.toContain('buildPublishPdf');
    expect(view).not.toContain('createObjectURL');
  });

  it('liefert ueber die eine Auslieferungsfunktion aus und benennt fehlende Schreibbestaetigung', () => {
    // Release Beta 0.1: die Auslieferung ist asynchron und meldet `mode:'file'` nur nach bestaetigtem
    // Schreiben. Ein Browser-Download ist ein eigener, sichtbar benannter Zustand — kein Fehler, aber
    // auch kein "gespeichert".
    expect(view).toContain('const delivery = await deliverPublishExport(artifact);');
    expect(view).toContain("delivered: delivery.mode === 'file'");
    expect(view).toContain("if (delivery.mode !== 'file') setNotice({ kind: 'info'");
    expect(view).not.toContain("t('unsupportedEnvironment')");
  });

  it('bildet den Dateinamen aus dem Titel, nicht aus einer Konstante', () => {
    expect(view).toContain("title: document.title || 'Astraea Publication'");
    // Der Stamm kommt aus dem **aufgeloesten** Ziel (Aufruf oder gespeicherte Vorgabe, AST-1428).
    expect(delivery).toContain('boundStem(title, target, 120)');
  });

  it('bietet jedes Ziel einzeln an und nennt es', () => {
    // Vorher gab es **einen** Knopf mit dem Text „PDF/X Export", der `target: 'PDF'` aufrief.
    for (const target of ['pdfx4', 'pdfx1a', 'html', 'epub', 'package']) {
      expect(toolbar, target).toContain(`PUBLISH_EXPORT_TARGETS`);
      expect(delivery, target).toContain(`'${target}'`);
    }
    expect(toolbar).toContain('PUBLISH_EXPORT_TARGETS.map((target)');
    expect(toolbar).toContain('data-publish-export-button={target}');
  });

  it('uebergibt das echte PDF/X-Ziel statt eines Platzhalters', () => {
    expect(delivery).toContain("target === 'pdfx1a' ? 'PDF/X-1a:2001' : 'PDF/X-4:2010'");
    expect(delivery).not.toContain("target: 'PDF'");
  });

  it('liest eine gespeicherte Ausgabevorgabe, statt das Ziel immer vom Aufruf zu nehmen (AST-1428)', () => {
    // Gemessen vorher: `model.exportPresets` stand im Vertrag und **kein** Exportweg las es.
    expect(delivery).toContain('resolvePublishExportPreset(model, request.presetId)');
    expect(delivery).toContain('const target = request.target ?? resolvedPreset?.target;');
    expect(delivery).toContain('const layout = request.layout ?? resolvedPreset?.layout ?? ');
    expect(delivery).toContain('const profileId = request.profileId ?? resolvedPreset?.profileId;');
  });
});

describe('der Export hat Zustaende', () => {
  it('kennt Leerlauf, Arbeit, Erfolg und Fehler', () => {
    for (const kind of ['idle', 'busy', 'done', 'error']) {
      expect(view, kind).toContain(`kind: '${kind}'`);
    }
  });

  it('verhindert den zweiten Lauf', () => {
    // Zwei Klicks waehrend des Exports erzeugten sonst zwei Dateien.
    expect(view).toContain("if (exportState.kind === 'busy') return;");
    expect(toolbar).toContain('disabled={busy}');
    expect(toolbar).toContain('aria-busy={exporting === target}');
  });

  it('zeigt den Zustand als Text, nicht nur als Farbe', () => {
    expect(view).toContain("role={exportState.kind === 'error' ? 'alert' : 'status'}");
    expect(view).toContain('data-publish-export-state={exportState.kind}');
    expect(view).toContain("localeFormat('exportRunning'");
    expect(view).toContain("localeFormat('exportDone'");
  });

  it('nennt das Ziel im Zustand — „PDF/X-4" und „EPUB" sind verschiedene Ergebnisse', () => {
    expect(view).toContain("data-publish-export-target={exportState.kind === 'busy' ? exportState.target");
    expect(view).toContain("setExportState({ kind: 'busy', target });");
  });

  it('berichtet Warnungen und blockierte Assets', () => {
    expect(delivery).toContain('warnings');
    expect(delivery).toContain('blockedAssetIds');
    expect(view).toContain('describePublishExport(exportState.artifact)');
  });

  it('nennt den Grund eines Fehlschlags konkret', () => {
    expect(view).toContain("localeFormat('exportFailed', { reason: exportState.message })");
    expect(view).toContain("cause instanceof Error ? cause.message : 'Unbekannter Fehler'");
  });
});

describe('die Toolbar bleibt bedienbar', () => {
  it('hat einen Typ, einen zugaenglichen Namen und einen gesperrten Zustand', () => {
    expect(toolbar).toContain('type="button"');
    expect(toolbar).toContain('aria-label={busy ?');
    expect(toolbar).toContain('disabled:opacity-50');
  });

  it('sperrt die Knoepfe standardmaessig nicht', () => {
    expect(toolbar).toContain('exporting = null');
  });
});

describe('jedes Exportziel ist ohne DOM pruefbar', () => {
  it('baut Bytes, Dateiname und MIME-Typ an einer Stelle', () => {
    expect(delivery).toContain('export async function buildPublishExport');
    expect(delivery).toContain('fileName: `${stem}.${extension}`');
    expect(delivery).toContain('const TARGET_MIME');
    expect(delivery).toContain('const TARGET_EXTENSION');
  });

  it('lehnt ein unbekanntes Ziel ab, statt still nichts zu tun', () => {
    expect(delivery).toContain("throw new PublishModelError(`export-target-unknown:${String(target)}`)");
  });

  it('benutzt fuer EPUB und Paket denselben ZIP-Schreiber', () => {
    expect(delivery).toContain('zipStoreFiles(entries.map');
    const engine = code('interchange/publishExportEngine.ts');
    expect(engine).toContain('export function zipStoreFiles');
    // Genau eine ZIP-Implementierung: der lokale Schreibkern wird nur ueber die oeffentliche Funktion geteilt.
    expect((engine.match(/function zipStore\(/gu) ?? []).length).toBe(1);
  });
});
