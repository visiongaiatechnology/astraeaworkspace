// BATCH-PRESENT — templates with placeholder replacement (Paket 27).
import { describe, expect, it } from 'vitest';
import type { PresentDocumentModel } from '../../../../shared/contracts/workspace';
import {
  PRESENT_TEMPLATES,
  applyPresentTemplate,
  instantiatePresentTemplate,
  listPresentTemplatePlaceholders,
  presentTemplateById,
} from '../../contracts/presentTemplates';

const boardReview = presentTemplateById('template-board-review')!;
const structured = presentTemplateById('template-blank-structured')!;

describe('presentation templates', () => {
  it('ships at least three templates, each with a master, a theme and slides', () => {
    expect(PRESENT_TEMPLATES.length).toBeGreaterThanOrEqual(3);
    for (const template of PRESENT_TEMPLATES) {
      expect(template.masterId.length).toBeGreaterThan(0);
      expect(template.themeId.length).toBeGreaterThan(0);
      expect(template.slides.length).toBeGreaterThan(0);
    }
    expect(presentTemplateById('template-missing')).toBeNull();
  });

  it('replaces every placeholder it has a value for', () => {
    const instantiation = instantiatePresentTemplate(boardReview, {
      title: 'FY26 Board Review',
      subtitle: 'Sovereign workspace',
      agendaTitle: 'Agenda',
      agendaItem1: 'Revenue',
      agendaItem2: 'Risk',
      agendaItem3: 'Outlook',
      findingsTitle: 'Findings',
      findingsSubtitle: 'Three material items',
      closingTitle: 'Thank you',
      closingSubtitle: 'Questions',
    });
    expect(instantiation.unresolvedPlaceholders).toEqual([]);
    expect(instantiation.unusedValues).toEqual([]);
    expect(instantiation.slides[0].title).toBe('FY26 Board Review');
    expect(instantiation.slides[1].bulletPoints).toEqual(['Revenue', 'Risk', 'Outlook']);
    expect(instantiation.slides.map((slide) => slide.id)).toEqual([
      'template-board-review-slide-1',
      'template-board-review-slide-2',
      'template-board-review-slide-3',
      'template-board-review-slide-4',
    ]);
  });

  it('keeps an unfilled placeholder visible and reports it instead of blanking the slide', () => {
    const instantiation = instantiatePresentTemplate(boardReview, { title: 'Only a title' });
    expect(instantiation.unresolvedPlaceholders).toContain('agendaTitle');
    expect(instantiation.unresolvedPlaceholders).toContain('closingTitle');
    // The token stays in the deck, so an unfinished template is visible rather than silently empty.
    expect(instantiation.slides[1].title).toBe('{{agendaTitle}}');
  });

  it('reports provided values that no slide uses', () => {
    const instantiation = instantiatePresentTemplate(structured, { notUsed: 'x' });
    expect(instantiation.unusedValues).toEqual(['notUsed']);
    expect(instantiation.unresolvedPlaceholders).toEqual([]);
  });

  it('applies a template as a new deck while keeping its master and theme', () => {
    const model: PresentDocumentModel = {
      slides: [{ id: 'old', title: 'old', subtitle: '', layout: 'blank' }],
      themeId: 'ivory',
      sections: [{ id: 'sec-1', name: 'Section' }],
    };
    const result = applyPresentTemplate(model, boardReview, { title: 'T', subtitle: 'S' }, { idPrefix: 'run-1' });
    expect(result.model.slides).toHaveLength(4);
    expect(result.model.slides.every((slide) => slide.masterId === boardReview.masterId)).toBe(true);
    expect(result.model.themeId).toBe(boardReview.themeId);
    // Non-slide deck settings are preserved.
    expect(result.model.sections).toEqual([{ id: 'sec-1', name: 'Section' }]);
    expect(result.model.slides[0].id).toBe('run-1-slide-1');
  });

  it('lists the placeholders a picker must ask for, without duplicates', () => {
    const placeholders = listPresentTemplatePlaceholders(boardReview);
    expect(new Set(placeholders).size).toBe(placeholders.length);
    expect(placeholders).toContain('title');
    expect(placeholders).toContain('closingSubtitle');
    expect(listPresentTemplatePlaceholders(structured)).toEqual([]);
  });

  it('survives a hostile template id prefix', () => {
    const result = instantiatePresentTemplate(boardReview, { title: 'x' }, { idPrefix: '../../etc/passwd' });
    expect(result.slides[0].id.startsWith('etcpasswd')).toBe(true);
    expect(result.slides[0].id).not.toContain('/');
  });
});
