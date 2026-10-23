// STATUS: GOLD — Zeuge (AST-0099): eine verweigerte Zwischenablage ist SICHTBAR und FAIL-CLOSED.
//
// ## Warum dieser Zeuge die Wirkung fährt und nicht das Markup
//
// Die Anforderung lautet wörtlich: *"Jeder ungültige Pfad ist SICHTBAR und FAIL-CLOSED."* Das
// Absatzkontextmenü rief `navigator.clipboard?.writeText(text)` **ohne `await`** auf und umschloss
// `readText` mit `catch {}`. Ein Zeuge, der nur prüft, dass die Bezeichner im Quelltext vorkommen, ist
// grün, auch wenn die Wirkung fehlt — Anwesenheit ist kein Nachweis.
//
// Deshalb zieht dieser Zeuge die Befehlslogik aus der Komponente (`writerClipboardCommand.ts`) und fährt
// sie mit einem **Port**, den der Zeuge kontrolliert: er kann das Schreiben ablehnen lassen, es spät
// ablehnen lassen, oder eine leere Zwischenablage liefern. Gemessen wird die **Wirkung**:
//   1. Der Bericht sagt die Wahrheit (`ok === false`, Ursache benannt).
//   2. `resolveWriterClipboardNotice` liefert eine sichtbare Meldung — nicht `null`.
//   3. `runWriterClipboardCut` ruft `commit` **nur** nach gelungenem Schreiben (sonst stiller Datenverlust).
//   4. Kein Fehlertext enthält einen Inhalt der Zwischenablage oder den Text der Ausnahme.
//
// Kein `jsdom`, kein `happy-dom`, kein `@testing-library`: der Port ist eine Struktur, keine DOM-API.
import { describe, expect, it } from 'vitest';
import {
  resolveWriterClipboardNotice,
  runWriterClipboardCopy,
  runWriterClipboardCut,
  runWriterClipboardPaste,
  type WriterClipboardPort,
  type WriterClipboardReport,
} from '../../../../editor/context-menu/writerClipboardCommand';

/** Ein Inhalt, der unter keinen Umständen in einer Meldung auftauchen darf. */
const CLIPBOARD_PAYLOAD = 'VERTRAULICHER-ABSATZ-INHALT-4711';
/** Eine Plattform-Diagnose, die ebenfalls nicht nach außen wandern darf. */
const PLATFORM_DIAGNOSIS = 'NotAllowedError-diagnose-0815';

/**
 * Genau das, was ein Browser bei verweigerter Berechtigung wirft: eine `DOMException` namens
 * `NotAllowedError`. Die Botschaft ist der Köder des Zeugen — sie darf nirgends auftauchen.
 */
const denial = (): DOMException => new DOMException(PLATFORM_DIAGNOSIS, 'NotAllowedError');

/** Ein Fehler ohne Berechtigungsbezug: die Zwischenablage ist kaputt, nicht verboten. */
const breakage = (): Error => new Error(`platform-broke-${PLATFORM_DIAGNOSIS}`);

interface WriteProbe {
  readonly port: WriterClipboardPort;
  /** Jeder Text, der dem Port zum Schreiben übergeben wurde. */
  readonly written: string[];
  /** True, sobald der Port einen Schreibvorgang abgelehnt hat. */
  readonly rejected: () => boolean;
}

/**
 * Ein Port, der jedes Schreiben verweigert — wie ein Browser ohne Zwischenablage-Berechtigung.
 *
 * Die Ablehnung wird im Port selbst mitgeführt (`p.catch`), damit die Messung die **Sichtbarkeit für den
 * Nutzer** misst und nicht vom Runner als unbehandelte Ablehnung abgebrochen wird. Der Port ist damit ein
 * Zeuge, kein Komplize: er ändert nichts am Verhalten der Befehlsfunktion.
 */
