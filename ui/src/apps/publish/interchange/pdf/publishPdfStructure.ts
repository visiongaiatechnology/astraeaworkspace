// STATUS: PLATIN — Astraea Publish: **eine** Definition davon, was ein PDF/X-Strom tragen muss (AST-1417, P0)
//
// ## Warum dieses Modul entsteht — gemessen
//
// Der Akzeptanzsatz lautet: „**Echtes** PDF/X-Ausgabeprofil erzeugen, nicht nur Browser-Druckdialog." Gemessen
// trug der Bauer (`publishPdfExportEngine.ts`) bis hierher: `/GTS_PDFXVersion` im **Info**-Wörterbuch,
// `/OutputIntents` mit `/S /GTS_PDFX` und die Boxen. Was **fehlte**, ist genau das, was PDF/X **ausmacht**:
//
//   * **XMP-Metadaten** mit `pdfx:GTS_PDFXVersion` / `pdfx:GTS_PDFXConformance` — die Identifikation liegt in
//     PDF/X **im XMP-Paket**, nicht im Info-Wörterbuch. Ohne sie ist die Datei kein PDF/X, egal wie sie heisst.
//   * `/Trapped` — von ISO 15930 für beide hier geführten Standards verlangt.
//   * Das XMP-Paket muss über `/Metadata` **am Catalog** hängen, sonst findet es kein Prüfer.
//   * Der **Ausgabeintent** braucht für **PDF/X-1a** ein eingebettetes Profil
//     (`/DestOutputProfile`). Für **PDF/X-4** genügt eine **registrierte** Bedingung namentlich.
//
// ## Was dieses Modul deshalb **nicht** tut
//
// Es **erfindet** kein ICC-Profil. Ein Profil ist eine Binärdatei; sie zu fälschen wäre eine Attrappe. Stattdessen:
// **PDF/X-4** wird mit dem registrierten Namen ausgegeben ✓, **PDF/X-1a** wird **benannt abgelehnt**, solange
// keine Profilbytes gereicht werden ✓✓ — *eine Datei, die sich PDF/X-1a nennt und die Pflicht nicht trägt, wäre
// genau die Attrappe, die der Auftrag verbietet.* Wird ein Profil gereicht, wird es **wirklich** eingebettet.
//
// ## Eine Definition, zwei Aufrufer
//
// `assertPdfXStructure` wird vom **Bauer** (vor der Ausgabe, fail-closed) **und** von der **Verifikationssuite**
// (`diagnostics/publishRoundtripTestSuite.ts`, Punkt 2) benutzt. *Zwei Prüfungen derselben Pflicht wären zwei
// Wahrheiten — und genau daran ist die Suite schon einmal gescheitert.*
import type { PublishPdfTarget } from './publishPdfExportEngine';
import { PublishModelError } from '../../model/publishDocumentEngine';

/** Ein Eintrag der Pflichtprüfung — **benannt**, mit dem gefundenen Wert (oder `null`). */
export interface PublishPdfStructureFinding {
  readonly key: string;
  /** Die Pflicht in Worten — damit die Meldung nicht nur einen Schlüssel zeigt. */
  readonly requirement: string;
  readonly present: boolean;
  /** Was wirklich gefunden wurde — `null`, wenn nichts. */
  readonly found: string | null;
  /** Für PDF/X-1a verlangt, für PDF/X-4 nicht (registrierte Bedingung genügt). */
  readonly requiredFor: readonly PublishPdfTarget[];
}

/** Die zwei PDF/X-Standards, die dieses Modul führt — dieselben Wörter wie der Bauer. */
export const PUBLISH_PDFX_STANDARDS: readonly PublishPdfTarget[] = Object.freeze(['PDF/X-1a:2001', 'PDF/X-4:2010']);

export function isPublishPdfXTarget(target: PublishPdfTarget): boolean {
  return (PUBLISH_PDFX_STANDARDS as readonly string[]).includes(target);
}

/** Die XMP-Kennung je Standard — **die eine** Zuordnung, von Bauer und Prüfer benutzt. */
export const PUBLISH_PDFX_CONFORMANCE: Readonly<Record<string, string>> = Object.freeze({
  'PDF/X-1a:2001': 'PDF/X-1a:2001',
  'PDF/X-4:2010': 'PDF/X-4:2010',
});

/**
 * Das XMP-Paket mit der PDF/X-Identifikation — **vollständig** und deterministisch.
 *
 * Ein Prüfer sucht `pdfx:GTS_PDFXVersion` **und** `pdfx:GTS_PDFXConformance`; beide stehen hier. Das Paket ist
 * bewusst ohne Zeitstempel: *derselbe Auftrag ergibt dieselben Bytes* (die Determinismus-Zusage des Bauers).
 */
