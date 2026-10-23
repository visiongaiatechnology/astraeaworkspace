// BATCH-PRESENT — transition and Morph engine contract (Paket 18).
//
// This engine is what the presenter shows between two slides; it had no direct test at all, so the
// acceptance sentence "Dissolve, Push und Wipe auswählen, Effekte im Präsentationsmodus anzeigen"
// rested on the presenter wiring alone. The oracle values are hand-written from the effect names.

import { describe, expect, it } from 'vitest';
import type { PresentSlide, PresentSlideTransition } from '../../../../shared/contracts/workspace';
import {
  DEFAULT_PRESENT_TRANSITION,
  PRESENT_TRANSITION_PRESETS,
  applyTransitionToSlides,
  buildPresentMorphFrame,
  computePresentTransitionFrame,
  normalizePresentTransition,
  transitionDurationMs,
} from '../../presenter/transitions/presentTransitionEngine';

const transition = (patch: Partial<PresentSlideTransition> = {}): PresentSlideTransition => ({
  effect: 'fade',
  durationMs: 500,
  direction: 'left',
  sound: 'none',
  ...patch,
});

describe('normalizePresentTransition', () => {
  it('keeps a legal transition and bounds duration, direction, sound and auto-advance', () => {
    const normalized = normalizePresentTransition(transition({ effect: 'wipe', durationMs: 10, direction: 'diagonal' as PresentSlideTransition['direction'], sound: 'boom' as PresentSlideTransition['sound'], advanceAfterMs: 10 }));
    expect(normalized.effect).toBe('wipe');
    expect(normalized.durationMs).toBe(50);
    expect(normalized.direction).toBe('left');
    expect(normalized.sound).toBe('none');
    expect(normalized.advanceAfterMs).toBe(250);
  });

  it('migrates the legacy slide-* aliases to push with the matching direction', () => {
    expect(normalizePresentTransition(transition({ effect: 'slide-left' }))).toMatchObject({ effect: 'push', direction: 'left' });
    expect(normalizePresentTransition(transition({ effect: 'slide-right' }))).toMatchObject({ effect: 'push', direction: 'right' });
    expect(normalizePresentTransition(transition({ effect: 'slide-up' }))).toMatchObject({ effect: 'push', direction: 'up' });
    expect(normalizePresentTransition(transition({ effect: 'slide-down' }))).toMatchObject({ effect: 'push', direction: 'down' });
  });

  it('fails closed for a missing or unknown transition', () => {
    expect(normalizePresentTransition(undefined)).toEqual({ ...DEFAULT_PRESENT_TRANSITION });
    expect(normalizePresentTransition(transition({ effect: 'explode' as PresentSlideTransition['effect'] })).effect).toBe('none');
    expect(normalizePresentTransition(transition({ effect: 'split', direction: 'left' })).direction).toBe('vertical');
  });

  it('reports zero duration for "none" so the presenter does not wait', () => {
    expect(transitionDurationMs(transition({ effect: 'none', durationMs: 900 }))).toBe(0);
    expect(transitionDurationMs(transition({ effect: 'fade', durationMs: 900 }))).toBe(900);
  });
});

