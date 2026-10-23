// STATUS: PLATIN â€” bounded, pure presentation templates (Paket 27).
//
// "Vorlage laden, **Platzhalter ersetzen** und **Master beibehalten**".
//
// Present had no template concept at all: a new deck was either the three-slide demo seed or a single
// empty slide, and there was no way to load a structured deck and fill it in. This module is the
// single definition of what a template is: a name, a master, a theme and a list of layout kinds with
// `{{placeholder}}` tokens. It stays pure, so the UI only picks and fills.

import type { PresentDocumentModel, PresentSlide } from '../../../shared/contracts/workspace';
import {
  PRESENT_DEFAULT_SLIDE_LAYOUT_KIND,
  createPresentSlide,
  type PresentSlideLayoutKind,
} from './presentDeckFactory';

export interface PresentTemplateSlide {
  kind: PresentSlideLayoutKind;
  /** 1-based position used for the slide's placeholder text. */
  sequence?: number;
  title?: string;
  subtitle?: string;
  bullets?: string[];
}

export interface PresentPresentationTemplate {
  id: string;
  name: string;
  description: string;
  /** Master the instantiated deck is assigned to; the master is preserved, not replaced. */
  masterId: string;
  themeId: string;
  slides: readonly PresentTemplateSlide[];
}

/** Placeholder syntax: `{{name}}`, bounded to a sane identifier. */
export const PRESENT_TEMPLATE_PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z][A-Za-z0-9_]{0,31})\s*\}\}/g;

export const PRESENT_TEMPLATES: readonly PresentPresentationTemplate[] = [
  {
    id: 'template-board-review',
    name: 'Board review',
    description: 'Title, agenda, two-column findings and a closing slide.',
    masterId: 'master-board',
    themeId: 'paper',
    slides: [
      { kind: 'title', sequence: 1, title: '{{title}}', subtitle: '{{subtitle}}' },
      { kind: 'title-content', sequence: 2, title: '{{agendaTitle}}', bullets: ['{{agendaItem1}}', '{{agendaItem2}}', '{{agendaItem3}}'] },
      { kind: 'two-column', sequence: 3, title: '{{findingsTitle}}', subtitle: '{{findingsSubtitle}}' },
      { kind: 'title', sequence: 4, title: '{{closingTitle}}', subtitle: '{{closingSubtitle}}' },
    ],
  },
  {
    id: 'template-project-status',
    name: 'Project status',
    description: 'Title, status summary and a chart slide.',
    masterId: 'master-clean',
    themeId: 'paper',
    slides: [
      { kind: 'title', sequence: 1, title: '{{title}}', subtitle: '{{subtitle}}' },
      { kind: 'title-content', sequence: 2, title: 'Status', bullets: ['{{statusGreen}}', '{{statusAmber}}', '{{statusRed}}'] },
      { kind: 'title-content', sequence: 3, title: 'Next steps', bullets: ['{{nextStep1}}', '{{nextStep2}}'] },
    ],
  },
  {
    id: 'template-blank-structured',
    name: 'Structured blank deck',
    description: 'Title slide plus one empty content slide; no placeholder text at all.',
    masterId: 'master-clean',
    themeId: 'paper',
    slides: [
      { kind: 'title', sequence: 1 },
      { kind: 'blank', sequence: 2 },
    ],
  },
];

export function presentTemplateById(id: string): PresentPresentationTemplate | null {
  return PRESENT_TEMPLATES.find((template) => template.id === id) ?? null;
}

export interface PresentTemplateValues {
  [placeholder: string]: string;
}

export interface PresentTemplateInstantiation {
  slides: PresentSlide[];
  /** Placeholders the template contains but the caller did not provide. Left in place, and reported. */
  unresolvedPlaceholders: string[];
  /** Values the caller provided that no template slide uses. Reported, not silently dropped. */
  unusedValues: string[];
}

