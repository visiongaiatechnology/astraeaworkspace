// STATUS: PLATIN — test support: render a Whiteboard component with a **pinned** locale.
//
// Why not a module mock: `vi.mock('…/workspaceLocale')` installs one shared mock object per module
// registry. With per-file isolation that is effectively private, but when a run shares the registry
// (`--no-isolate`) vitest can interleave several test files in the same context, so the mocked locale can
// change **between two lines of the same test** — which is exactly how a suite becomes order- and
// worker-dependent: the render then uses a different locale than the expectation.
//
// This helper gives every render its own locale instead: the real `WorkspaceLocaleProvider` reads the
// shell storage, so pinning `window.localStorage` pins the locale for *that* render tree only. No shared
// mutable state, no mock, nothing another test file can influence.
import React, { type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';
import { WorkspaceLocaleProvider, useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import type { WorkspaceLocale } from '../../../../shell/localization/workspaceLocaleTypes';

/** The key the shell provider reads its preference from (`shell/localization/workspaceLocale.tsx`). */
const LOCALE_STORAGE_KEY = 'astraea.workspace.locale.v1';

/** One render tree, one locale, no shared state. */
export function renderWithWhiteboardLocale(node: ReactNode, locale: WorkspaceLocale): string {
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => (key === LOCALE_STORAGE_KEY ? locale : null),
      setItem: () => undefined,
      removeItem: () => undefined,
    },
  });
  try {
    return renderToStaticMarkup(<WorkspaceLocaleProvider>{node}</WorkspaceLocaleProvider>);
  } finally {
    vi.unstubAllGlobals();
  }
}

/** The locale a component receives right now — for contexts that render without a provider. */
export function activeWhiteboardLocale(): WorkspaceLocale {
  const Marker: React.FC = () => <i data-vgt-test-locale="true">{useWorkspaceLocale().locale}</i>;
  const markup = renderToStaticMarkup(<Marker />);
  return (/data-vgt-test-locale="true">([^<]*)</.exec(markup)?.[1] ?? 'en-US') as WorkspaceLocale;
}
