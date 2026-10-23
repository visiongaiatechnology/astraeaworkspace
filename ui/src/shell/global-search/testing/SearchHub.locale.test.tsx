// STATUS: PLATIN — verifies Search Hub and policy-control locale parity and rendering.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WORKSPACE_LOCALES } from '../../localization/workspaceLocaleTypes';
import { SEARCH_HUB_COPY } from '../searchHubLocale';
import type { SearchHubCopy } from '../searchHubLocale';

vi.mock('../../localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

import { useWorkspaceLocale } from '../../localization/workspaceLocale';
import { SearchHubPanel } from '../components/SearchHubPanel';

const searchProps = {
  documents: {},
  metadataLocked: true,
  query: '',
  onOpenDocument: () => undefined,
};

function assertNonEmptyCopy(value: unknown, path: string): void {
  if (typeof value === 'string') {
    expect(value.trim(), path).not.toBe('');
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, nested] of Object.entries(value)) assertNonEmptyCopy(nested, `${path}.${key}`);
  }
}

describe('Search Hub locale coverage', () => {
  it('has identical keys and non-empty nested copy for all supported locales', () => {
    const expectedKeys = Object.keys(SEARCH_HUB_COPY['en-US']).sort();
    for (const locale of WORKSPACE_LOCALES) {
      const copy: SearchHubCopy = SEARCH_HUB_COPY[locale];
      expect(Object.keys(copy).sort(), locale).toEqual(expectedKeys);
      expect(Object.keys(copy.groups).sort(), `${locale}.groups`).toEqual(['all', 'data', 'documents', 'messages', 'people', 'spaces', 'work']);
      expect(Object.keys(copy.administration).sort()).toEqual(Object.keys(SEARCH_HUB_COPY['en-US'].administration).sort());
      assertNonEmptyCopy(copy, locale);
    }
  });

  it('renders Search Hub, results, filter groups, and administration controls in each locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: () => undefined });
      const copy = SEARCH_HUB_COPY[locale];
      const markup = renderToStaticMarkup(<SearchHubPanel {...searchProps} />);
      expect(markup).toContain(`aria-label="${copy.title}"`);
      expect(markup).toContain(`aria-label="${copy.groupsLabel}"`);
      expect(markup).toContain(`aria-label="${copy.resultsLabel}"`);
      expect(markup).toContain(copy.metadataProtected);
      expect(markup).toContain(copy.saveSearchTitle);
      expect(markup).toContain(copy.scale);
      for (const label of Object.values(copy.groups)) expect(markup).toContain(label);
      expect(markup).toContain(copy.administration.title.replaceAll('&', '&amp;'));
      expect(markup).toContain(copy.administration.historyEnabled);
      expect(markup).toContain(copy.administration.externalConnectorIndexing);
      expect(markup).toContain(copy.administration.clearHistory);
      expect(markup).not.toContain('Search UI scaling');
    }
  });
});
