// STATUS: PLATIN — rendered seven-locale coverage for Present section and rehearsal dialogs.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { PresentSectionsModal } from '../../sections/PresentSectionsModal';
import { PresentRehearsalModal } from '../../rehearsal/PresentRehearsalModal';
import { PRESENT_DIALOGS_COPY } from '../presentDialogsLocale';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));
const noop = (): void => undefined;
const slide = { id: 'slide-1', title: 'User-authored slide title', subtitle: '', layout: 'blank' } as const;
const sectionProps = {
  isOpen: true, sections: [{ id: 'section-1', name: 'User-authored section', color: '#8b5cf6' }],
  slides: [{ ...slide, sectionId: 'section-1' }], onClose: noop, onUpdateSections: noop, onAssignSlideSection: noop,
  customShows: [], onUpdateCustomShows: noop,
} satisfies ComponentProps<typeof PresentSectionsModal>;
const rehearsalProps = { isOpen: true, slides: [slide], onClose: noop, onApplyTimings: noop } satisfies ComponentProps<typeof PresentRehearsalModal>;

describe('Present dialog localization', () => {
  it('keeps all seven catalogs complete and interpolates counts and user-authored titles', () => {
    const sectionKeys = Object.keys(PRESENT_DIALOGS_COPY['en-US'].sections).sort();
    const rehearsalKeys = Object.keys(PRESENT_DIALOGS_COPY['en-US'].rehearsal).sort();
    for (const locale of WORKSPACE_LOCALES) {
      const copy = PRESENT_DIALOGS_COPY[locale];
      expect(Object.keys(copy.sections).sort(), `${locale}.sections`).toEqual(sectionKeys);
      expect(Object.keys(copy.rehearsal).sort(), `${locale}.rehearsal`).toEqual(rehearsalKeys);
      expect(copy.sections.slideCount(3), `${locale}.slideCount`).toContain('3');
      expect(copy.sections.slide(2, 'Authored title'), `${locale}.slideTitle`).toContain('Authored title');
      expect(copy.rehearsal.slide(2, 'Authored title'), `${locale}.recordedSlide`).toContain('Authored title');
    }
  });

  it('renders seven-locale section and rehearsal controls with responsive long-label layouts', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = PRESENT_DIALOGS_COPY[locale];
      const sections = renderToStaticMarkup(<PresentSectionsModal {...sectionProps} />);
      for (const label of [copy.sections.title, copy.sections.close, copy.sections.sectionPlaceholder, copy.sections.addSection, copy.sections.slideCount(1), copy.sections.deleteSection, copy.sections.slide(1, 'User-authored slide title'), copy.sections.customShows, copy.sections.customShowsDescription, copy.sections.customShowPlaceholder, copy.sections.addCustomShow, copy.sections.emptyCustomShows]) {
        expect(sections, `${locale}: ${label}`).toContain(label);
      }
      expect(sections).toContain('User-authored section');
      expect(sections).toContain('max-h-[calc(100vh-2rem)]');
      expect(sections).toContain('grid-cols-1 sm:grid-cols-2');
      expect(sections).toContain('flex-wrap');

      const rehearsal = renderToStaticMarkup(<PresentRehearsalModal {...rehearsalProps} />);
      for (const label of [copy.rehearsal.title, copy.rehearsal.close, copy.rehearsal.slideTime(1), copy.rehearsal.totalTime, copy.rehearsal.noSubtitle, copy.rehearsal.start, copy.rehearsal.next, copy.rehearsal.reset, copy.rehearsal.recorded, copy.rehearsal.slide(1, 'User-authored slide title'), copy.rehearsal.save]) {
        expect(rehearsal, `${locale}: ${label}`).toContain(label);
      }
      expect(rehearsal).toContain('max-h-[calc(100vh-2rem)]');
      expect(rehearsal).toContain('flex flex-wrap gap-2');
    }
  });
});