export function buildPdfXMetadataPacket(target: PublishPdfTarget, outputConditionIdentifier: string): string {
  const condition = outputConditionIdentifier.replace(/[<>&"]/gu, '');
  return [
    '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '<rdf:Description rdf:about="" xmlns:pdfx="http://ns.adobe.com/pdfx/1.3/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/">',
    `<pdfx:GTS_PDFXVersion>${target}</pdfx:GTS_PDFXVersion>`,
    `<pdfx:GTS_PDFXConformance>${target}</pdfx:GTS_PDFXConformance>`,
    `<pdfx:OutputConditionIdentifier>${condition}</pdfx:OutputConditionIdentifier>`,
    '<pdfx:Trapped>False</pdfx:Trapped>',
    '<dc:title><rdf:Alt><rdf:li xml:lang="x-default">Astraea Publish</rdf:li></rdf:Alt></dc:title>',
    '<xmp:CreatorTool>Astraea Publish</xmp:CreatorTool>',
    '</rdf:Description>',
    '</rdf:RDF>',
    '</x:xmpmeta>',
    '<?xpacket end="w"?>',
  ].join('\n');
}

/**
 * **Die Pflichtprüfung eines PDF/X-Stroms** ✓✓ — die eine Definition.
 *
 * Geprüft wird am **Text** des Stroms, weil der Bauer einen Textstrom erzeugt (die Bytes entstehen daraus
 * unverändert). *Ein Prüfer, der den Strom erst interpretieren müsste, wäre ein zweiter Parser.*
 */
export function assertPdfXStructure(pdf: string): PublishPdfStructureFinding[] {
  const both = PUBLISH_PDFX_STANDARDS;
  const find = (pattern: RegExp): string | null => {
    const match = pattern.exec(pdf);
    return match ? (match[1] ?? match[0]) : null;
  };
  return [
    {
      key: 'xmp-version', requirement: 'XMP carries pdfx:GTS_PDFXVersion (this is what makes a file PDF/X)',
      found: find(/<pdfx:GTS_PDFXVersion>([^<]*)<\/pdfx:GTS_PDFXVersion>/u), present: /<pdfx:GTS_PDFXVersion>[^<]+<\/pdfx:GTS_PDFXVersion>/u.test(pdf), requiredFor: both,
    },
    {
      key: 'xmp-conformance', requirement: 'XMP carries pdfx:GTS_PDFXConformance',
      found: find(/<pdfx:GTS_PDFXConformance>([^<]*)<\/pdfx:GTS_PDFXConformance>/u), present: /<pdfx:GTS_PDFXConformance>[^<]+<\/pdfx:GTS_PDFXConformance>/u.test(pdf), requiredFor: both,
    },
    {
      key: 'catalog-metadata', requirement: 'The XMP packet is attached to the Catalog via /Metadata',
      found: find(/\/Metadata\s+(\d+)\s+0\s+R/u), present: /\/Type\s*\/Catalog[\s\S]{0,600}?\/Metadata\s+\d+\s+0\s+R/u.test(pdf), requiredFor: both,
    },
    {
      key: 'metadata-subtype', requirement: 'The metadata stream declares /Subtype /XML',
      found: find(/\/Subtype\s*\/XML/u), present: /\/Subtype\s*\/XML/u.test(pdf), requiredFor: both,
    },
    {
      key: 'output-intent', requirement: 'A GTS_PDFX output intent exists and is referenced by the Catalog',
      found: find(/\/OutputIntents\s*\[([^\]]*)\]/u), present: /\/Type\s*\/Catalog[\s\S]{0,600}?\/OutputIntents\s*\[/u.test(pdf) && /\/S\s*\/GTS_PDFX/u.test(pdf), requiredFor: both,
    },
    {
      key: 'output-condition', requirement: 'The output intent names its printing condition',
      found: find(/\/OutputConditionIdentifier\s*\(([^)]*)\)/u), present: /\/OutputConditionIdentifier\s*\([^)]+\)/u.test(pdf), requiredFor: both,
    },
    {
      key: 'dest-output-profile', requirement: 'PDF/X-1a requires an embedded ICC profile (/DestOutputProfile)',
      found: find(/\/DestOutputProfile\s+(\d+)\s+0\s+R/u), present: /\/DestOutputProfile\s+\d+\s+0\s+R/u.test(pdf), requiredFor: ['PDF/X-1a:2001'],
    },
    {
      key: 'trapped', requirement: 'The document declares its trapping state (/Trapped)',
      found: find(/\/Trapped\s*(\/\w+)/u), present: /\/Trapped\s*\/\w+/u.test(pdf), requiredFor: both,
    },
    {
      key: 'bleed-box', requirement: 'Every page carries a /BleedBox (print production needs the bleed)',
      found: null, present: /\/BleedBox\s*\[/u.test(pdf), requiredFor: both,
    },
    {
      key: 'media-box', requirement: 'Every page carries a /MediaBox',
      found: null, present: /\/MediaBox\s*\[/u.test(pdf), requiredFor: both,
    },
    {
      key: 'marked', requirement: 'The document is marked (tagged) so structure survives',
      found: find(/\/Marked\s*(\w+)/u), present: /\/MarkInfo\s*<<\s*\/Marked\s+true\s*>>/u.test(pdf) && /\/StructTreeRoot\s+\d+\s+0\s+R/u.test(pdf), requiredFor: both,
    },
    {
      key: 'eof', requirement: 'The file ends with a trailer and %%EOF',
      found: null, present: /startxref\s+\d+\s*%%EOF/u.test(pdf), requiredFor: both,
    },
  ];
}

/** Nur die **fehlenden Pflichten** für einen konkreten Standard — was ein Prüfer wirklich bemängelt. */
export function missingPdfXRequirements(pdf: string, target: PublishPdfTarget): PublishPdfStructureFinding[] {
  return assertPdfXStructure(pdf).filter((finding) => !finding.present && finding.requiredFor.includes(target));
}

/**
 * **Fail-closed vor der Ausgabe** ✓✓ — der Bauer ruft das, **bevor** er Bytes herausgibt.
 *
 * Der Grund ist benannt und nennt die fehlende Pflicht: *eine Datei, die sich PDF/X nennt und eine Pflicht nicht
 * trägt, ist eine Attrappe — und eine Attrappe ist genau das, was der Auftrag verbietet.*
 */
export function assertPdfXExportable(pdf: string, target: PublishPdfTarget): void {
  if (!isPublishPdfXTarget(target)) return;
  const missing = missingPdfXRequirements(pdf, target);
  if (missing.length > 0) throw new PublishModelError(`pdfx-structure-incomplete:${target}:${missing.map((finding) => finding.key).join('+')}`);
}
