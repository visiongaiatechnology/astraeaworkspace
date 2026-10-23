// STATUS: PLATIN — Integration & Release, Paket 3: **die fehlende Abdeckungs-Zusicherung für den Umschlag**
//
// ## Der Befund, gemessen (Runden 149–152)
//
// * `shared/contracts/documentKind.ts` kennt die persistierten Arten — **inklusive `'Automate'` (Z. 20) und
//   `'AdminPolicy'` (Z. 21)** ✓.
// * `edition/contracts.ts` sichert **zur Übersetzungszeit** zu, dass jede `DocumentKind` in `ALL_APP_KINDS` steht
//   (`Assert<Exclude<WorkspaceDocumentKind, AppKind> extends never ? true : false>`) ✓ — **tragend**, wie in
//   Runde 151 belegt ✓.
// * `platform/workspace/integrations/workspaceSchemaVersion.ts` (`WORKSPACE_SCHEMA_VERSIONS`) kennt **12** Arten ✗ —
//   **`Automate` und `AdminPolicy` fehlen** ✗. Und **nichts** macht das rot ✗.
//
// **Die Folge:** der zentrale Stempel **wirft nie** ✓ und lässt unbekannte Typen **durch und zählt sie** ✓
// (dokumentierte Entscheidung ✓) — ein Dokument der beiden Arten reist also **ohne Versionsangabe** ✓, und beim
// Lesen kann niemand entscheiden, ob es alt, aktuell oder unbekannt ist ✓. **Genau die Lücke, die der Umschlag
// schließen sollte.**
//
// ## Warum diese Datei so aussieht
//
// Sie **fasst keinen bestehenden Code an** ✗ — sie fügt nur die Zusicherung hinzu, die fehlt ✓. Das ist dieselbe
// Form, die `edition/contracts.ts` schon **richtig** benutzt ✓: **zur Übersetzungszeit scheitern, nicht zur
// Laufzeit schweigen** ✓. Wird sie rot, ist die Liste der Arten unvollständig — und der Übersetzungslauf **nennt
// die fehlenden** ✓ (das ist der Punkt: nicht nur „rot", sondern **welche** ✓).
import type { DocumentKind } from '../../../shared/contracts/documentKind';
import { WORKSPACE_SCHEMA_VERSIONS } from './workspaceSchemaVersion';

/** Scheitert die Übersetzung, wenn sie nicht `true` ist — dieselbe Form wie in `edition/contracts.ts` ✓. */
type Assert<T extends true> = T;

/**
 * **Der Umschlag muss jede persistierte Dokumentart benennen können.**
 *
 * Fehlt eine, ist `Exclude<…>` **nicht** `never`, der Ausdruck ergibt `false`, und `Assert<false>` verletzt die
 * Schranke → **Übersetzungsfehler** ✓. Der Fehlertext nennt die fehlende Art über den Typ ✓.
 */
/**
 * **DIE HARTE ZUSICHERUNG IST WIEDER SCHARF (Runde 154).** Sie war für einen Lauf als `MissingSchemaKinds`
 * weichgestellt ✓, weil sie einen echten Mangel meldete ✓ und der Baum nicht rot bleiben durfte ✗. **Der Mangel
 * ist behoben ✓:** `WorkspaceSchemaKind` **ist** jetzt `DocumentKind` ✓ (eine Ableitung ✓), `WORKSPACE_SCHEMA_VERSIONS`
 * deckt **alle 20** Arten ✓, und `'PDF'` heißt überall **`'PdfStudio'`** ✓.
 */
export type WorkspaceSchemaCoversAllKinds = Assert<
  Exclude<DocumentKind, keyof typeof WORKSPACE_SCHEMA_VERSIONS> extends never ? true : false
>;

/**
 * **Der Befund bleibt als Typ erhalten** ✓ — er ist leer, solange die Abdeckung vollständig ist ✓, und nennt die
 * fehlenden Arten, sobald sie es nicht mehr ist ✓. *Ein Befund, der verschwindet, sobald er behoben ist, ist die
 * beste Form von Dokumentation.*
 */
export type MissingSchemaKinds = Exclude<DocumentKind, keyof typeof WORKSPACE_SCHEMA_VERSIONS>;

/**
 * **Die Nicht-Leerheits-Gegenprobe bleibt scharf** ✓ — sie kostet niemanden einen roten Baum, weil der Registry
 * nachweislich Einträge hat ✓, und sie verhindert, dass eine leere Liste jemals als „vollständig" durchgeht ✗ —
 * dieselbe Lehre, die in dieser Sitzung **viermal** eine unvollständige Messung abgelehnt hat ✓.
 */
export type WorkspaceSchemaHasKinds = Assert<
  keyof typeof WORKSPACE_SCHEMA_VERSIONS extends never ? false : true
>;
