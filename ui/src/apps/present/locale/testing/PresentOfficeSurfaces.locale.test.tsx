// STATUS: PLATIN — rendered seven-locale coverage for Present productivity, speaker coach, and generated integration labels.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PresentDocumentModel, PresentSlide, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { PresentWorkspaceIntegrationModal } from '../../integrations/PresentWorkspaceIntegrationModal';
import { listPresentWorkspaceIntegrationTargets } from '../../integrations/presentWorkspaceIntegration';
import { PresentProductivityModal } from '../../productivity/PresentProductivityModal';
import { PresentSpeakerCoachModal } from '../../rehearsal/speaker-coach/PresentSpeakerCoachModal';
import { PRESENT_OFFICE_COPY, presentProductivityFailureCopy, presentSpeakerCoachFailureCopy } from '../presentOfficeLocale';
import { PRESENT_WORKFLOW_COPY } from '../presentWorkflowLocale';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

const noop = (): void => undefined;
const authoredSlide: PresentSlide = {
  id: 'authored-slide', title: 'User-authored slide title', subtitle: 'User-authored subtitle', layout: 'blank',
  speakerNotes: 'like like like like', timingSeconds: 60,
};
const model: PresentDocumentModel = { slides: [authoredSlide, { ...authoredSlide, id: 'duplicate-slide' }] };
const productivityProps = {
  isOpen: true, model, onClose: noop, onUpdateModel: noop, onSelectSlide: noop,
} satisfies ComponentProps<typeof PresentProductivityModal>;
const coachProps = { isOpen: true, onClose: noop, slides: [authoredSlide] } satisfies ComponentProps<typeof PresentSpeakerCoachModal>;
const integrationProps = {
  isOpen: true, existingObjects: [], onClose: noop, onInsert: noop,
} satisfies Omit<ComponentProps<typeof PresentWorkspaceIntegrationModal>, 'sourceDocuments'>;

function workspaceDoc(kind: string, payload: Record<string, unknown> = {}): WorkspaceDocument {
  return {
    id: `authored-${kind.toLowerCase()}`, kind, title: `User-authored ${kind} document`, version: 3,
    root_object_ids: [], objects: {}, ...payload,
  } as unknown as WorkspaceDocument;
}

const generatedTargetDocs: Array<{ document: WorkspaceDocument; expected: (locale: (typeof WORKSPACE_LOCALES)[number]) => string }> = [
  {
    document: workspaceDoc('Grid', { gridData: { sheets: [{ id: 'sheet-1', name: 'User-authored sheet', tableObjectId: 'table-1' }] } }),
    expected: (locale) => PRESENT_OFFICE_COPY[locale].workspaceIntegration.gridRange('User-authored sheet', 'A1:D10'),
  },
  {
    document: workspaceDoc('Grid', { objects: { chart: { type: 'Chart', data: { title: '' } } }, gridData: { sheets: [] } }),
    expected: (locale) => PRESENT_OFFICE_COPY[locale].workspaceIntegration.gridChartFallback,
  },
  {
    document: workspaceDoc('Tasks'), expected: (locale) => PRESENT_OFFICE_COPY[locale].workspaceIntegration.taskList,
  },
  {
    document: workspaceDoc('Whiteboard', { whiteboardData: { items: [{ id: 'frame-1', type: 'frame', name: '', text: '' }] } }),
    expected: (locale) => PRESENT_OFFICE_COPY[locale].workspaceIntegration.whiteboardFrameFallback,
  },
  {
    document: workspaceDoc('Draw', { drawData: { objects: { frame: { id: 'frame-2', type: 'frame', name: '' } } } }),
    expected: (locale) => PRESENT_OFFICE_COPY[locale].workspaceIntegration.drawFrameFallback,
  },
  {
    document: workspaceDoc('Writer'), expected: (locale) => PRESENT_OFFICE_COPY[locale].workspaceIntegration.writerDocumentFallback,
  },
  {
    document: workspaceDoc('PdfStudio', { pdfData: { pages: [{ pageNumber: 1, title: '' }] } }),
    expected: (locale) => PRESENT_WORKFLOW_COPY[locale].workspace.page('1'),
  },
  {
    document: workspaceDoc('Vault', { vaultData: { files: [{ id: 'asset-1', name: '', mimeType: 'application/pdf', kind: 'document', sizeBytes: 12 }] } }),
    expected: (locale) => PRESENT_OFFICE_COPY[locale].workspaceIntegration.vaultAssetFallback,
  },
];

