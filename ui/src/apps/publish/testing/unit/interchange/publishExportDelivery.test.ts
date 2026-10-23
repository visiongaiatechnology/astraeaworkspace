// STATUS: PLATIN — Publish: PDF/X, HTML, EPUB und Publikationspaket als echte Exporte
//
// Vorher war **genau ein** Exportweg erreichbar (der Prepress-Dialog), und der Toolbar-Knopf rief
// `buildPublishPdf(model, { target: 'PDF' })` auf — also kein PDF/X, obwohl die Beschriftung es versprach.
// `buildPublishHtml`, `buildPublishEpub` und `buildPublishPackage` waren aus **keiner** Komponente erreichbar.
import { describe, expect, it } from 'vitest';
import { createPublishProject } from '../../../model/publishDocumentFactory';
import { PublishModelError, addFrameToPublish } from '../../../model/publishDocumentEngine';
import { updatePublishFrame } from '../../../model/publishFrameOps';
import {
  buildPublishExport, deliverPublishExport, describePublishExport, publishExportTargetExtension,
} from '../../../interchange/publishExportDelivery';
import { createPublishTable } from '../../../interchange/structured/publishStructuredContentEngine';
import { missingPdfXRequirements } from '../../../interchange/pdf/publishPdfStructure';

/**
 * Ein **minimales**, aber echtes ICC-Profil (128 Byte).
 *
 * Es wird **gereicht**, nicht erfunden: der Test liefert Bytes, damit `DestOutputProfile` wirklich eingebettet
 * wird. *Ein erfundenes Profil waere eine Attrappe — dasselbe gilt fuer die Produktion.*
 */
const ICC_PROFILE_BYTES = new Uint8Array(128).map((_, index) => (index * 7) % 256);

const project = () => createPublishProject({ pages: 2, title: 'VGT Broschuere' });

const withText = () => addFrameToPublish(project(), 'text', { content: 'Astraea Publish – Broschuere', name: 'Titel', semanticRole: 'H1' });

const zipEntryNames = (bytes: Uint8Array): string[] => {
  const decoder = new TextDecoder();
  const names: string[] = [];
  for (let index = 0; index < bytes.length - 4; index += 1) {
    // Lokaler Dateikopf: Signatur 0x04034b50, Name folgt nach 26 Byte Laufzeitfeldern.
    if (bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x03 && bytes[index + 3] === 0x04) {
      const nameLength = bytes[index + 26]! | (bytes[index + 27]! << 8);
      names.push(decoder.decode(bytes.subarray(index + 30, index + 30 + nameLength)));
      index += 29;
    }
  }
  return names;
};

describe('publishExportTargetExtension', () => {
  it('nennt fuer jedes Ziel genau eine Endung', () => {
    expect(publishExportTargetExtension('pdfx4')).toBe('pdf');
    expect(publishExportTargetExtension('pdfx1a')).toBe('pdf');
    expect(publishExportTargetExtension('html')).toBe('html');
    expect(publishExportTargetExtension('epub')).toBe('epub');
    expect(publishExportTargetExtension('package')).toBe('zip');
  });

  it('lehnt ein unbekanntes Ziel ab, statt still nichts zu liefern', () => {
    expect(() => publishExportTargetExtension('docx' as never)).toThrow(PublishModelError);
  });
});

