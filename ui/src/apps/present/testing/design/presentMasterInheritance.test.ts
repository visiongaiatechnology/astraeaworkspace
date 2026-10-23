// BATCH-PRESENT — master inheritance, controlled master update and theme preservation (Paket 11, 12).
import { describe, expect, it } from 'vitest';
import type { PresentDocumentModel, PresentSlide } from '../../../../shared/contracts/workspace';
import {
  DEFAULT_PRESENT_MASTERS,
  DEFAULT_PRESENT_THEMES,
  applyPresentMasterUpdate,
  applyPresentTheme,
  assignPresentSlideMaster,
  ensurePresentDesign,
  listPresentMasterDependents,
  resolvePresentMasterId,
  resolvePresentSlideDesign,
} from '../../design/presentDesign';

const slide = (id: string, patch: Partial<PresentSlide> = {}): PresentSlide => ({
  id,
  title: id,
  subtitle: '',
  layout: 'blank',
  ...patch,
});

const deck = (slides: PresentSlide[]): PresentDocumentModel => ensurePresentDesign({ slides });

describe('Present master inheritance and controlled update', () => {
  it('resolves an unassigned slide to the deck default master and reports the dependency', () => {
    const model = deck([slide('s1'), slide('s2', { masterId: 'master-board' })]);
    expect(resolvePresentMasterId(model, model.slides[0])).toBe(DEFAULT_PRESENT_MASTERS[0].id);
    expect(resolvePresentMasterId(model, model.slides[1])).toBe('master-board');
    const dependents = listPresentMasterDependents(model);
    expect(dependents.map((group) => [group.masterId, group.slideIds])).toEqual([
      ['master-clean', ['s1']],
      ['master-focus', []],
      ['master-board', ['s2']],
      ['master-light', []],
    ]);
  });

  it('assigns a slide to a master, rejects unknown targets and reports no-op assignment', () => {
    const model = deck([slide('s1'), slide('s2')]);
    const assigned = assignPresentSlideMaster(model, 's1', 'master-light');
    expect(assigned.ok).toBe(true);
    if (assigned.ok) {
      expect(assigned.previousMasterId).toBe('master-clean');
      expect(assigned.model.slides[0].masterId).toBe('master-light');
      // The slide now resolves through the master's colours.
      expect(resolvePresentSlideDesign(assigned.model.slides[0], assigned.model).backgroundColor).toBe('#ffffff');
    }
    expect(assignPresentSlideMaster(model, 'ghost', 'master-light')).toMatchObject({ ok: false, reason: 'unknown-slide' });
    expect(assignPresentSlideMaster(model, 's1', 'master-ghost')).toMatchObject({ ok: false, reason: 'unknown-master' });
    expect(assignPresentSlideMaster(model, 's1', 'master-clean')).toMatchObject({ ok: false, reason: 'unchanged' });
  });

  it('updates a master, reports exactly which slides follow it and never rewrites per-slide overrides', () => {
    const model = deck([
      slide('follows', { masterId: 'master-clean' }),
      slide('pinned', { masterId: 'master-clean', backgroundColor: '#123456' }),
      slide('other', { masterId: 'master-board' }),
    ]);
    const { model: updated, report } = applyPresentMasterUpdate(model, 'master-clean', { backgroundColor: '#ff0000' });
    expect(report.dependentSlideIds).toEqual(['follows', 'pinned']);
    expect(report.updatedSlideIds).toEqual(['follows', 'pinned']);
    expect(report.overriddenSlideIds).toEqual(['pinned']);
    expect(report.detachedSlideIds).toEqual([]);
    // The pinned slide keeps its own background; the following slide takes the master's.
    expect(resolvePresentSlideDesign(updated.slides[0], updated).backgroundColor).toBe('#ff0000');
    expect(resolvePresentSlideDesign(updated.slides[1], updated).backgroundColor).toBe('#123456');
    expect(resolvePresentSlideDesign(updated.slides[2], updated).backgroundColor).not.toBe('#ff0000');
  });

  it('detaches named slides from a master update and reports unknown detach requests', () => {
    const model = deck([slide('a', { masterId: 'master-clean' }), slide('b', { masterId: 'master-clean' })]);
    const { model: updated, report } = applyPresentMasterUpdate(
      model,
      'master-clean',
      { backgroundColor: '#00ff00' },
      { detachSlideIds: ['b', 'ghost'] },
    );
    expect(report.detachedSlideIds).toEqual(['b']);
    expect(report.updatedSlideIds).toEqual(['a']);
    expect(report.unknownSlideIds).toEqual(['ghost']);
    // The detached slide moved to the next available master, so it no longer follows master-clean.
    expect(updated.slides[1].masterId).toBe('master-focus');
    expect(resolvePresentSlideDesign(updated.slides[1], updated).backgroundColor).not.toBe('#00ff00');
  });

  it('is a no-op for an unknown master id and still answers with an empty report', () => {
    const model = deck([slide('a')]);
    const { model: updated, report } = applyPresentMasterUpdate(model, 'master-ghost', { backgroundColor: '#000' });
    // `ensurePresentDesign` normalises into a fresh object, so identity is not the contract -
    // unchanged *content* is.
    expect(updated).toEqual(model);
    expect(report.dependentSlideIds).toEqual([]);
  });
});

describe('Present theme application preserves custom formatting', () => {
  it('switches the theme without touching any slide or object field', () => {
    const model: PresentDocumentModel = ensurePresentDesign({
      slides: [
        slide('s1', {
          backgroundColor: '#010203',
          sceneObjects: [
            { id: 'o1', kind: 'text', text: 'hi', fontSizePt: 22, color: '#abcdef', xPercent: 1, yPercent: 1, widthPercent: 10, heightPercent: 10, zIndex: 1 },
            { id: 'o2', kind: 'shape', shape: 'ellipse', fillColor: '#0f0f0f', strokeColor: '#f0f0f0', strokeWidth: 3, xPercent: 5, yPercent: 5, widthPercent: 10, heightPercent: 10, zIndex: 2 },
          ],
        }),
      ],
    });
    const before = JSON.stringify(model.slides);
    const { model: themed, report } = applyPresentTheme(model, 'aurora');
    expect(themed.themeId).toBe('aurora');
    expect(themed.theme).toBe('aurora');
    // Hand-written expectation: the slide payload is byte-identical, only themeId/theme changed.
    expect(JSON.stringify(themed.slides)).toBe(before);
    expect(report.changed).toBe(true);
    expect(report.preservedSlideBackgrounds).toBe(1);
    expect(report.preservedTextObjects).toBe(1);
    // text color + shape fillColor + shape strokeColor = 3 object colour values.
    expect(report.preservedObjectColors).toBe(3);
  });

  it('refuses an unknown theme id and a redundant switch without changing the model', () => {
    const model = deck([slide('s1')]);
    const before = JSON.stringify(model);
    const unknown = applyPresentTheme(model, 'theme-ghost');
    expect(JSON.stringify(unknown.model)).toBe(before);
    expect(unknown.report.changed).toBe(false);
    expect(unknown.report.themeId).toBe(DEFAULT_PRESENT_THEMES[0].id);
    const same = applyPresentTheme(model, DEFAULT_PRESENT_THEMES[0].id);
    expect(JSON.stringify(same.model)).toBe(before);
    expect(same.report.changed).toBe(false);
  });
});
