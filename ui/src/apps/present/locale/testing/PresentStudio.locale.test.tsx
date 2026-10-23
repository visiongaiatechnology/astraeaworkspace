// STATUS: PLATIN — rendered seven-locale coverage for recording and presenter surfaces.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PresentDocumentModel, PresentSlide } from '../../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { PresenterModeModal } from '../../presenter/PresenterModeModal';
import { PresentRecordingStudioModal } from '../../recording/PresentRecordingStudioModal';
import { PresentStudioErrorAlert } from '../PresentStudioErrorAlert';
import { PRESENT_STUDIO_COPY, presentRecordingFailureCopy, presenterFailureCopy } from '../presentStudioLocale';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

const noop = (): void => undefined;
const authoredSlide: PresentSlide = {
  id: 'authored-slide-1', title: 'User-authored title', subtitle: 'User-authored subtitle', layout: 'blank', speakerNotes: 'User-authored speaker notes',
};
const presentData: PresentDocumentModel = { slides: [authoredSlide], sections: [], customShows: [] };
const recordingProps = {
  isOpen: true, presentData, onClose: noop, onUpdatePresentData: noop,
} satisfies ComponentProps<typeof PresentRecordingStudioModal>;
const presenterProps = {
  slides: [authoredSlide], initialSlideIdx: 0, onClose: noop, embeddedObjects: [], presentData,
} satisfies ComponentProps<typeof PresenterModeModal>;

function catalogShape(value: unknown): unknown {
  if (typeof value === 'function' || value === null || typeof value !== 'object') return typeof value;
  if (Array.isArray(value)) return value.map(catalogShape);
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, catalogShape(child)]));
}