function refusingWritePort(): WriteProbe {
  const written: string[] = [];
  let rejected = false;
  const port: WriterClipboardPort = {
    writeText: (text: string) => {
      written.push(text);
      const pending = new Promise<void>((_resolve, reject) => {
        queueMicrotask(() => {
          rejected = true;
          reject(denial());
        });
      });
      void pending.catch(() => undefined);
      return pending;
    },
    readText: async () => {
      throw denial();
    },
  };
  return { port, written, rejected: () => rejected };
}

/** Ein Port, der ohne Berechtigungsbezug scheitert — die zweite Fehlerursache. */
function failingWritePort(): WriteProbe {
  const written: string[] = [];
  const port: WriterClipboardPort = {
    writeText: (text: string) => {
      written.push(text);
      const pending = Promise.reject(breakage());
      void pending.catch(() => undefined);
      return pending;
    },
    readText: async () => {
      throw breakage();
    },
  };
  return { port, written, rejected: () => true };
}

/** Ein Port, der schreibt wie ein erteilter Zugriff. */
function acceptingWritePort(): WriteProbe {
  const written: string[] = [];
  const port: WriterClipboardPort = {
    writeText: async (text: string) => {
      written.push(text);
    },
    readText: async () => CLIPBOARD_PAYLOAD,
  };
  return { port, written, rejected: () => false };
}

const insertRecorder = (): { readonly inserted: string[]; readonly insert: (text: string) => void } => {
  const inserted: string[] = [];
  return { inserted, insert: (text: string) => inserted.push(text) };
};

const noticeOf = (report: WriterClipboardReport) => resolveWriterClipboardNotice(report);

describe('AST-0099 — verweigerte Zwischenablage ist sichtbar', () => {
  it('meldet ein verweigertes Kopieren sichtbar statt still', async () => {
    const report = await runWriterClipboardCopy(refusingWritePort().port, CLIPBOARD_PAYLOAD);
    expect(report.ok).toBe(false);
    expect(report.refusal).toBe('clipboard-denied');
    expect(report.characters).toBe(0);
    const notice = noticeOf(report);
    expect(notice).not.toBeNull();
    expect(notice?.role).toBe('alert');
    expect(notice?.message ?? '').toMatch(/Zwischenablage/i);
    expect(notice?.refusal).toBe('clipboard-denied');
  });

  it('meldet einen fehlenden Zwischenablage-Zugriff als eigene Ursache', async () => {
    for (const absent of [null, undefined]) {
      const report = await runWriterClipboardCopy(absent, CLIPBOARD_PAYLOAD);
      expect(report.ok).toBe(false);
      expect(report.refusal).toBe('clipboard-unavailable');
      expect(noticeOf(report)?.role).toBe('alert');
    }
  });

  it('schweigt, wenn das Schreiben gelungen ist', async () => {
    const probe = acceptingWritePort();
    const report = await runWriterClipboardCopy(probe.port, CLIPBOARD_PAYLOAD);
    expect(report.ok).toBe(true);
    expect(report.refusal).toBeNull();
    expect(report.characters).toBe(CLIPBOARD_PAYLOAD.length);
    expect(probe.written).toEqual([CLIPBOARD_PAYLOAD]);
    // Kein Fehlalarm: ein gelungener Vorgang erzeugt keine Meldung.
    expect(noticeOf(report)).toBeNull();
  });
});