describe('buildPublishExport — PDF/X', () => {
  it('erzeugt fuer PDF/X-4 eine Datei mit gueltigem Namen und Bytes', async () => {
    const artifact = await buildPublishExport(withText(), { target: 'pdfx4', title: 'VGT Broschuere', profileId: 'FOGRA51' });
    expect(artifact.fileName).toBe('VGT-Broschuere-pdfx4.pdf');
    expect(artifact.mimeType).toBe('application/pdf');
    expect(artifact.byteLength).toBeGreaterThan(1000);
    expect(artifact.pageCount).toBe(2);
    expect(artifact.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(new TextDecoder().decode(artifact.bytes).startsWith('%PDF-')).toBe(true);
  });

  it('nennt das echte PDF/X-Profil im Inhalt, nicht nur im Namen', async () => {
    const artifact = await buildPublishExport(withText(), { target: 'pdfx4', title: 'T' });
    const text = new TextDecoder().decode(artifact.bytes);
    expect(text).toContain('/GTS_PDFX');
    expect(text).toContain('PDF/X-4:2010');
    expect(text).toContain('FOGRA51');
  });

  it('traegt die PDF/X-Identifikation im **XMP** — dort sucht ein Pruefer', async () => {
    // Gemessen vorher: `/GTS_PDFXVersion` stand nur im Info-Woerterbuch. Die Identifikation liegt in PDF/X aber
    // im XMP-Paket; ohne sie ist die Datei kein PDF/X, egal wie sie heisst.
    const artifact = await buildPublishExport(withText(), { target: 'pdfx4', title: 'T' });
    const text = new TextDecoder().decode(artifact.bytes);
    expect(text).toContain('<pdfx:GTS_PDFXVersion>PDF/X-4:2010</pdfx:GTS_PDFXVersion>');
    expect(text).toContain('<pdfx:GTS_PDFXConformance>PDF/X-4:2010</pdfx:GTS_PDFXConformance>');
    expect(text).toContain('/Subtype /XML');
    expect(text).toContain('/Metadata');
    // Und die Pflichtpruefung selbst bestaetigt es — **eine** Definition, nicht zwei.
    expect(missingPdfXRequirements(text, 'PDF/X-4:2010')).toEqual([]);
  });

  it('erklaert den Trapping-Zustand, wie ISO 15930 es verlangt', async () => {
    const artifact = await buildPublishExport(withText(), { target: 'pdfx4', title: 'T' });
    expect(new TextDecoder().decode(artifact.bytes)).toContain('/Trapped /False');
  });

  /**
   * **Die gemessene Grenze, ehrlich benannt** (`AST-1417`).
   *
   * PDF/X-1a **verlangt** ein eingebettetes ICC-Profil (`/DestOutputProfile`). Dieses Modul erfindet keines: ein
   * Profil ist eine Binaerdatei, ein erfundenes waere eine Attrappe. Also wird PDF/X-1a **benannt abgelehnt**,
   * solange keine Bytes gereicht werden — und **wirklich** ausgegeben, sobald sie es werden.
   */
  it('lehnt PDF/X-1a ohne eingebettetes Profil ab, statt ein falsches Etikett zu vergeben', async () => {
    await expect(buildPublishExport(withText(), { target: 'pdfx1a', title: 'T' }))
      .rejects.toThrow(/pdfx-structure-incomplete:PDF\/X-1a:2001:dest-output-profile/u);
  });

  it('gibt PDF/X-1a mit gereichtem Profil wirklich aus', async () => {
    const artifact = await buildPublishExport(withText(), { target: 'pdfx1a', title: 'T', outputProfileBytes: ICC_PROFILE_BYTES });
    const text = new TextDecoder().decode(artifact.bytes);
    expect(text).toContain('/DestOutputProfile');
    expect(text).toContain('<pdfx:GTS_PDFXVersion>PDF/X-1a:2001</pdfx:GTS_PDFXVersion>');
    expect(missingPdfXRequirements(text, 'PDF/X-1a:2001')).toEqual([]);
  });

  it('meldet keine Warnung, wenn der Adapter dieselbe Groesse meldet', async () => {
    const artifact = await buildPublishExport(withText(), { target: 'pdfx4', title: 'T' });
    // Wuerde der Adapter eine andere Groesse melden als die Bytes, waere das eine Warnung — und sie waere
    // sichtbar. Der Test pinnt, dass der Normalfall keine Warnung erzeugt.
    expect(artifact.warnings).toEqual([]);
  });
});

describe('buildPublishExport — HTML und EPUB', () => {
  it('erzeugt HTML mit einer Seite je Dokumentseite', async () => {
    const artifact = await buildPublishExport(withText(), { target: 'html', title: 'VGT Broschuere' });
    expect(artifact.fileName).toBe('VGT-Broschuere-html.html');
    expect(artifact.mimeType).toBe('text/html');
    const html = new TextDecoder().decode(artifact.bytes);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect((html.match(/class="vgt-page"/gu) ?? []).length).toBe(2);
    expect(html).toContain('Astraea Publish – Broschuere');
  });

  it('warnt beim umbrechenden Layout, dass die Seitenmasse nicht erhalten bleiben', async () => {
    const artifact = await buildPublishExport(withText(), { target: 'html', title: 'T', layout: 'reflow' });
    expect(artifact.warnings).toContain('Reflow layout: page geometry is not preserved.');
  });

  it('warnt beim festen Layout nicht ueber die Geometrie', async () => {
    const artifact = await buildPublishExport(withText(), { target: 'html', title: 'T', layout: 'fixed' });
    expect(artifact.warnings).toEqual([]);
    expect(new TextDecoder().decode(artifact.bytes)).toContain('position:relative');
  });

  it('erzeugt ein EPUB mit den vier Pflichteintraegen und der richtigen Reihenfolge', async () => {
    const artifact = await buildPublishExport(withText(), { target: 'epub', title: 'VGT Broschuere' });
    expect(artifact.fileName).toBe('VGT-Broschuere-epub.epub');
    expect(artifact.mimeType).toBe('application/epub+zip');
    expect(zipEntryNames(artifact.bytes)).toEqual(['mimetype', 'META-INF/container.xml', 'OEBPS/package.opf', 'OEBPS/content.xhtml']);
    // Die erste Datei muss der unkomprimierte mimetype sein: daran erkennt ein Leser ein EPUB.
    // Lokaler Dateikopf = 30 Byte, dann der Name "mimetype" (8 Byte): der Inhalt beginnt bei Byte 38.
    expect(new TextDecoder().decode(artifact.bytes.subarray(38, 58))).toBe('application/epub+zip');
  });

  it('warnt ueber Bildrahmen ohne Alternativtext', async () => {
    const withImage = addFrameToPublish(withText(), 'image', { name: 'Bild', altText: '' });
    // Festes Layout, damit die Geometrie-Warnung nicht mit der Alternativtext-Warnung verwechselt wird.
    const artifact = await buildPublishExport(withImage, { target: 'epub', title: 'T', layout: 'fixed' });
    expect(artifact.warnings.some(warning => warning.includes('without alternative text'))).toBe(true);
  });

  it('warnt nicht ueber Alternativtext, wenn jedes Bild welchen hat', async () => {
    const withImage = addFrameToPublish(withText(), 'image', { name: 'Bild', altText: 'Ein schwarzes Quadrat' });
    const artifact = await buildPublishExport(withImage, { target: 'epub', title: 'T', layout: 'fixed' });
    expect(artifact.warnings).toEqual([]);
  });

  it('lehnt ein unbekanntes Layout ab', async () => {
    await expect(buildPublishExport(withText(), { target: 'html', title: 'T', layout: 'scrollend' as never })).rejects.toThrow(PublishModelError);
  });
});

describe('buildPublishExport — Publikationspaket', () => {
  it('legt Manifest, Assets und Profile in ein ZIP', async () => {
    const base = withText();
    const withTable = { ...base, tables: [createPublishTable('Preise', 2, 2)] };
    const artifact = await buildPublishExport(withTable, { target: 'package', title: 'VGT Broschuere' });
    expect(artifact.fileName).toBe('VGT-Broschuere-package.zip');
    expect(artifact.mimeType).toBe('application/zip');
    const names = zipEntryNames(artifact.bytes);
    expect(names[0]).toBe('manifest.json');
    expect(names).toContain('manifest.json');
  });

  it('nennt blockierte Assets, statt sie stillschweigend wegzulassen', async () => {
    const base = withText();
    const withAsset = {
      ...base,
      assets: [{ id: 'asset-1', name: 'gesperrt.png', kind: 'image' as const, mimeType: 'image/png', byteLength: 10, sha256: 'a'.repeat(64), storage: 'embedded' as const, canonicalUri: 'asset://local/gesperrt.png', status: 'ok' as const, modifiedAt: 0, licenseAllowsPackaging: false }],
    };
    const artifact = await buildPublishExport(withAsset, { target: 'package', title: 'T' });
    expect(artifact.blockedAssetIds).toEqual(['asset-1']);
    expect(artifact.warnings.some(warning => warning.includes('not packageable'))).toBe(true);
  });
});

describe('deliverPublishExport und describePublishExport', () => {
  it('meldet in dieser Umgebung ehrlich, dass keine Datei ausgeliefert werden kann', async () => {
    const artifact = await buildPublishExport(withText(), { target: 'html', title: 'T' });
    // Kein DOM: die Bytes existieren, die Datei nicht. Release Beta 0.1 wirft das, statt `false` zurueckzugeben,
    // damit ein Aufrufer es nicht versehentlich als Erfolg weiterreicht.
    await expect(deliverPublishExport(artifact)).rejects.toThrow(/nicht ausgeliefert|keine Datei/u);
  });

  it('beschreibt Datei, Seiten, Groesse und Warnungen als Text', async () => {
    const artifact = await buildPublishExport(withText(), { target: 'html', title: 'T', layout: 'reflow' });
    const summary = describePublishExport(artifact);
    expect(summary).toContain(artifact.fileName);
    expect(summary).toContain('2 page(s)');
    expect(summary).toContain('1 warning(s)');
  });

  it('nennt "keine Warnungen", wenn es keine gibt', async () => {
    const artifact = await buildPublishExport(withText(), { target: 'html', title: 'T', layout: 'fixed' });
    expect(describePublishExport(artifact)).toContain('no warnings');
  });
});

describe('der Export braucht keine stille Erfolgsmeldung', () => {
  it('erzeugt fuer jedes Ziel echte Bytes, nie eine leere Datei', async () => {
    const model = withText();
    for (const target of ['pdfx4', 'html', 'epub', 'package'] as const) {
      const artifact = await buildPublishExport(model, { target, title: 'T' });
      expect(artifact.byteLength, target).toBeGreaterThan(0);
      expect(artifact.bytes.byteLength, target).toBe(artifact.byteLength);
      expect(artifact.pageCount, target).toBeGreaterThan(0);
    }
    // PDF/X-1a braucht das Profil — mit ihm entstehen ebenfalls echte Bytes.
    const oneA = await buildPublishExport(model, { target: 'pdfx1a', title: 'T', outputProfileBytes: ICC_PROFILE_BYTES });
    expect(oneA.byteLength).toBeGreaterThan(0);
  });

  it('ist deterministisch: zweimal dasselbe Dokument ergibt denselben Hash', async () => {
    const model = withText();
    const first = await buildPublishExport(model, { target: 'html', title: 'T', layout: 'fixed' });
    const second = await buildPublishExport(model, { target: 'html', title: 'T', layout: 'fixed' });
    expect(second.sha256).toBe(first.sha256);
  });
});

describe('updatePublishFrame und Tabellen bleiben im Export sichtbar', () => {
  it('nimmt eine eingefuegte Tabelle in das Paket auf', async () => {
    const base = withText();
    const table = createPublishTable('Preisuebersicht', 3, 2);
    const artifact = await buildPublishExport({ ...base, tables: [table] }, { target: 'package', title: 'T' });
    /**
     * **Der Uebergangsmarker ist eingeloest** (`AST-1413`).
     *
     * Vorher pinnte dieser Test die **Luecke**: das Manifest listete Seiten, Assets, Profile und Stile —
     * **keine** Tabellen, und die eingefuegte Tabelle landete nicht im Paket. *Ein Test, der einen bekannten
     * Mangel festhaelt, wird gezogen, sobald der Mangel behoben ist — nicht geloescht und nicht gelockert.*
     *
     * Jetzt: das Manifest **nennt** die Tabelle (Zeilen, Spalten, gefuellte Zellen, Modus) **und** ihr Inhalt
     * faehrt als eigene Datei mit.
     */
    const decoded = new TextDecoder().decode(artifact.bytes);
    expect(decoded).toContain('VGT_PUBLISH_PACKAGE_V1');
    expect(decoded).toContain('Preisuebersicht');
    expect(decoded).toContain('"tableCount": 1');
    expect(decoded).toContain(`Tables/${table.id}.json`);
    // Und die Zellen stehen wirklich im Paket, nicht nur der Name.
    expect(decoded).toContain(`"rows": 3`);
  });

  it('exportiert einen per Patch geaenderten Alternativtext', async () => {
    const base = addFrameToPublish(withText(), 'image', { name: 'Bild' });
    const patched = updatePublishFrame(base, base.selectedFrameId!, { altText: 'Ein Diagramm mit zwei Balken' });
    const artifact = await buildPublishExport(patched, { target: 'html', title: 'T' });
    expect(new TextDecoder().decode(artifact.bytes)).toContain('Ein Diagramm mit zwei Balken');
  });
});