describe('computePresentTransitionFrame', () => {
  it('gives every declared preset a visible effect that differs from an instant cut', () => {
    const cut = computePresentTransitionFrame(transition({ effect: 'none' }), 0.5);
    for (const preset of PRESENT_TRANSITION_PRESETS) {
      const frame = computePresentTransitionFrame(transition({ effect: preset.key, direction: preset.defaultDirection ?? 'left' }), 0.5);
      expect(frame.incoming.zIndex, preset.key).toBeGreaterThanOrEqual(1);
      if (preset.key === 'none') {
        expect(frame).toEqual(cut);
        continue;
      }
      // A preset must change something the user can see: opacity, transform, clip path or stacking.
      expect(JSON.stringify(frame), preset.key).not.toBe(JSON.stringify(cut));
    }
    // `reveal`/`uncover` deliberately keep the outgoing slide on top (it is moved away to reveal the
    // next one), so a blanket "incoming is always on top" assumption would be wrong.
    expect(computePresentTransitionFrame(transition({ effect: 'reveal' }), 0.5).outgoing.zIndex).toBeGreaterThan(
      computePresentTransitionFrame(transition({ effect: 'reveal' }), 0.5).incoming.zIndex,
    );
  });

  it('fades by opacity, pushes by transform and wipes by clip path', () => {
    const fade = computePresentTransitionFrame(transition({ effect: 'fade' }), 0.5);
    expect(fade.incoming.opacity).toBeGreaterThan(0.4);
    expect(fade.incoming.opacity).toBeLessThan(0.6);
    expect(fade.incoming.transform).toBeUndefined();

    const push = computePresentTransitionFrame(transition({ effect: 'push', direction: 'right' }), 0.5);
    expect(push.outgoing.transform).toContain('translate3d');
    expect(push.incoming.transform).toContain('translate3d');
    // Outgoing moves right, incoming arrives from the left: the two transforms differ.
    expect(push.outgoing.transform).not.toBe(push.incoming.transform);

    const wipe = computePresentTransitionFrame(transition({ effect: 'wipe', direction: 'left' }), 0.5);
    expect(wipe.incoming.clipPath).toMatch(/^inset\(/);
    expect(wipe.outgoing.clipPath).toBeUndefined();
  });

  it('is deterministic and monotone from start to end', () => {
    const atStart = computePresentTransitionFrame(transition({ effect: 'fade' }), 0);
    const atEnd = computePresentTransitionFrame(transition({ effect: 'fade' }), 1);
    expect(atStart.outgoing.opacity).toBe(1);
    expect(atStart.incoming.opacity).toBe(0);
    expect(atEnd.outgoing.opacity).toBe(0);
    expect(atEnd.incoming.opacity).toBe(1);
    // Out-of-range progress is clamped instead of extrapolating.
    expect(computePresentTransitionFrame(transition({ effect: 'fade' }), 5).incoming.opacity).toBe(1);
    expect(computePresentTransitionFrame(transition({ effect: 'fade' }), -5).incoming.opacity).toBe(0);
  });

  it('renders "none" as an immediate cut, never a half-faded slide', () => {
    const frame = computePresentTransitionFrame(transition({ effect: 'none' }), 0.5);
    expect(frame.outgoing.opacity).toBe(0);
    expect(frame.incoming.opacity).toBe(1);
  });
});

const slide = (id: string, patch: Partial<PresentSlide> = {}): PresentSlide => ({
  id,
  title: id,
  subtitle: '',
  layout: 'blank',
  sceneObjects: [],
  images: [],
  ...patch,
});

describe('buildPresentMorphFrame', () => {
  it('interpolates matched geometry by morphKey and fades unmatched objects', () => {
    const from = slide('a', {
      sceneObjects: [{ id: 's1', kind: 'shape', shape: 'rectangle', fillColor: '#111', strokeColor: '#222', strokeWidth: 1, morphKey: 'k', xPercent: 10, yPercent: 10, widthPercent: 20, heightPercent: 10, zIndex: 1 }],
    });
    const to = slide('b', {
      sceneObjects: [
        { id: 's2', kind: 'shape', shape: 'rectangle', fillColor: '#111', strokeColor: '#222', strokeWidth: 1, morphKey: 'k', xPercent: 50, yPercent: 50, widthPercent: 40, heightPercent: 30, zIndex: 2 },
        { id: 's3', kind: 'shape', shape: 'rectangle', fillColor: '#111', strokeColor: '#222', strokeWidth: 1, xPercent: 0, yPercent: 0, widthPercent: 5, heightPercent: 5, zIndex: 3 },
      ],
    });
    const frame = buildPresentMorphFrame(from, to, 0.5);
    expect(frame.matchedSceneKeys).toEqual(['k']);
    const incoming = frame.incoming.sceneObjects ?? [];
    const outgoing = frame.outgoing.sceneObjects ?? [];
    const morphed = incoming.find((object) => object.id === 's2');
    expect(morphed?.xPercent).toBeGreaterThan(10);
    expect(morphed?.xPercent).toBeLessThan(50);
    // The new object only fades in.
    const fresh = incoming.find((object) => object.id === 's3');
    expect(fresh?.opacity).toBeGreaterThan(0);
    expect(fresh?.opacity).toBeLessThan(1);
    // A matched object is morphed into the incoming slide, so it must not ALSO be faded out on the
    // outgoing slide (that would draw it twice).
    expect(outgoing.map((object) => object.id)).not.toContain('s1');
  });

  it('never matches objects of a different kind', () => {
    const from = slide('a', { sceneObjects: [{ id: 's1', kind: 'text', text: 'x', fontSizePt: 18, color: '#fff', morphKey: 'k', xPercent: 0, yPercent: 0, widthPercent: 10, heightPercent: 10 }] });
    const to = slide('b', { sceneObjects: [{ id: 's2', kind: 'code', language: 'rust', code: 'fn main() {}', morphKey: 'k', xPercent: 0, yPercent: 0, widthPercent: 10, heightPercent: 10 }] });
    const frame = buildPresentMorphFrame(from, to, 0.5);
    expect(frame.matchedSceneKeys).toEqual([]);
  });
});

describe('applyTransitionToSlides', () => {
  it('applies one transition to every slide without touching anything else', () => {
    const slides = [slide('a'), slide('b', { title: 'keep me' })];
    const result = applyTransitionToSlides(slides, transition({ effect: 'wipe', durationMs: 800 }));
    expect(result).toHaveLength(2);
    expect(result.every((entry) => entry.transition?.effect === 'wipe' && entry.transition?.durationMs === 800)).toBe(true);
    expect(result[1].title).toBe('keep me');
  });
});
