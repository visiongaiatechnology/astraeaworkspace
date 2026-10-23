// STATUS: GOLD — checks complete Publish toolbar locale parity and rendered controls.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { DEFAULT_PUBLISH_MODEL } from '../../contracts/types';
import { PUBLISH_TOOLBAR_COPY } from '../../publishToolbarLocale';
import { PUBLISH_WORKSPACE_COPY } from '../../publishWorkspaceLocale';
import { PUBLISH_EXPORT_TARGETS, PublishToolbar } from '../../editor/PublishToolbar';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));
const noop = (): void => undefined;
const props = {
  model: DEFAULT_PUBLISH_MODEL, onUpdateModel: noop, onAddFrame: noop, onExport: noop, onNewDocument: noop,
  documentTitle: 'Astraea brochure', showPreflight: false,
  onTogglePreflight: noop, onOpenStudioModal: noop, onUndo: noop, onRedo: noop, canUndo: true, canRedo: false,
  zoomPercent: 125, onZoomOut: noop, onZoomIn: noop, pagesPanelOpen: true, onTogglePagesPanel: noop, preflightErrorCount: 2,
} satisfies ComponentProps<typeof PublishToolbar>;

describe('Publish toolbar locale coverage', () => {
  it('keeps every supported locale complete and populated', () => {
    const expectedKeys = Object.keys(PUBLISH_TOOLBAR_COPY['en-US']).sort();
    for (const locale of WORKSPACE_LOCALES) {
      const copy = PUBLISH_TOOLBAR_COPY[locale];
      expect(Object.keys(copy).sort(), locale).toEqual(expectedKeys);
      for (const key of expectedKeys as (keyof typeof copy)[]) expect(copy[key].trim(), `${locale}.${key}`).not.toBe('');
    }
  });

  it('renders localized layout and export controls in every locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = PUBLISH_TOOLBAR_COPY[locale];
      const markup = renderToStaticMarkup(<PublishToolbar {...props} />);
      for (const key of ['toolbar', 'dtp', 'textFrame', 'imageFrame', 'undo', 'redo', 'columns', 'guides', 'studio', 'preflight'] as const) {
        expect(markup).toContain(copy[key]);
      }
      expect(markup).toContain(`aria-label="${copy.zoom}"`);
      expect(markup).toContain(copy.pageOf.replace('{current}', '1').replace('{total}', String(DEFAULT_PUBLISH_MODEL.pagesCount)));
      expect(markup).toContain(copy.setColumns.replace('{count}', String(DEFAULT_PUBLISH_MODEL.geometry.columns)));
    }
  });

  it('zeigt den Einstieg „Neues Layoutdokument" und alle Exportziele', () => {
    // Vorher gab es **einen** Knopf „PDF/X Export", der `target: 'PDF'` aufrief. Jetzt gibt es je Ziel einen
    // Knopf, der genau dieses Ziel nennt — und einen sichtbaren Einstieg fuer ein neues Dokument.
    vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: 'en-US', locale: 'en-US', setPreference: noop });
    const markup = renderToStaticMarkup(<PublishToolbar {...props} />);
    expect(markup).toContain('data-publish-new-document-entry="true"');
    expect(markup).toContain(PUBLISH_WORKSPACE_COPY['en-US'].newDocument);
    for (const target of PUBLISH_EXPORT_TARGETS) expect(markup, target).toContain(`data-publish-export-button="${target}"`);
    expect(markup).toContain('data-publish-preflight-count="2"');
  });

  it('sperrt alle Exportknoepfe waehrend eines Laufs', () => {
    vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: 'en-US', locale: 'en-US', setPreference: noop });
    const markup = renderToStaticMarkup(<PublishToolbar {...props} exporting="epub" />);
    expect(markup).toContain('aria-busy="true"');
    expect((markup.match(/disabled=""/gu) ?? []).length).toBeGreaterThanOrEqual(PUBLISH_EXPORT_TARGETS.length);
  });
});