describe('Present recording and presenter localization', () => {
  it('keeps all seven catalogs structurally aligned and preserves interpolation data', () => {
    const expectedShape = catalogShape(PRESENT_STUDIO_COPY['en-US']);
    for (const locale of WORKSPACE_LOCALES) {
      const copy = PRESENT_STUDIO_COPY[locale];
      expect(catalogShape(copy), locale).toEqual(expectedShape);
      expect(copy.recording.slidePosition(2, 5), `${locale}.recording.slidePosition`).toContain('2');
      expect(copy.recording.slidePosition(2, 5), `${locale}.recording.slidePosition`).toContain('5');
      expect(copy.recording.timelineSlide(3, 'User-authored title'), `${locale}.recording.timelineSlide`).toContain('User-authored title');
      expect(copy.recording.removeTake('slide-authored', '10:30'), `${locale}.recording.removeTake`).toContain('slide-authored');
      expect(copy.recording.removeTake('slide-authored', '10:30'), `${locale}.recording.removeTake`).toContain('10:30');
      expect(copy.presenter.slidePosition(2, 5), `${locale}.presenter.slidePosition`).toContain('2');
      expect(copy.controls.elapsedTime('01:23'), `${locale}.controls.elapsedTime`).toContain('01:23');
      expect(copy.controls.slideTimer('00:05'), `${locale}.controls.slideTimer`).toContain('00:05');
      expect(copy.controls.remoteStatus(true, 'PAIR123'), `${locale}.controls.remoteStatus`).toContain('PAIR123');
      expect(copy.controls.remoteTitle(true, 'PAIR123'), `${locale}.controls.remoteTitle`).toContain('PAIR123');
      expect(copy.sidePanel.selectSlide(2, 'User-authored title'), `${locale}.sidePanel.selectSlide`).toContain('User-authored title');
      expect(presentRecordingFailureCopy(locale, new Error('raw engine detail')), locale).toBe(copy.recording.errors.generic);
      expect(presenterFailureCopy(locale, new Error('raw engine detail')), locale).toBe(copy.presenter.errors.generic);
    }
  });

  it('renders accessible seven-locale recording controls, generic errors, and narrow responsive layouts', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = PRESENT_STUDIO_COPY[locale];
      const markup = renderToStaticMarkup(<PresentRecordingStudioModal {...recordingProps} />);
      for (const label of [
        copy.recording.title, copy.recording.close, copy.recording.modes.record, copy.recording.modes.rehearse,
        copy.recording.modes.timeline, copy.recording.slidePreview(1), copy.recording.previousSlide,
        copy.recording.nextSlide, copy.recording.capture, copy.recording.microphoneNarration,
        copy.recording.cameraTrack, copy.recording.consentText, copy.recording.recordTake,
        copy.recording.inkTools.pointer, copy.recording.inkTools.pen, copy.recording.inkTools.highlighter,
        copy.recording.transcriptCaptions, copy.recording.transcriptGuidance,
        copy.recording.teleprompterNotes, copy.recording.takesForSlide, copy.recording.noTakes,
      ]) expect(markup, `${locale}: ${label}`).toContain(label);
      expect(markup).toContain('role="dialog"');
      expect(markup).toContain('aria-modal="true"');
      expect(markup).toContain('aria-label=');
      expect(markup).toContain(`aria-label="${copy.recording.close}"`);
      expect(markup).toContain(`aria-label="${copy.recording.previousSlide}"`);
      expect(markup).toContain(`aria-label="${copy.recording.nextSlide}"`);
      expect(markup).toContain(`aria-label="${copy.recording.transcriptCaptions}"`);
      expect(markup).toContain('User-authored title');
      expect(markup).toContain('User-authored speaker notes');
      expect(markup).toContain('grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_320px]');
      expect(markup).toContain('grid grid-cols-1 gap-3 xl:grid-cols-2');
      expect(markup).toContain('break-words');
      expect(markup).toContain('placeholder="User-authored speaker notes"');
      if (locale === 'de-DE' || locale === 'ru-RU') {
        expect(markup).toContain(copy.recording.consentText);
        expect(markup).toContain('flex flex-wrap items-center justify-end gap-1');
        expect(markup).toContain('whitespace-normal break-words');
      }

      const withoutNotes = renderToStaticMarkup(<PresentRecordingStudioModal {...recordingProps} presentData={{ ...presentData, slides: [{ ...authoredSlide, speakerNotes: undefined }] }} />);
      expect(withoutNotes).toContain(`placeholder="${copy.recording.transcriptPlaceholder}"`);

      const alert = renderToStaticMarkup(<PresentStudioErrorAlert message={copy.recording.errors.generic} />);
      expect(alert).toContain('role="alert"');
      expect(alert).toContain('aria-live="assertive"');
      expect(alert).toContain(copy.recording.errors.generic);
      expect(alert).not.toContain('raw engine detail');
    }
  });

  it('renders accessible seven-locale presenter controls and responsive long labels', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = PRESENT_STUDIO_COPY[locale];
      const markup = renderToStaticMarkup(<PresenterModeModal {...presenterProps} />);
      for (const label of [
        copy.presenter.title, copy.presenter.blackScreen, copy.presenter.whiteScreen,
        copy.presenter.previous, copy.presenter.next, copy.presenter.exitShow,
        copy.controls.currentTime, copy.controls.pauseSlideshow, copy.controls.laserPointer,
        copy.controls.pen, copy.controls.highlighter, copy.controls.eraser, copy.controls.zoomOut,
        copy.controls.zoomIn, copy.controls.loopSequence, copy.controls.kioskMode,
        copy.controls.openAudience, copy.controls.fullscreenAudience,
        copy.controls.remoteStatus(false, ''), copy.sidePanel.nextSlide, copy.sidePanel.sequence,
        copy.sidePanel.slideNavigator, copy.sidePanel.selectSlide(1, authoredSlide.title), copy.sidePanel.speakerNotes, copy.sidePanel.decreaseNotesFont,
        copy.sidePanel.increaseNotesFont,
      ]) expect(markup, `${locale}: ${label}`).toContain(label);
      expect(markup).toContain('role="dialog"');
      expect(markup).toContain('aria-modal="true"');
      expect(markup).toContain(`aria-label="${copy.presenter.title}"`);
      expect(markup).toContain(`aria-label="${copy.presenter.previous}"`);
      expect(markup).toContain(`aria-label="${copy.presenter.next}"`);
      for (const label of [copy.controls.pauseSlideshow, copy.controls.laserPointer, copy.controls.pen,
        copy.controls.highlighter, copy.controls.eraser, copy.controls.zoomOut, copy.controls.zoomIn,
        copy.controls.loopSequence, copy.controls.kioskMode, copy.controls.openAudience,
        copy.controls.fullscreenAudience, copy.sidePanel.sequence, copy.sidePanel.decreaseNotesFont,
        copy.sidePanel.increaseNotesFont]) expect(markup).toContain(`aria-label="${label}"`);
      expect(markup).toContain('User-authored title');
      expect(markup).toContain('User-authored speaker notes');
      expect(markup).toContain('flex flex-wrap items-center justify-between gap-2');
      expect(markup).toContain('whitespace-normal break-words');
      expect(markup).toContain('min-w-0');
      expect(markup).toContain('overflow-x-auto');
      if (locale === 'de-DE' || locale === 'ru-RU') {
        expect(markup).toContain(copy.controls.fullscreenAudience);
        expect(markup).toContain('flex flex-wrap items-center justify-between gap-2');
      }

      const error = renderToStaticMarkup(<PresentStudioErrorAlert message={copy.presenter.errors.audienceUnavailable} />);
      expect(error).toContain(copy.presenter.errors.audienceUnavailable);
      expect(error).toContain('role="alert"');
      expect(error).toContain('aria-atomic="true"');
    }
  });
});
