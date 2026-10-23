// @vitest-environment happy-dom
// STATUS: DIAMANT VGT SUPREME — der Nachweis fuer GAP-0056 (die Startdaten).
//
// DER BEFUND, gemessen in Runde 299:
//
//   `DEFAULT_CONNECT_MODEL` (`domain/types.ts`) ist der Vorgabezustand, mit dem
//   Connect startet — `app/bootstrap/seedData.ts` setzt ihn als `connectData`,
//   `seedDocDefaultsOpenCore.ts` klont ihn in ein neues Dokument, und
//   `components/ConnectView.tsx:44` macht ihn zum Anfangszustand. ZWEI seiner
//   drei Nachrichten trugen `isEncrypted: true`, von Hand gesetzt, aus keinem
//   Krypto-Pfad. `components/ConnectMailList.tsx:112` rendert bei diesem Feld
//   ein Schloss mit dem Titel `copy.encryptedTitle`, und der heisst in ALLEN
//   SIEBEN SPRACHEN "Ende-zu-Ende-verschluesselt".
//
//   Die Texte der beiden Nachrichten behaupteten dazu "Zero-Knowledge KeyVault",
//   "all cryptographic routines comply", "ECDH P-256 session exchange" und
//   "tamper-evident journals" — waehrend dieselbe Anwendung an anderer Stelle
//   sagt: "Keine Verschluesselung — auf diesem Weg laeuft keine
//   Schluesseloperation." Und `connectClaims.ts:73` verlangt fuer die Zusage
//   `key-verified` die Evidenz `'openpgp-signature-verified'`, die im GANZEN
//   `ui/src` kein Produktionspfad erzeugt.
//
// WAS DIESER TEST MISST:
//   * die DATEN: kein Vorgabemodell traegt `isEncrypted: true`;
//   * die WIRKUNG: die gerenderte Liste zeigt kein Element mit einem der
//     sieben "Ende-zu-Ende-verschluesselt"-Titel;
//   * die GEGENPROBE IM SELBEN TEST: mit einem Modell, das `isEncrypted: true`
//     TRAEGT, erscheint das Schloss — der Test kann es also sehen und ist nicht
//     leerlaufend.
//
// WAS ER NICHT MISST: dass die Anzeige den Zusage-Resolver des Moduls benutzt.
// `ConnectMailList` prueft weiterhin nur das Feld; `mayRenderClaim` aus
// `connectClaims.ts` waere der prinzipielle Weg und wird hier NICHT verlangt.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { ConnectDocumentModel } from '../domain/types';
import { DEFAULT_CONNECT_MODEL } from '../domain/types';
import { ConnectView } from '../components/ConnectView';
import { connectCopy } from '../locale/connectLocale';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const SPRACHEN = ['de-DE', 'en-US', 'ru-RU', 'it-IT', 'es-ES', 'ja-JP', 'zh-CN'] as const;

/** Alle sieben Titel, die "Ende-zu-Ende-verschluesselt" bedeuten. */
function verschluesselungsTitel(): string[] {
  return SPRACHEN.map((sprache) => connectCopy(sprache).encryptedTitle);
}

function dokumentMit(connectData?: ConnectDocumentModel): WorkspaceDocument {
  return {
    id: 'connect-gap0056-document',
    title: 'Connect',
    kind: 'Connect',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'cosmic-obsidian',
    root_object_ids: [],
    objects: {},
    ...(connectData ? { connectData } : {}),
  } as WorkspaceDocument;
}

/** Rendert Connect und gibt die gefundenen Verschluesselungs-Titel zurueck. */
async function schloesser(dokument: WorkspaceDocument): Promise<string[]> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<ConnectView document={dokument} onUpdateDocument={() => undefined} />);
  });
  await act(async () => {
    await new Promise((resolve) => {
      requestAnimationFrame(() => resolve(undefined));
    });
  });
  try {
    const titel = new Set(verschluesselungsTitel());
    return Array.from(container.querySelectorAll<HTMLElement>('[title]'))
      .map((el) => el.getAttribute('title') ?? '')
      .filter((t) => titel.has(t));
  } finally {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }
}

describe('die Startdaten von Connect behaupten keine Verschluesselung (GAP-0056)', () => {
  it('kein Vorgabemodell traegt isEncrypted', () => {
    const behauptend = DEFAULT_CONNECT_MODEL.messages.filter((m) => m.isEncrypted);
    expect(
      behauptend.map((m) => m.id),
      'kein Startdatensatz darf Verschluesselung behaupten — nichts verschluesselt ihn',
    ).toEqual([]);
    // Und die Startdaten liefern ueberhaupt Nachrichten, sonst waere der Test leer.
    expect(DEFAULT_CONNECT_MODEL.messages.length).toBeGreaterThan(0);
  });

  it('und die gerenderte Liste zeigt kein Schloss dazu', async () => {
    const gefunden = await schloesser(dokumentMit());
    expect(
      gefunden,
      'die Vorgabeansicht darf keinen Verschluesselungstitel tragen',
    ).toEqual([]);
  });

  it('GEGENPROBE — isEncrypted ALLEIN genuegt nicht mehr (GAP-0057)', async () => {
    // Vor der Behebung von GAP-0057 zeigte die Liste das Schloss, sobald das
    // nackte Feld `isEncrypted` true war — jeder Schreiber des Modells konnte
    // die Zusage damit erzeugen. Jetzt entscheidet der Zusage-Resolver
    // (`domain/connectClaims.ts`), und der verlangt die Evidenz. Dieser Fall
    // ist die SCHAERFERE Aussage: das Feld allein darf NICHTS anzeigen.
    const erste = DEFAULT_CONNECT_MODEL.messages[0]!;
    const nurFeld: ConnectDocumentModel = {
      ...DEFAULT_CONNECT_MODEL,
      messages: [{ ...erste, isEncrypted: true }, ...DEFAULT_CONNECT_MODEL.messages.slice(1)],
    };
    expect(
      await schloesser(dokumentMit(nurFeld)),
      'isEncrypted ohne Evidenz darf KEIN Schloss erzeugen',
    ).toEqual([]);
  });

  it('GEGENPROBE — MIT Evidenz erscheint das Schloss sehr wohl', async () => {
    // Ohne diesen Fall koennte der Test gruen sein, weil er das Schloss gar
    // nicht finden KANN. Er muss es sehen, wenn eine Operation es belegt.
    const erste = DEFAULT_CONNECT_MODEL.messages[0]!;
    const mitEvidenz: ConnectDocumentModel = {
      ...DEFAULT_CONNECT_MODEL,
      messages: [
        { ...erste, isEncrypted: true, encryptionEvidence: 'webcrypto-ciphertext-created' },
        ...DEFAULT_CONNECT_MODEL.messages.slice(1),
      ],
    };
    const gefunden = await schloesser(dokumentMit(mitEvidenz));
    expect(
      gefunden.length,
      'ein Datensatz MIT Evidenz MUSS das Schloss erzeugen',
    ).toBeGreaterThan(0);
  });
});
