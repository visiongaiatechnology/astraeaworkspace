// STATUS: PLATIN — rendered coverage for the conditional presenter exit surface.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PresentDocumentModel, PresentSlide } from '../../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { WORKSPACE_LOCALES, type WorkspaceLocale } from '../../../../shell/localization/workspaceLocaleTypes';
import { PresenterModeModal } from '../../presenter/PresenterModeModal';
import { openPresenterAudienceWindow } from '../../presenter/window/presenterAudienceWindow';
import { PRESENT_STUDIO_COPY } from '../presentStudioLocale';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

const hookHarness = vi.hoisted(() => ({ cursor: 0, overrides: new Map<number, unknown>() }));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: <State,>(initial: State) => {
      const index = hookHarness.cursor++;
      const [value, setValue] = actual.useState<State>(initial);
      const override = hookHarness.overrides.get(index);
      return [override === undefined ? value : override as State, setValue] as const;
    },
  };
});

const presenterPendingExitHookIndex = 19;
const presenterInkDirtyHookIndex = 20;
const presenterErrorHookIndex = 21;
const authoredSlide: PresentSlide = {
  id: 'authored-slide-1', title: 'User-authored title', subtitle: 'User-authored subtitle', layout: 'blank', speakerNotes: 'User-authored speaker notes',
};
const presentData: PresentDocumentModel = { slides: [authoredSlide], sections: [], customShows: [] };
const presenterProps = {
  slides: [authoredSlide], initialSlideIdx: 0, onClose: () => undefined, embeddedObjects: [], presentData,
} satisfies ComponentProps<typeof PresenterModeModal>;

const audienceWindowTitles: Readonly<Record<WorkspaceLocale, string>> = {
  'en-US': 'Astraea Present · Audience',
  'de-DE': 'Astraea Present · Publikum',
  'ru-RU': 'Astraea Present · Аудитория',
  'it-IT': 'Astraea Present · Pubblico',
  'es-ES': 'Astraea Present · Audiencia',
  'ja-JP': 'Astraea Present · 観客',
  'zh-CN': 'Astraea Present · 观众',
};

afterEach(() => {
  hookHarness.cursor = 0;
  hookHarness.overrides.clear();
  vi.unstubAllGlobals();
});

describe('Present exit confirmation and audience window localization', () => {
  it('renders the real pending-exit dialog and audience error surface for every locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: () => undefined });
      const copy = PRESENT_STUDIO_COPY[locale].presenter;
      hookHarness.cursor = 0;
      hookHarness.overrides = new Map<number, unknown>([
        [presenterPendingExitHookIndex, true],
        [presenterInkDirtyHookIndex, true],
        [presenterErrorHookIndex, copy.errors.audienceUnavailable],
      ]);

      const markup = renderToStaticMarkup(<PresenterModeModal {...presenterProps} />);

      expect(markup, `${locale} exit confirmation dialog`).toContain('aria-labelledby="presenter-exit-title"');
      expect(markup, `${locale} confirmation title`).toContain(copy.confirmTitle);
      expect(markup, `${locale} confirmation message`).toContain(copy.confirmMessage);
      expect(markup, `${locale} discard action`).toContain(`>${copy.discard}</button>`);
      expect(markup, `${locale} keep-and-exit action`).toContain(`>${copy.keepAndExit}</button>`);
      expect(markup, `${locale} audience error alert`).toContain(copy.errors.audienceUnavailable);
      expect(markup, `${locale} audience error role`).toContain('role="alert"');
    }
  });

  it('uses a localized title on the separate audience window for every locale', async () => {
    const audienceHead = { replaceChildren: vi.fn(), appendChild: vi.fn() };
    const audienceBody = { replaceChildren: vi.fn() };
    const audienceDocument = {
      title: '',
      head: audienceHead,
      body: audienceBody,
      createElement: vi.fn((tagName: string) => tagName === 'div' ? { id: '' } : { textContent: '' }),
    } as unknown as Document;
    const audienceWindow = { document: audienceDocument, closed: false, focus: vi.fn() } as unknown as Window;
    vi.stubGlobal('window', { open: vi.fn(() => audienceWindow) });
    vi.stubGlobal('document', { head: { querySelectorAll: vi.fn(() => []) } });

    for (const locale of WORKSPACE_LOCALES) {
      const title = PRESENT_STUDIO_COPY[locale].presenter.audienceWindowTitle;
      expect(title, `${locale} audience title catalog`).toBe(audienceWindowTitles[locale]);
      expect(await openPresenterAudienceWindow(title), `${locale} audience window`).toBe(audienceWindow);
      expect(audienceDocument.title, `${locale} browser title`).toBe(title);
    }
  });
});
