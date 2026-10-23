// STATUS: PLATIN — Notes · W-431: die Längenkorrektur des Medienerlebnisses gilt in **beide** Richtungen
//
// Der Defekt stand als `duration >= memo.durationSeconds → return` im Audio-Dialog: eine Korrektur nach **oben**
// wurde verworfen. An einer angehängten Datei — dort setzt der Dialog den Platzhalter `durationSeconds: 0.05` —
// hieß das, dass die echte Länge nie ankam, `trimEndSeconds` auf 0,05 s stehen blieb und die Trimm-Obergrenze
// damit ebenfalls. *Eine angehängte Audiodatei ließ sich nicht trimmen und zeigte 0,0 s.*
import { describe, expect, it } from 'vitest';
import type { NoteMediaMemo } from '../../../../shared/contracts/notes-pdf/workspaceNotes';
import { NOTE_MEDIA_MAX_DURATION_SECONDS, correctNoteMediaDuration } from '../../media/notesMediaModel';

/** Ein angehängtes Medium, wie `attachLocalMediaFile` es ablegt: Platzhalterlänge 0,05 s, ungetrimmt. */
function attached(durationSeconds = 0.05, trimStartSeconds = 0, trimEndSeconds = 0.05): NoteMediaMemo {
  return {
    id: 'note-media-1',
    kind: 'audio',
    title: 'Angehängt',
    mimeType: 'audio/webm',
    dataUrl: 'data:audio/webm;base64,GkXfo0AgQoaBAULygQFC8oEEQvOBCEKChHdlYm1Ch4KEQldFQk0=',
    sizeBytes: 42,
    durationSeconds,
    trimStartSeconds,
    trimEndSeconds,
    bookmarks: [],
    transcript: [],
    createdAt: 1_700_000_000_000,
  };
}

describe('W-431 — eine Korrektur nach **oben** wird angenommen', () => {
  it('die echte Länge einer angehängten Datei ersetzt den Platzhalter', () => {
    const corrected = correctNoteMediaDuration(attached(), 12.5);
    expect(corrected).not.toBeNull();
    expect(corrected!.durationSeconds).toBe(12.5);
    // **Der eigentliche Schaden:** die Trimm-Obergrenze folgt der echten Länge. Vorher blieb sie bei 0,05 s.
    expect(corrected!.trimEndSeconds).toBe(12.5);
    expect(corrected!.trimEndSeconds).toBeGreaterThan(0.05);
  });

  it('auch eine **Verkleinerung** wird übernommen — der Abspieler ist in beide Richtungen die Autorität', () => {
    const corrected = correctNoteMediaDuration(attached(90, 0, 90), 30);
    expect(corrected!.durationSeconds).toBe(30);
    expect(corrected!.trimEndSeconds).toBe(30);
  });

  it('ein **getrimmtes** Fenster wird geklemmt, nicht auf das Dateiende gezogen', () => {
    const trimmed = attached(60, 10, 20);
    const corrected = correctNoteMediaDuration(trimmed, 100);
    expect(corrected!.durationSeconds).toBe(100);
    // Der Nutzer hatte 10–20 s gewählt; eine längere Datei ändert seine Wahl nicht.
    expect(corrected!.trimEndSeconds).toBe(20);
    expect(corrected!.trimStartSeconds).toBe(10);
  });

  it('eine **kürzere** echte Länge zieht ein zu weites Fenster zusammen', () => {
    const trimmed = attached(60, 10, 55);
    const corrected = correctNoteMediaDuration(trimmed, 30);
    expect(corrected!.durationSeconds).toBe(30);
    // Das Ende kann nicht hinter der Datei liegen; und es bleibt ein Fenster (kein Negativbereich).
    expect(corrected!.trimEndSeconds).toBe(30);
    expect(corrected!.trimEndSeconds).toBeGreaterThan(corrected!.trimStartSeconds);
  });
});

describe('W-431 — was **nicht** korrigiert wird, mit Grund', () => {
  it('kein Abspieler-Wert bedeutet keine Änderung (`null`, kein Schreiben)', () => {
    expect(correctNoteMediaDuration(attached(), Number.NaN)).toBeNull();
    expect(correctNoteMediaDuration(attached(), Number.POSITIVE_INFINITY)).toBeNull();
    expect(correctNoteMediaDuration(attached(), 0)).toBeNull();
    expect(correctNoteMediaDuration(attached(), -4)).toBeNull();
  });

  it('eine Abweichung unter einer Millisekunde ist keine Korrektur', () => {
    // Sonst schriebe jedes `metadata`-Ereignis den Zustand neu — dieselbe Schwingung, die der Hook vermeidet.
    expect(correctNoteMediaDuration(attached(5, 0, 5), 5.0004)).toBeNull();
    expect(correctNoteMediaDuration(attached(5, 0, 5), 5)).toBeNull();
  });

  it('die Grenzen sind die **vorhandenen** des Moduls, nicht neue Zahlen', () => {
    // Eine absurd große Meldung kann die Modellgrenze nicht überschreiten.
    const corrected = correctNoteMediaDuration(attached(), NOTE_MEDIA_MAX_DURATION_SECONDS + 100_000);
    expect(corrected!.durationSeconds).toBe(NOTE_MEDIA_MAX_DURATION_SECONDS);
    // Unter 0,05 s fällt die Länge nie — **dieselbe** Untergrenze wie `normalizeNoteMediaMemo`,
    // und die Trimm-Grenze zieht mit, statt unter der Länge zu bleiben.
    const floored = correctNoteMediaDuration(attached(30, 0, 30), 0.001);
    expect(floored!.durationSeconds).toBe(0.05);
    expect(floored!.trimEndSeconds).toBe(0.05);
  });
});
