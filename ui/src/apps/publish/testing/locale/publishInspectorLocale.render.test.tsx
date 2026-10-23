// STATUS: GOLD — checks Publish Inspector catalog parity and localized page/preflight surfaces.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import type { PublishPreflightFinding } from '../../../../shared/contracts/publish/workspacePublish';
import { DEFAULT_PUBLISH_MODEL } from '../../contracts/types';
import { PUBLISH_INSPECTOR_COPY, publishFindingMessage } from '../../publishInspectorLocale';
import { PublishInspector } from '../../editor/PublishInspector';
import type { PublishInspectorCommands } from '../../editor/publishInspectorCommands';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));
const noop = (): void => undefined;
/** Ein Befehlssatz, der nichts tut: der Rendervertrag wird geprueft, nicht die Wirkung. */
const commands = {
  nudgeFrame: noop, setFrameRect: noop, setFrameContent: noop, updateFrame: noop, removeFrame: noop,
  setMaster: noop, setRotation: noop, updateMaster: noop, linkThread: noop, unlinkThread: noop,
  appendThreadFrame: noop, resolveOverflow: noop, assignStyle: noop, createStyle: noop, setBaselineGrid: noop,
  setTracking: noop, assignSwatch: noop, createSwatch: noop, addShape: noop, insertTable: noop,
  setPreflightProfile: noop, setTextWrap: noop, setColumns: noop, setParagraphBreak: noop,
  updateGeometry: noop, addPage: noop,
} satisfies PublishInspectorCommands;
const htmlText = (value: string): string => value.replaceAll('&', '&amp;');
const issue = { id: 'bleed-page-1', severity: 'error', category: 'Bleed', message: 'Bleed 1mm is below required 3mm.', navigable: false, pageId: 'page-1', pageIndex: 0 } satisfies PublishPreflightFinding;
const props = { model: DEFAULT_PUBLISH_MODEL, onUpdateModel: noop, showPreflight: true, commands } satisfies ComponentProps<typeof PublishInspector>;

describe('Publish Inspector locale coverage', () => {
  it('keeps every supported locale complete and populated', () => {
    const keys = Object.keys(PUBLISH_INSPECTOR_COPY['en-US']).sort();
    for (const locale of WORKSPACE_LOCALES) {
      expect(Object.keys(PUBLISH_INSPECTOR_COPY[locale]).sort(), locale).toEqual(keys);
      for (const key of keys as (keyof typeof PUBLISH_INSPECTOR_COPY['en-US'])[]) expect(PUBLISH_INSPECTOR_COPY[locale][key].trim(), `${locale}.${key}`).not.toBe('');
    }
  });

  it('renders localized page and preflight controls and generated findings', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = PUBLISH_INSPECTOR_COPY[locale];
      const markup = renderToStaticMarkup(<PublishInspector {...props} />);
      expect(markup).toContain(htmlText(copy.preflightTitle));
      expect(markup).toContain(copy.compliance);
      expect(markup).toContain(copy.complianceDescription);
      expect(markup).toContain(copy.simulateOverprint);
      expect(renderToStaticMarkup(<p>{publishFindingMessage(issue, locale)}</p>)).toContain(htmlText(copy.findingBleed.replace('{actual}', '1').replace('{required}', '3')));
    }
  });
});
