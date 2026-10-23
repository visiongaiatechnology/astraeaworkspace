// STATUS: DIAMANT VGT SUPREME — der Nachweis fuer GAP-0058 (die Evidenz-Trennung).
//
// DER BEFUND, gemessen in Runde 295, BEVOR die Anzeige umgestellt wurde:
//
//   `domain/connectClaims.ts` bildete ZWEI Zusagen auf DIESELBE Evidenz ab:
//       queued: 'local-queue-entry-created',
//       failed: 'local-queue-entry-created',
//   Damit war `proveClaim('queued', ['local-queue-entry-created'])` WAHR und
//   `proveClaim('failed', ['local-queue-entry-created'])` ebenfalls. Die Evidenz
//   der einen Zusage belegte die andere, und der Resolver konnte "in der
//   Warteschlange" nicht von "der Versuch ist fehlgeschlagen" unterscheiden.
//
// WARUM DAS HIER STEHT: ich war dabei, die Anzeige des Warteschlangen-Abzeichens
// auf den Resolver umzustellen (`isQueuedDelivery(msg)` ->
// `mayRenderStoredClaim(msg, 'queued')`). Mit der Vermischung haette das einer
// FEHLGESCHLAGENEN Nachricht das Warteschlangen-Abzeichen gegeben — eine
// Regression, die niemandem auffaellt, weil beide Zustaende "nicht gesendet"
// bedeuten.
//
// WAS DIESER TEST MISST: die Zusage-Regel auf der Ebene, die ich kontrollieren
// kann — die Evidenz-Ableitung aus einer Nachricht. Er misst NICHT die
// DOM-Anzeige: mein Modell mit zwei Nachrichten im Posteingang ergab NULL
// gerenderte Zeilen. ICH HABE DIE URSACHE SPAETER GEMESSEN — und sie war mein
// Aufbau, nicht der Code: `selectVisibleMessages` filtert pending Nachrichten
// aus dem Posteingang heraus; sie stehen nur unter `CONNECT_QUEUE_FOLDER`.
// Korrektes Verhalten. Der DOM-Nachweis liegt darum in
// `connectQueueBadgeReachability.runtime.test.tsx`.
//
// UND WAS ICH AUS DER NULL GESCHLOSSEN HATTE, WAR EBENFALLS FALSCH:
// ich hatte behauptet, `filterLegacyMessages` liefere den Plattform-Typ und
// verliere `delivery`. Gelesen sind die Importe das Gegenteil:
// `connectUiBridge.ts:5` importiert `ConnectMessage as LegacyMessage` aus
// `../domain/types` — `LegacyMessage` IST der UI-Typ mit `delivery`. Der
// Rueckgabetyp beschreibt die Daten richtig. GAP-0059 ist in Runde 297
// zurueckgenommen; es gibt keinen Defekt.
//
// DIE LEHRE, DIE HIER BLEIBT: zweimal habe ich aus einem NAMEN auf die Sache
// geschlossen — einmal aus dem Rueckgabetyp, einmal aus dem Alias —, ohne die
// Importe zu lesen. Der Alias `LegacyMessage` bezeichnet in diesem Modul den
// NEUEREN Typ; die Konvention ist umgekehrt zur Erwartung.
import { describe, expect, it } from 'vitest';
import type { ConnectMessage } from '../domain/types';
import { DEFAULT_CONNECT_MODEL } from '../domain/types';
import { mayRenderClaim, mayRenderStoredClaim, messageEvidence } from '../domain/connectClaims';

/** Eine Nachricht mit vorgegebenem Zustellzustand. */
function nachricht(id: string, delivery?: ConnectMessage['delivery']): ConnectMessage {
  const basis = DEFAULT_CONNECT_MODEL.messages[0]!;
  return { ...basis, id, subject: `Betreff ${id}`, folder: 'inbox', delivery };
}

describe('die Zusagen `queued` und `failed` sind unterscheidbar (GAP-0058)', () => {
  it('die Evidenz der einen Zusage belegt NICHT die andere', () => {
    // Das ist der KERN des Befundes.
    expect(mayRenderClaim('queued', ['local-queue-entry-created'])).toBe(true);
    expect(
      mayRenderClaim('failed', ['local-queue-entry-created']),
      'die Warteschlangen-Evidenz darf den Fehlschlag NICHT belegen',
    ).toBe(false);
    expect(mayRenderClaim('failed', ['delivery-attempt-failed'])).toBe(true);
    expect(
      mayRenderClaim('queued', ['delivery-attempt-failed']),
      'und umgekehrt ebenso wenig',
    ).toBe(false);
  });

  it('und die Ableitung aus einer Nachricht trennt sie ebenfalls', () => {
    const wartend = messageEvidence(nachricht('m-queued', 'queued'));
    const gescheitert = messageEvidence(nachricht('m-failed', 'failed'));
    expect(wartend).toContain('local-queue-entry-created');
    expect(wartend).not.toContain('delivery-attempt-failed');
    expect(gescheitert).toContain('delivery-attempt-failed');
    expect(gescheitert).not.toContain('local-queue-entry-created');
  });

  it('die Anzeige-Entscheidung folgt der Trennung', () => {
    expect(mayRenderStoredClaim(nachricht('m-queued', 'queued'), 'queued')).toBe(true);
    expect(mayRenderStoredClaim(nachricht('m-failed', 'failed'), 'queued')).toBe(false);
    expect(mayRenderStoredClaim(nachricht('m-failed', 'failed'), 'failed')).toBe(true);
  });

  it('GEGENPROBE — eine Nachricht ohne Zustand traegt keine der beiden Zusagen', () => {
    expect(mayRenderStoredClaim(nachricht('m-plain'), 'queued')).toBe(false);
    expect(mayRenderStoredClaim(nachricht('m-plain'), 'failed')).toBe(false);
  });
});