function catalogShape(value: unknown): unknown {
  if (typeof value === 'function' || value === null || typeof value !== 'object') return typeof value;
  if (Array.isArray(value)) return value.map(catalogShape);
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, catalogShape(child)]));
}

describe('Present productivity, speaker coach, and workspace integration localization', () => {
  it('keeps all seven catalogs structurally aligned and interpolates counts and authored data', () => {
    const expectedShape = catalogShape(PRESENT_OFFICE_COPY['en-US']);
    const targetKindKeys = Object.keys(PRESENT_OFFICE_COPY['en-US'].workspaceIntegration.targetKinds).sort();
    for (const locale of WORKSPACE_LOCALES) {
      const copy = PRESENT_OFFICE_COPY[locale];
      expect(catalogShape(copy), locale).toEqual(expectedShape);
      expect(Object.keys(copy.workspaceIntegration.targetKinds).sort(), `${locale} target kinds`).toEqual(targetKindKeys);
      expect(Object.keys(copy.productivity.searchFields).sort(), `${locale} search fields`).toEqual(Object.keys(PRESENT_OFFICE_COPY['en-US'].productivity.searchFields).sort());
      expect(copy.productivity.occurrencesReplaced(2), `${locale} replacement count`).toContain('2');
      expect(copy.productivity.reusedSlides(3, 'Authored file.pptx'), `${locale} reuse interpolation`).toContain('Authored file.pptx');
      expect(copy.productivity.searchFields['speakerNotes']).toBeTruthy();
      expect(copy.speakerCoach.selectSlide(2, 'User-authored title'), `${locale} slide name`).toContain('User-authored title');
      expect(copy.speakerCoach.improveFillers(4, 'like'), `${locale} transcript example`).toContain('like');
      expect(copy.workspaceIntegration.gridRange('Authored sheet', 'A1:D10'), `${locale} sheet label`).toContain('Authored sheet');
      expect(copy.workspaceIntegration.pdfPage(2, 'Authored page'), `${locale} PDF title`).toContain('Authored page');
      expect(presentProductivityFailureCopy(locale, new Error('private import path'), 'import'), locale).toBe(copy.productivity.errors.import);
      expect(presentSpeakerCoachFailureCopy(locale, new Error('private engine detail')), locale).toBe(copy.speakerCoach.errors.generic);
    }
  });

  it('renders productivity controls and localized field/status copy while preserving authored content', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = PRESENT_OFFICE_COPY[locale].productivity;
      const markup = renderToStaticMarkup(<PresentProductivityModal {...productivityProps} />);
      for (const label of [copy.title, copy.subtitle, copy.close, copy.searchReplace, copy.findPlaceholder,
        copy.replacementPlaceholder, copy.replaceAll, copy.caseSensitive, copy.noMatches, copy.reuseSlides,
        copy.importDescription, copy.chooseDeck, copy.deckHygiene, copy.duplicateGroups(1),
        copy.duplicateSlideIndexes('1, 2'), copy.removeUnusedMasters]) expect(markup, `${locale}: ${label}`).toContain(label);
      expect(markup).toContain('role="dialog"');
      expect(markup).toContain('aria-modal="true"');
      expect(markup).toContain(`aria-label="${copy.close}"`);
      expect(markup).toContain(`aria-label="${copy.findPlaceholder}"`);
      expect(markup).toContain(`aria-label="${copy.replacementPlaceholder}"`);
      expect(markup).toContain(`aria-label="${copy.chooseDeck}"`);
      expect(markup).toContain('max-h-[94vh]');
      expect(markup).toContain('grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]');
      expect(markup).toContain('break-words');
      if (locale === 'de-DE' || locale === 'ru-RU') {
        expect(markup).toContain(copy.importDescription);
        expect(markup).toContain('flex flex-wrap items-start justify-between gap-3');
      }
    }
  });

  it('renders speaker coach metrics, authored transcript-derived examples, and responsive seven-locale copy', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = PRESENT_OFFICE_COPY[locale].speakerCoach;
      const markup = renderToStaticMarkup(<PresentSpeakerCoachModal {...coachProps} />);
      for (const label of [copy.title, copy.close, copy.score, copy.speakingRate, copy.fillersDetected,
        copy.totalDuration, copy.summaryHeading, copy.summaryForScore(85), copy.strengths,
        copy.improvements, copy.slideAnalysis, copy.slide(1), copy.selectSlide(1, authoredSlide.title),
        copy.actual, copy.target, copy.pace, copy.refresh, copy.done]) expect(markup, `${locale}: ${label}`).toContain(label);
      expect(markup).toContain('User-authored slide title');
      expect(markup).toContain('like');
      expect(markup).toContain('role="dialog"');
      expect(markup).toContain('aria-modal="true"');
      expect(markup).toContain(`aria-label="${copy.close}"`);
      expect(markup).toContain('role="group"');
      expect(markup).toContain('grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4');
      expect(markup).toContain('max-h-[94vh]');
      expect(markup).toContain('flex flex-wrap items-center justify-between gap-2');
      expect(markup).not.toContain('Ausgezeichnete Balance');
      expect(markup).not.toContain('Souveränes, professionelles Redetempo');
      if (locale === 'de-DE' || locale === 'ru-RU') {
        expect(markup).toContain('break-words');
        expect(markup).toContain(copy.speakingRate);
      }
    }
  });

  it('renders locale-specific generated integration fallbacks and kind labels without translating authored names', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const integrationCopy = PRESENT_OFFICE_COPY[locale].workspaceIntegration;
      for (const { document, expected } of generatedTargetDocs) {
        const target = listPresentWorkspaceIntegrationTargets(document, locale)[0];
        const markup = renderToStaticMarkup(<PresentWorkspaceIntegrationModal {...integrationProps} sourceDocuments={[document]} />);
        expect(target?.label, `${locale}: ${document.kind} generated fallback`).toBe(expected(locale));
        expect(markup, `${locale}: ${document.kind} target`).toContain(expected(locale));
        expect(markup, `${locale}: ${document.kind} kind`).toContain(integrationCopy.targetKinds[target.integrationKind]);
        expect(markup).toContain(`User-authored ${document.kind} document`);
        expect(markup).toContain('role="dialog"');
      }

      const rangeDocument = generatedTargetDocs[0].document;
      const rangeTargets = listPresentWorkspaceIntegrationTargets(rangeDocument, locale);
      expect(rangeTargets[0].label).toBe(integrationCopy.gridRange('User-authored sheet', 'A1:D10'));
      expect(rangeTargets[1].label).toBe(integrationCopy.gridKpi('User-authored sheet'));
      const writerDocument = workspaceDoc('Writer', {
        root_object_ids: ['text-block'], objects: { 'text-block': { type: 'TextBlock', data: { paragraphs: [{ id: 'paragraph-1', spans: [{ text: '' }] }, { id: 'paragraph-2', spans: [{ text: 'User-authored paragraph' }] }] } } },
      });
      const writerTargets = listPresentWorkspaceIntegrationTargets(writerDocument, locale);
      expect(writerTargets[0].label).toBe(integrationCopy.writerParagraphFallback(1));
      expect(writerTargets[1].label).toBe('User-authored paragraph');
      const pdfDocument = workspaceDoc('PdfStudio', { pdfData: { pages: [{ pageNumber: 2, title: 'User-authored PDF page' }] } });
      expect(listPresentWorkspaceIntegrationTargets(pdfDocument, locale)[0].label).toBe(integrationCopy.pdfPage(2, 'User-authored PDF page'));
    }
  });
});
