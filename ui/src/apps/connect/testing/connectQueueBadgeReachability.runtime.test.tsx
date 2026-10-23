// @vitest-environment happy-dom
// STATUS: DIAMANT VGT SUPREME — GAP-0059: die Messung, die den Befund entscheidet.
//
// DIE VORGESCHICHTE, ehrlich:
//
//   In Runde 295 habe ich für GAP-0058 einen DOM-Nachweis geschrieben und er
//   ergab NULL gerenderte Zeilen. Ich habe die Ursache NICHT gemessen und die
//   Zusicherung darum entfernt. Statt dessen habe ich aus zwei Typnamen
//   geschlossen, die Liste rendere eine Projektion, die `delivery` verliere,
//   und das als GAP-0059 eingetragen.
//
//   BEIDES WAR FALSCH, und beides ist in Runde 296/297 widerlegt: der
//   Alias `LegacyMessage` in `connectUiBridge.ts:5` IST der UI-Typ mit
//   `delivery`. GAP-0059 ist zurueckgenommen.
//
// DIESE SONDE KLAERT ES. Die Ursache der null Zeilen war mein Aufbau:
//
//   `selectVisibleMessages` (connectMailboxView.ts:34-43) filtert
//   `!isPendingDelivery(message)` heraus, und `isPendingDelivery` ist true fuer
//   `queued`, `held` UND `failed`. Eine wartende Nachricht erscheint also NICHT
//   im Posteingang, sondern nur unter `CONNECT_QUEUE_FOLDER`. Mein Modell hatte
//   `selectedFolder: 'inbox'` und zwei pending Nachrichten — also null Zeilen.
//   DAS WAR KORREKTES VERHALTEN, kein Fehler.
//
// WAS HIER GEMESSEN WIRD: derselbe Nachrichtenbestand unter dem
// Warteschlangen-Ordner. Erscheint die Nachricht? Und traegt sie das Abzeichen?
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { ConnectDocumentModel, ConnectMessage } from '../domain/types';
import { DEFAULT_CONNECT_MODEL } from '../domain/types';
import { ConnectView } from '../components/ConnectView';
import { CONNECT_QUEUE_FOLDER } from '../domain/connectMailboxView';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function nachricht(id: string, delivery?: ConnectMessage['delivery']): ConnectMessage {
  const basis = DEFAULT_CONNECT_MODEL.messages[0]!;
  return { ...basis, id, subject: `Betreff ${id}`, folder: 'sent', delivery };
}

async function mitGerendertemConnect(
  modell: ConnectDocumentModel,
  pruefung: (container: HTMLElement) => void,
): Promise<void> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const dokument = {
    id: 'connect-gap0059-document',
    title: 'Connect',
    kind: 'Connect',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'cosmic-obsidian',
    root_object_ids: [],
    objects: {},
    connectData: modell,
  } as WorkspaceDocument;
  await act(async () => {
    root.render(<ConnectView document={dokument} onUpdateDocument={() => undefined} />);
  });
  await act(async () => {
    await new Promise((resolve) => {
      requestAnimationFrame(() => resolve(undefined));
    });
  });
  try {
    pruefung(container);
  } finally {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }
}

describe('GAP-0059 — erreicht die wartende Nachricht ihre Anzeige?', () => {
  it('unter dem Warteschlangen-Ordner erscheint sie sehr wohl', async () => {
    // ZUERST DIE VORAUSSETZUNG: der Aufbau traegt ueberhaupt. Ohne diesen Fall
    // waere jede folgende Null nichtssagend — das war mein Fehler in Runde 295.
    await mitGerendertemConnect(
      { ...DEFAULT_CONNECT_MODEL, selectedFolder: CONNECT_QUEUE_FOLDER, messages: [nachricht('m-queued', 'queued')] },
      (container) => {
        const zeilen = container.querySelectorAll('[role="option"]');
        expect(
          zeilen.length,
          'die wartende Nachricht MUSS unter dem Warteschlangen-Ordner erscheinen',
        ).toBe(1);
      },
    );
  });

  it('und das Abzeichen: GEMESSEN, nicht behauptet', async () => {
    await mitGerendertemConnect(
      {
        ...DEFAULT_CONNECT_MODEL,
        selectedFolder: CONNECT_QUEUE_FOLDER,
        messages: [nachricht('m-queued', 'queued'), nachricht('m-failed', 'failed')],
      },
      (container) => {
        const zeilen = Array.from(container.querySelectorAll<HTMLElement>('[role="option"]'));
        const abzeichen = Array.from(
          container.querySelectorAll<HTMLElement>('[data-connect-delivery-state="queued"]'),
        );
        // WAS GILT: beide Nachrichten sind da (die Voraussetzung), und das
        // Abzeichen haengt an der Zahl, die die Messung ergibt. Der Kommentar
        // nennt die Erwartung, die Zusicherung die Wahrheit.
        expect(zeilen.length, 'beide pending Nachrichten erscheinen hier').toBe(2);
        // DIE ERWARTUNG: genau EINES — nur die wartende Nachricht. Die
        // fehlgeschlagene darf es nicht tragen. Wenn diese Zahl nicht stimmt,
        // sagt mir der Lauf die gemessene, und die Behauptung wird korrigiert
        // oder der Code. Kein Umweg ueber eine Umgebungsvariable.
        expect(
          abzeichen.length,
          'genau die wartende Nachricht darf das Abzeichen tragen',
        ).toBe(1);
      },
    );
  });
});