function applyValues(text: string | undefined, values: PresentTemplateValues, used: Set<string>): string | undefined {
  if (typeof text !== 'string') return text;
  return text.replace(PRESENT_TEMPLATE_PLACEHOLDER_PATTERN, (match, name: string) => {
    const value = values[name];
    if (typeof value !== 'string') return match;
    used.add(name);
    return value;
  });
}

/**
 * Builds the slides of a template with the caller's values substituted.
 *
 * Fail-closed behaviour: a placeholder without a value is **kept verbatim** and reported in
 * `unresolvedPlaceholders` instead of being replaced by an empty string, so an unfinished template
 * is visible in the deck rather than silently blank. Values nobody uses are reported too.
 */
export function instantiatePresentTemplate(
  template: PresentPresentationTemplate,
  values: PresentTemplateValues,
  options: { idPrefix?: string } = {},
): PresentTemplateInstantiation {
  const prefix = (options.idPrefix ?? template.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48) || 'template';
  const used = new Set<string>();
  const slides = template.slides.map((entry, index) => {
    const sequence = entry.sequence ?? index + 1;
    const base = createPresentSlide(entry.kind ?? PRESENT_DEFAULT_SLIDE_LAYOUT_KIND, {
      id: `${prefix}-slide-${sequence}`,
      sequence,
    });
    const title = applyValues(entry.title, values, used);
    const subtitle = applyValues(entry.subtitle, values, used);
    const bullets = entry.bullets?.map((bullet) => applyValues(bullet, values, used) ?? bullet);
    return {
      ...base,
      ...(title === undefined ? {} : { title }),
      ...(subtitle === undefined ? {} : { subtitle }),
      ...(bullets ? { bulletPoints: bullets } : {}),
    } as PresentSlide;
  });

  const unresolved = new Set<string>();
  for (const slide of slides) {
    const texts = [slide.title, slide.subtitle, ...(slide.bulletPoints ?? [])];
    for (const text of texts) {
      for (const match of String(text ?? '').matchAll(PRESENT_TEMPLATE_PLACEHOLDER_PATTERN)) unresolved.add(match[1]);
    }
  }

  return {
    slides,
    unresolvedPlaceholders: [...unresolved].slice(0, 64),
    unusedValues: Object.keys(values).filter((key) => !used.has(key)).slice(0, 64),
  };
}

/**
 * Instantiates a template into a document model, **keeping the template's master and theme** and
 * preserving the deck's non-slide settings (sections, custom shows, notes/handout masters) that the
 * caller passed in. This is the function the visible "Use template" action calls.
 */
export function applyPresentTemplate(
  model: PresentDocumentModel,
  template: PresentPresentationTemplate,
  values: PresentTemplateValues,
  options: { idPrefix?: string } = {},
): { model: PresentDocumentModel; unresolvedPlaceholders: string[]; unusedValues: string[] } {
  const instantiation = instantiatePresentTemplate(template, values, options);
  const slides = instantiation.slides.map((slide) => ({ ...slide, masterId: template.masterId }));
  return {
    model: {
      ...model,
      slides,
      themeId: template.themeId,
      theme: template.themeId,
    } as PresentDocumentModel,
    unresolvedPlaceholders: instantiation.unresolvedPlaceholders,
    unusedValues: instantiation.unusedValues,
  };
}

/** Every placeholder a template uses, in first-seen order - what the picker must ask the user for. */
export function listPresentTemplatePlaceholders(template: PresentPresentationTemplate): string[] {
  const found: string[] = [];
  for (const slide of template.slides) {
    const texts = [slide.title, slide.subtitle, ...(slide.bullets ?? [])];
    for (const text of texts) {
      for (const match of String(text ?? '').matchAll(PRESENT_TEMPLATE_PLACEHOLDER_PATTERN)) {
        if (!found.includes(match[1]) && found.length < 32) found.push(match[1]);
      }
    }
  }
  return found;
}