describe('AST-0099 — Ausschneiden ist fail-closed (kein stiller Datenverlust)', () => {
  it('löscht den Absatz NICHT, wenn das Schreiben verweigert wurde', async () => {
    const committed: string[] = [];
    const report = await runWriterClipboardCut(refusingWritePort().port, CLIPBOARD_PAYLOAD, () =>
      committed.push('delete-paragraph'),
    );
    expect(report.ok).toBe(false);
    expect(report.refusal).toBe('clipboard-denied');
    // Der scharfe Teil der Lücke: heute wird der Absatz gelöscht, obwohl nichts kopiert wurde.
    expect(committed).toEqual([]);
    expect(noticeOf(report)?.role).toBe('alert');
  });

  it('löscht den Absatz, wenn das Schreiben gelungen ist', async () => {
    const committed: string[] = [];
    const probe = acceptingWritePort();
    const report = await runWriterClipboardCut(probe.port, CLIPBOARD_PAYLOAD, () => committed.push('delete-paragraph'));
    expect(report.ok).toBe(true);
    expect(probe.written).toEqual([CLIPBOARD_PAYLOAD]);
    expect(committed).toEqual(['delete-paragraph']);
  });

  it('löscht den Absatz auch dann nicht, wenn der Zugriff ganz fehlt', async () => {
    const committed: string[] = [];
    const report = await runWriterClipboardCut(null, CLIPBOARD_PAYLOAD, () => committed.push('delete-paragraph'));
    expect(report.refusal).toBe('clipboard-unavailable');
    expect(committed).toEqual([]);
  });
});

describe('AST-0099 — Einfügen ist fail-closed', () => {
  it('fügt nichts ein und meldet die verweigerte Zwischenablage', async () => {
    const recorder = insertRecorder();
    const report = await runWriterClipboardPaste(refusingWritePort().port, recorder.insert);
    expect(report.ok).toBe(false);
    expect(report.refusal).toBe('clipboard-denied');
    expect(recorder.inserted).toEqual([]);
    expect(noticeOf(report)?.role).toBe('alert');
  });

  it('meldet eine leere Zwischenablage sichtbar, aber als Zustand statt als Fehler', async () => {
    const recorder = insertRecorder();
    const emptyPort: WriterClipboardPort = { writeText: async () => undefined, readText: async () => '' };
    const report = await runWriterClipboardPaste(emptyPort, recorder.insert);
    expect(report.ok).toBe(false);
    expect(report.refusal).toBe('clipboard-empty');
    expect(recorder.inserted).toEqual([]);
    // Eine leere Zwischenablage ist kein Fehler der Anwendung: `status`, nicht `alert`.
    expect(noticeOf(report)?.role).toBe('status');
  });

  it('fügt den gelesenen Text ein und meldet die Länge', async () => {
    const recorder = insertRecorder();
    const port: WriterClipboardPort = { writeText: async () => undefined, readText: async () => 'Eingefügter Text' };
    const report = await runWriterClipboardPaste(port, recorder.insert);
    expect(report.ok).toBe(true);
    expect(recorder.inserted).toEqual(['Eingefügter Text']);
    expect(report.characters).toBe('Eingefügter Text'.length);
    expect(noticeOf(report)).toBeNull();
  });

  it('meldet einen fehlenden Zugriff beim Einfügen als eigene Ursache', async () => {
    const recorder = insertRecorder();
    const report = await runWriterClipboardPaste(undefined, recorder.insert);
    expect(report.refusal).toBe('clipboard-unavailable');
    expect(recorder.inserted).toEqual([]);
  });
});

describe('AST-0099 — auch ein Fehler ohne Berechtigungsbezug und ein abgelehntes Dokument bleiben sichtbar', () => {
  it('unterscheidet "verweigert" von "fehlgeschlagen"', async () => {
    const denied = await runWriterClipboardCopy(refusingWritePort().port, CLIPBOARD_PAYLOAD);
    const failed = await runWriterClipboardCopy(failingWritePort().port, CLIPBOARD_PAYLOAD);
    expect(denied.refusal).toBe('clipboard-denied');
    expect(failed.refusal).toBe('clipboard-failed');
    // Zwei Ursachen, zwei Sätze.
    expect(noticeOf(denied)?.message).not.toBe(noticeOf(failed)?.message);
  });

  it('meldet ein abgelehntes Löschen, ohne den Absatz als gelöscht auszugeben', async () => {
    const probe = acceptingWritePort();
    const report = await runWriterClipboardCut(probe.port, CLIPBOARD_PAYLOAD, () => {
      throw new Error('document-write-refused');
    });
    expect(report.ok).toBe(false);
    expect(report.refusal).toBe('document-refused');
    // Das Schreiben ist gelungen: der Text liegt in der Zwischenablage, das muss dastehen.
    expect(probe.written).toEqual([CLIPBOARD_PAYLOAD]);
    expect(noticeOf(report)?.message ?? '').toMatch(/Zwischenablage/i);
  });

  it('meldet ein abgelehntes Übernehmen beim Einfügen', async () => {
    const port: WriterClipboardPort = { writeText: async () => undefined, readText: async () => 'Text' };
    const report = await runWriterClipboardPaste(port, () => {
      throw new Error('document-write-refused');
    });
    expect(report.refusal).toBe('document-refused');
    expect(noticeOf(report)?.role).toBe('alert');
  });
});

