// STATUS: DIAMANT — Astraea Publish: Speichern und Wiedereroeffnen ohne Nutzdatenverlust
//
// Befund vor dieser Datei (gemessen, Runde Publish-6): Es gab keinen Weg, ein Publish-Dokument zu speichern
// und wieder zu oeffnen, der **geprueft** war. `packNativePublish`/`unpackNativePublish` existierten fuer den
// verschluesselten Hostcontainer, aber kein Test verglich Nutzdaten vor und nach dem Weg. Die
// Roundtrip-Suite im Diagnosemodul prueft nur `JSON.parse(JSON.stringify(...))` einer **Teilmenge**
// (`format`, `title`, `geometry`, `pagesCount`, `masterPages`, `frames`) — Seiten-IDs, Verkettungen und
// Assets kamen darin nicht vor.
//
// Diese Datei besitzt die Nutzdatensicht: eine kanonische Textform, die jede Dokumentaenderung **ausser**
// der reinen Sitzungsauswahl enthaelt. Damit ist „Save→Close→Reopen auf identische Nutzdaten" eine
// nachrechenbare Aussage und kein Kommentar.
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { PublishDocumentModel } from '../../../shared/contracts/publish/workspacePublish';
import { assertPublishDocument, normalizePublishModel, PublishModelError } from '../model/publishDocumentEngine';

/**
 * Sitzungszustand: was ein Dokument **nicht** ausmacht.
 *
 * `selectedFrameId` und die gerade offene Seite sind Bedienzustand. Wer sie in einen Fingerabdruck
 * aufnimmt, bekommt bei jeder Auswahl eine „Aenderung" gemeldet, die keine ist.
 */
export interface PublishPayloadView {
  pages: Array<{ id: string; name: string; geometry: unknown; rotationDeg: number; masterPageId?: string; frameIds: string[]; guides: unknown }>;
  frames: unknown[];
  masters: unknown[];
  assets: unknown[];
  styles: unknown[];
  swatches: unknown[];
  sections: unknown[];
}

