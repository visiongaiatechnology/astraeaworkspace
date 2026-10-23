// STATUS: DIAMANT VGT SUPREME — Astraea Publish: EIN Exportweg mit Zustand und benannten Grenzen
//
// Befund vor dieser Datei (gemessen, Runde Publish-5):
//   • Die Toolbar hatte **einen** Knopf „PDF/X Export", der `buildPublishPdf(model, {target:'PDF'})` aufrief
//     — also gar kein PDF/X, obwohl die Beschriftung es versprach. Der echte PDF/X-Adapter
//     (`exportPublishToPdfX`) lag nur im Prepress-Dialog.
//   • `buildPublishHtml`, `buildPublishEpub` und `buildPublishPackage` existierten und waren aus **keiner**
//     Komponente erreichbar. „EPUB/HTML ausgeben" und „Publikation verpacken" waren nicht ausfuehrbar.
//   • Der Prepress-Dialog baute seinen eigenen Download-Anker **ohne** Fehlerpfad: schlug
//     `URL.createObjectURL` fehl, passierte sichtbar nichts.
//
// Diese Datei besitzt die Zuordnung „Exportziel → Bytes, Dateiname, MIME-Typ" **einmal**. Die UI entscheidet
// nur noch, welches Ziel gewaehlt wurde, und zeigt das Ergebnis oder den Fehler.
import type { PublishDocumentModel } from '../../../shared/contracts/publish/workspacePublish';
import type { IccProfileId } from '../prepress/publishPrepressEngine';
import { PublishModelError } from '../model/publishDocumentEngine';
import { buildPublishEpub, buildPublishHtml, buildPublishPackage, zipStoreFiles } from './publishExportEngine';
import { exportPublishToPdfX } from './pdf/publishPdfXExportEngine';
import { boundStem, deliverPublishBytes } from '../interop/publishPdfDelivery';
import type { ExportDeliveryResult } from '../../../shared/interchange/exportDelivery';
import { resolvePublishExportPreset } from '../model/publishPresetOps';

export type PublishExportTarget = 'pdfx1a' | 'pdfx4' | 'html' | 'epub' | 'package';
export type PublishDigitalLayoutChoice = 'reflow' | 'fixed';

export interface PublishExportRequest {
  target: PublishExportTarget;
  /** Nur fuer HTML/EPUB: umbrechender oder fest gesetzter Satz. */
  layout?: PublishDigitalLayoutChoice;
  profileId?: IccProfileId;
  title?: string;
  /**
   * **Das ICC-Ausgabeprofil als Bytes** — nur wenn wirklich vorhanden (`AST-1417`).
   *
   * PDF/X-1a **verlangt** es; PDF/X-4 genuegt die registrierte Bedingung namentlich. Wird es nicht gereicht,
   * lehnt der Bauer PDF/X-1a **benannt** ab (`pdfx-structure-incomplete:…:dest-output-profile`) — *ein
   * erfundenes Profil waere eine Attrappe.*
   */
  outputProfileBytes?: Uint8Array;
  /**
   * **Eine gespeicherte Ausgabevorgabe** (`AST-1428`).
   *
   * Gemessen vorher: `model.exportPresets` stand im Vertrag und **kein** Exportweg las es — das Ziel waehlte
   * immer der Aufruf. *Eine Vorgabe, die niemand liest, ist keine Vorgabe.* Ist `presetId` gesetzt, gewinnen
   * `target` und `layout` **aus der Vorgabe**; ein ausdruecklich gesetztes `target` bleibt unangetastet, damit
   * der Aufruf die Vorgabe uebersteuern kann.
   */
  presetId?: string;
}

export interface PublishExportArtifact {
  target: PublishExportTarget;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  /** Bytes fuer die Anzeige; die Datei selbst kann gross sein. */
  byteLength: number;
  pageCount: number;
  /** Was den Export einschraenkt — leer heisst: nichts gefunden. */
  warnings: string[];
  /** Nur bei `package`: Assets, die nicht mitgeliefert werden durften. */
  blockedAssetIds: string[];
  sha256: string;
}

const TARGET_EXTENSION: Record<PublishExportTarget, string> = { pdfx1a: 'pdf', pdfx4: 'pdf', html: 'html', epub: 'epub', package: 'zip' };
const TARGET_MIME: Record<PublishExportTarget, string> = { pdfx1a: 'application/pdf', pdfx4: 'application/pdf', html: 'text/html', epub: 'application/epub+zip', package: 'application/zip' };

export function publishExportTargetExtension(target: PublishExportTarget): string {
  const extension = TARGET_EXTENSION[target];
  if (!extension) throw new PublishModelError(`export-target-unknown:${String(target)}`);
  return extension;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) throw new PublishModelError('export-hash-unavailable');
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

/**
 * Erzeugt die Exportbytes. **Reine Zuordnung**, kein DOM: damit ist jeder Exportzielpfad ohne Browser
 * pruefbar. Die Auslieferung an den Nutzer ist eine separate Funktion (`deliverPublishExport`).
 */