describe('AST-0099 — der Schreibvorgang wird abgewartet', () => {
  it('liefert den Bericht erst nach dem Urteil der Plattform', async () => {
    let release: (() => void) | null = null;
    let settled = false;
    const port: WriterClipboardPort = {
      writeText: () => {
        const pending = new Promise<void>((_resolve, reject) => {
          release = () => {
            settled = true;
            reject(denial());
          };
        });
        // Siehe `refusingWritePort`: die Ablehnung gehört dem Zeugen, gemessen wird die Sichtbarkeit.
        void pending.catch(() => undefined);
        return pending;
      },
      readText: async () => '',
    };

    const pending = runWriterClipboardCopy(port, CLIPBOARD_PAYLOAD);
    await Promise.resolve();
    // Die Plattform hat noch nicht geurteilt — ein Bericht wäre jetzt geraten.
    expect(settled).toBe(false);

    if (release === null) throw new Error('Der Port wurde nicht aufgerufen.');
    (release as () => void)();
    const report = await pending;
    expect(settled).toBe(true);
    // Genau hier war der Fehler: ohne `await` meldete die Kopie Erfolg, bevor die Plattform ablehnte.
    expect(report.ok).toBe(false);
    expect(report.refusal).toBe('clipboard-denied');
  });
});

describe('AST-0099 — der Fehlertext nennt die Ursache, niemals einen Inhalt', () => {
  it('trägt weder Zwischenablage-Inhalt noch Ausnahmetext nach außen', async () => {
    const probe = refusingWritePort();
    const reports: readonly WriterClipboardReport[] = [
      await runWriterClipboardCopy(probe.port, CLIPBOARD_PAYLOAD),
      await runWriterClipboardCut(probe.port, CLIPBOARD_PAYLOAD, () => undefined),
      await runWriterClipboardPaste(probe.port, () => undefined),
    ];

    for (const report of reports) {
      const notice = noticeOf(report);
      const outward = `${JSON.stringify(report)} ${notice?.message ?? ''}`;
      expect(outward).not.toContain(CLIPBOARD_PAYLOAD);
      expect(outward).not.toContain(PLATFORM_DIAGNOSIS);
      // Eine Meldung, die nichts sagt, ist so gut wie keine: die Ursache muss dastehen.
      expect((notice?.message ?? '').length).toBeGreaterThan(20);
    }
  });

  it('nennt die Ursache je Fall unterscheidbar', async () => {
    const denied = noticeOf(await runWriterClipboardCopy(refusingWritePort().port, CLIPBOARD_PAYLOAD));
    const unavailable = noticeOf(await runWriterClipboardCopy(null, CLIPBOARD_PAYLOAD));
    const empty = noticeOf(
      await runWriterClipboardPaste({ writeText: async () => undefined, readText: async () => '' }, () => undefined),
    );
    const messages = [denied?.message, unavailable?.message, empty?.message];
    for (const message of messages) expect(typeof message).toBe('string');
    // Drei Ursachen, drei Sätze — kein Einheitstext, der den Nutzer im Unklaren lässt.
    expect(new Set(messages).size).toBe(3);
  });
});
