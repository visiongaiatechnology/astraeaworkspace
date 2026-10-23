// STATUS: PLATIN — Notes · W-430: die freie Leinwand hat ein begrenztes Zoom — und **kein drittes Limit**
//
// Gemessen war: Tinte (`canvas/ink/notesInkZoom.ts`) und Anhangvorschau (`media/notesAttachmentZoom.ts`) haben
// ein begrenztes Zoom, die **freie Leinwand** nicht ✗ — ein großes Board ließ sich nur scrollen. Der Register­
// eintrag W-430 nennt genau das.
//
// ## Warum diese Prüfung eine `.mjs` ist und der Render-Test daneben eine `.tsx`
//
// Das Projekt hat sich diese Trennung teuer erarbeitet: **eine `.ts`/`.tsx`-Prüfdatei hat keine Node-Typen**, ein
// `node:fs`-Import ergibt `TS2307`. *Meine erste Fassung legte beides in eine `.tsx` — der kalte Typlauf hat es
// sofort gezeigt.* Hier stehen die **Quelltext**-Eigenschaften, in `notesCanvasZoom.test.tsx` das Rendering.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NOTE_INK_MAX_ZOOM, NOTE_INK_MIN_ZOOM, clampInkZoom, stepInkZoom } from '../../canvas/ink/notesInkZoom';
import { formatNotePreviewZoom } from '../../media/notesAttachmentZoom';

const canvasSource = readFileSync(new URL('../../canvas/NotesFreeCanvas.tsx', import.meta.url), 'utf8');

describe('W-430 — **eine** Zoom-Regel in Notes, kein drittes Limit', () => {
  it('die Leinwand benutzt die vorhandene Arithmetik, nicht eine eigene', () => {
    // Die vorhandene Regel wird **importiert** …
    expect(canvasSource).toContain("import { NOTE_INK_MAX_ZOOM, NOTE_INK_MIN_ZOOM, stepInkZoom } from './ink/notesInkZoom';");
    expect(canvasSource).toContain('stepInkZoom(current, 1)');
    expect(canvasSource).toContain('stepInkZoom(current, -1)');
    // … und **keine** eigenen Grenzen erfunden.
    expect(canvasSource).not.toMatch(/const\s+NOTE_CANVAS_(?:MIN|MAX)_ZOOM/u);
    expect(canvasSource).not.toMatch(/ZOOM_STEP\s*=/u);
    // Die Randbedingung der Knöpfe hängt an den **vorhandenen** Grenzen.
    expect(canvasSource).toContain('disabled={zoom <= NOTE_INK_MIN_ZOOM}');
    expect(canvasSource).toContain('disabled={zoom >= NOTE_INK_MAX_ZOOM}');
  });

  it('die Prozent-Beschriftung ist die **vorhandene**, keine zweite Formatierung', () => {
    expect(canvasSource).toContain("import { formatNotePreviewZoom } from '../media/notesAttachmentZoom';");
    expect(canvasSource).toContain('formatNotePreviewZoom(zoom)');
    // Kein eigenes `Math.round(zoom * 100)` neben der vorhandenen Beschriftung.
    expect(canvasSource).not.toMatch(/Math\.round\(\s*zoom\s*\*\s*100/u);
  });

  it('Zoom 1 ist der unveränderte Zustand — keine Animation, also nichts für `prefers-reduced-motion`', () => {
    expect(canvasSource).toContain('useState(1)');
    expect(canvasSource).toContain('transform: `scale(${zoom})`');
    // Eine Bewegung, die es nicht gibt, muss man nicht abschalten — sie darf aber auch nicht heimlich entstehen.
    expect(canvasSource).not.toContain('transition');
    expect(canvasSource).not.toContain('animate-');
  });

  it('die Grenzen sind wirklich begrenzt (die vorhandene Regel hält)', () => {
    expect(clampInkZoom(100)).toBe(NOTE_INK_MAX_ZOOM);
    expect(clampInkZoom(0)).toBe(NOTE_INK_MIN_ZOOM);
    // Ein Schritt über den Rand hinaus bleibt am Rand stehen — der Knopf ist dann deaktiviert.
    expect(stepInkZoom(NOTE_INK_MAX_ZOOM, 1)).toBe(NOTE_INK_MAX_ZOOM);
    expect(stepInkZoom(NOTE_INK_MIN_ZOOM, -1)).toBe(NOTE_INK_MIN_ZOOM);
    // Und die Beschriftung ist die **vorhandene** Prozentform.
    expect(formatNotePreviewZoom(NOTE_INK_MAX_ZOOM)).toBe('400%');
  });
});