export async function buildPublishExport(model: PublishDocumentModel, request: PublishExportRequest): Promise<PublishExportArtifact> {
  /**
   * **Die gespeicherte Vorgabe wird gelesen** (`AST-1428`) — vor allem anderen.
   *
   * Gemessen vorher: `model.exportPresets` stand im Vertrag und **kein** Exportweg las es. Ist `presetId`
   * gesetzt, kommen `target`, `layout` und das Profil **aus der Vorgabe**; ein ausdruecklich gesetztes `target`
   * uebersteuert sie. *Die Uebersetzung `kind` → Ziel steht in `model/publishPresetOps.ts` — eine Definition.*
   */
  const resolvedPreset = request.presetId === undefined ? null : resolvePublishExportPreset(model, request.presetId);
  const target = request.target ?? resolvedPreset?.target;
  if (!target) throw new PublishModelError('export-target-missing');
  const extension = publishExportTargetExtension(target);
  const title = request.title ?? 'Astraea Publication';
  const stem = boundStem(title, target, 120);
  const layout = request.layout ?? resolvedPreset?.layout ?? 'reflow';
  if (layout !== 'reflow' && layout !== 'fixed') throw new PublishModelError(`export-layout-unknown:${String(layout)}`);
  const profileId = request.profileId ?? resolvedPreset?.profileId;
  const pageCount = model.pages.length;

  if (target === 'html') {
    const html = buildPublishHtml(model, layout);
    const bytes = new TextEncoder().encode(html);
    const warnings = layout === 'reflow' ? ['Reflow layout: page geometry is not preserved.'] : [];
    return { target, fileName: `${stem}.${extension}`, mimeType: TARGET_MIME[target], bytes, byteLength: bytes.byteLength, pageCount, warnings, blockedAssetIds: [], sha256: await sha256Hex(bytes) };
  }

  if (target === 'epub') {
    const bytes = buildPublishEpub(model, layout);
    const missingAltText = model.frames.filter(frame => (frame.type === 'image' || frame.semanticRole === 'Figure') && !frame.altText?.trim()).length;
    const warnings = [
      ...(layout === 'reflow' ? ['Reflow layout: page geometry is not preserved.'] : []),
      ...(missingAltText > 0 ? [`${missingAltText} image frame(s) without alternative text.`] : []),
    ];
    return { target, fileName: `${stem}.${extension}`, mimeType: TARGET_MIME[target], bytes, byteLength: bytes.byteLength, pageCount, warnings, blockedAssetIds: [], sha256: await sha256Hex(bytes) };
  }

  if (target === 'package') {
    const result = buildPublishPackage(model);
    const bytes = zipPackage(result.entries);
    const warnings = result.blockedAssetIds.length > 0 ? [`${result.blockedAssetIds.length} asset(s) not packageable (licence or link state).`] : [];
    return { target, fileName: `${stem}.${extension}`, mimeType: TARGET_MIME[target], bytes, byteLength: bytes.byteLength, pageCount, warnings, blockedAssetIds: [...result.blockedAssetIds], sha256: await sha256Hex(bytes) };
  }

  const standard = target === 'pdfx1a' ? 'PDF/X-1a:2001' : 'PDF/X-4:2010';
  const resolvedProfile: IccProfileId = profileId ?? 'FOGRA51';
  const result = await exportPublishToPdfX(model, standard, { cropMarks: true, bleedMarks: true, registrationMarks: true, colorBars: true, pageInformation: true }, resolvedProfile, request.outputProfileBytes);
  // Der Adapter liefert den PDF-Text; die Bytes entstehen **einmal** hier. `bytesCount` wird dagegen
  // geprueft und eine Abweichung gemeldet statt verschwiegen — der Adapter meldete sonst eine Groesse,
  // die nicht zum Ergebnis passt.
  const bytes = new TextEncoder().encode(result.pdfStream);
  const warnings = result.bytesCount === bytes.byteLength ? [] : [`PDF/X stream length mismatch: adapter reported ${result.bytesCount}, encoded ${bytes.byteLength}.`];
  return { target, fileName: `${stem}.${extension}`, mimeType: TARGET_MIME[target], bytes, byteLength: bytes.byteLength, pageCount: result.pagesExported, warnings, blockedAssetIds: [], sha256: await sha256Hex(bytes) };
}

/**
 * Der ZIP-Bauer fuer das Publikationspaket.
 *
 * Er benutzt denselben ZIP-Schreiber wie EPUB (`zipStoreFiles`) — vorher hatte nur EPUB einen. Eine eigene
 * Kopie hier waere die fuenfte Doppelung in diesem Modul.
 */
function zipPackage(entries: readonly { path: string; bytes: Uint8Array }[]): Uint8Array {
  return zipStoreFiles(entries.map(entry => ({ name: entry.path, bytes: entry.bytes })));
}

/**
 * Liefert ein Exportartefakt an den Nutzer aus (Release Beta 0.1).
 *
 * Auf dem Desktop wird die Datei ueber den nativen Speichern-Dialog + atomaren Export geschrieben;
 * `mode:'file'` ist die einzige bestaetigte Erfolgsform. Der Browser-Fallback ist ein Download und
 * muss vom Aufrufer auch so benannt werden. Fehler werden geworfen.
 */
export function deliverPublishExport(artifact: PublishExportArtifact): Promise<ExportDeliveryResult> {
  return deliverPublishBytes(artifact.bytes, artifact.fileName, artifact.mimeType);
}

/** Der sichtbare Exportzustand als Text — Erfolg, Fortschritt und Fehler sind unterscheidbar. */
export function describePublishExport(artifact: PublishExportArtifact): string {
  const kib = Math.max(1, Math.round(artifact.byteLength / 1024));
  const warningText = artifact.warnings.length > 0 ? ` · ${artifact.warnings.length} warning(s)` : ' · no warnings';
  return `${artifact.fileName} · ${artifact.pageCount} page(s) · ${kib} KB${warningText}`;
}