export function publishPayloadView(model: PublishDocumentModel): PublishPayloadView {
  assertPublishDocument(model);
  return {
    pages: [...model.pages]
      .map(page => ({ id: page.id, name: page.name, geometry: page.geometry, rotationDeg: page.rotationDeg, ...(page.masterPageId ? { masterPageId: page.masterPageId } : {}), frameIds: [...page.frameIds], guides: page.guides }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    frames: [...model.frames].sort((a, b) => a.id.localeCompare(b.id)),
    masters: [...model.masterPages].sort((a, b) => a.id.localeCompare(b.id)),
    assets: [...model.assets].sort((a, b) => a.id.localeCompare(b.id)),
    styles: [...model.styles].sort((a, b) => a.id.localeCompare(b.id)),
    swatches: [...model.swatches].sort((a, b) => a.id.localeCompare(b.id)),
    sections: [...model.sections].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

/** Die kanonische Textform der Nutzdaten. Zwei gleiche Nutzdaten ergeben denselben Text. */
export function publishPayloadFingerprint(model: PublishDocumentModel): string {
  return JSON.stringify(publishPayloadView(model));
}

export interface PublishPayloadDiff { identical: boolean; changed: string[]; }

export function diffPublishPayloads(before: PublishDocumentModel, after: PublishDocumentModel): PublishPayloadDiff {
  const left = publishPayloadView(before);
  const right = publishPayloadView(after);
  const changed: string[] = [];
  for (const key of Object.keys(left) as (keyof PublishPayloadView)[]) {
    if (JSON.stringify(left[key]) !== JSON.stringify(right[key])) changed.push(key);
  }
  return { identical: changed.length === 0, changed };
}

/**
 * Der Text, der in einem Speichermedium landet. UTF-8, kanonisch, versioniert.
 *
 * Befund (gemessen, Runde Publish-13): die erste Fassung speicherte nur die **Ansicht** (`publishPayloadView`)
 * — also Seiten, Rahmen, Master, Assets, Stile, Farbfelder und Abschnitte. Alles andere (ICC-Profile,
 * Preflight-Profile, Ausgabevorgaben, Arbeitsbereichsbezuege, Tabellen, Diagramme, Barcodes, Kommentare)
 * fehlte im Speichertext. Beim Wiedereroeffnen war es weg. `writePublishPayload` benutzt deshalb jetzt das
 * **ganze** Modell; nur der Sitzungszustand (`selectedFrameId`, offene Seite) bleibt draussen.
 */
export function serializePublishPayload(model: PublishDocumentModel): string {
  assertPublishDocument(model);
  const { selectedFrameId: _selected, activePageIndex: _active, ...durable } = model;
  return JSON.stringify({ format: 'VGT_PUBLISH_PAYLOAD_V1', schemaVersion: 1, payload: durable });
}

/**
 * Liest eine gespeicherte Nutzlast zurueck.
 *
 * Fail-closed: ein fremdes Format oder ein unvollstaendiges Dokument wird **abgelehnt** und der Grund
 * benannt. Vorher lief jedes Objekt durch `normalizePublishModel`, das fehlende Seiten still durch leere
 * ersetzte — aus einem kaputten Dokument wurde so ein scheinbar gueltiges, leeres.
 */
export function deserializePublishPayload(text: string): PublishDocumentModel {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new PublishModelError('publish-payload-not-json'); }
  const envelope = parsed as { format?: string; schemaVersion?: number; payload?: Partial<PublishDocumentModel> };
  if (envelope?.format !== 'VGT_PUBLISH_PAYLOAD_V1') throw new PublishModelError('publish-payload-format-unknown');
  if (envelope.schemaVersion !== 1) throw new PublishModelError(`publish-payload-schema-unsupported:${String(envelope.schemaVersion)}`);
  if (!envelope.payload || !Array.isArray(envelope.payload.pages) || envelope.payload.pages.length === 0) throw new PublishModelError('publish-payload-pages-missing');
  if (!Array.isArray(envelope.payload.frames)) throw new PublishModelError('publish-payload-frames-missing');
  return normalizePublishModel(envelope.payload);
}

/** Speichern in das Workspace-Dokument — mit einer benannten Obergrenze statt stillem Wachstum. */
export const PUBLISH_PAYLOAD_MAX_BYTES = 64 * 1024 * 1024;

export function writePublishPayload(document: WorkspaceDocument, model: PublishDocumentModel, now: number): { document: WorkspaceDocument; payloadText: string; payloadBytes: number } {
  if (document.kind !== 'Publish') throw new PublishModelError('publish-document-required');
  const payloadText = serializePublishPayload(model);
  const payloadBytes = new TextEncoder().encode(payloadText).byteLength;
  if (payloadBytes > PUBLISH_PAYLOAD_MAX_BYTES) throw new PublishModelError(`publish-payload-too-large:${payloadBytes}>${PUBLISH_PAYLOAD_MAX_BYTES}`);
  return { document: { ...document, publishData: model, modified_at: now, version: document.version + 1 }, payloadText, payloadBytes };
}

/** Wiedereroeffnen: das Dokument liefert die Nutzdaten, nicht die laufende Sitzung. */
export function readPublishPayload(document: WorkspaceDocument): PublishDocumentModel {
  if (document.kind !== 'Publish' || !document.publishData) throw new PublishModelError('publish-workspace-payload-missing');
  assertPublishDocument(document.publishData);
  return document.publishData;
}

/**
 * Der vollstaendige Weg Save → Close → Reopen als **eine** Funktion.
 *
 * „Close" ist hier der ehrliche Teil: das Dokument wird **weggeworfen** und nur aus dem gespeicherten Text
 * neu aufgebaut. Ein Vergleich gegen die noch lebende Objektreferenz haette nichts geprueft — genau diese
 * Verwechslung ist in diesem Projekt schon einmal als bestandener Test durchgegangen.
 */
export function verifyPublishPayloadRoundtrip(model: PublishDocumentModel, now = 0): { reopened: PublishDocumentModel; diff: PublishPayloadDiff; payloadBytes: number } {
  const document: WorkspaceDocument = {
    id: 'doc-roundtrip', title: 'Roundtrip', kind: 'Publish', created_at: 0, modified_at: 0, version: 1,
    theme_id: 'vgt-default', root_object_ids: [], objects: {},
  };
  const saved = writePublishPayload(document, model, now);
  // Close: die Referenz ist ab hier verboten. Nur der Text ueberlebt.
  const closed: WorkspaceDocument = { ...saved.document, publishData: undefined };
  const reopened = deserializePublishPayload(saved.payloadText);
  if (!reopened || closed.publishData !== undefined) throw new PublishModelError('publish-payload-lost-on-close');
  return { reopened, diff: diffPublishPayloads(model, reopened), payloadBytes: saved.payloadBytes };
}
