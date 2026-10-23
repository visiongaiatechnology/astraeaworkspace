// STATUS: PLATIN — Connect navigation, mail placeholders, and accessible labels render in all supported locales.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { WORKSPACE_LOCALES, type WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import { ConnectView } from '../components/ConnectView';
import { ConnectMailViewer } from '../components/ConnectMailViewer';
import { DEFAULT_CONNECT_MODEL } from '../domain/types';
import { connectCopy, connectEventCategory, connectSignatureStatus } from '../locale/connectLocale';

const localeState = vi.hoisted(() => ({ current: 'en-US' as WorkspaceLocale }));
vi.mock('../../../shell/localization/workspaceLocale', () => ({
  useWorkspaceLocale: () => ({ locale: localeState.current }),
}));

const model = structuredClone(DEFAULT_CONNECT_MODEL);
const document = { id: 'connect-locale-test', kind: 'Connect', connectData: model } as unknown as WorkspaceDocument;

describe('Connect locale catalog', () => {
  it.each(WORKSPACE_LOCALES)('renders navigation and accessible names in %s', (locale) => {
    localeState.current = locale;
    const copy = connectCopy(locale);
    const markup = renderToStaticMarkup(<ConnectView document={document} onUpdateDocument={vi.fn()} />);

    expect(markup).toContain(`aria-label="${copy.appLabel}"`);
    expect(markup).toContain(copy.compose);
    expect(markup).toContain(`aria-label="${copy.mail}"`);
    expect(markup).toContain(copy.inbox);
    expect(markup).toContain(`placeholder="${copy.searchPlaceholder}"`);
    expect(markup).toContain(copy.star);
  });

  it.each(WORKSPACE_LOCALES)('renders localized compose labels, placeholders, and safe validation copy in %s', (locale) => {
    localeState.current = locale;
    const copy = connectCopy(locale);
    const markup = renderToStaticMarkup(
      <ConnectMailViewer model={model} onUpdateModel={vi.fn()} isComposeOpen onCloseCompose={vi.fn()} />,
    );

    expect(markup).toContain(copy.composeTitle);
    expect(markup).toContain(`placeholder="${copy.subjectPlaceholder}"`);
    expect(markup).toContain(`placeholder="${copy.bodyPlaceholder}"`);
    expect(markup).toContain(`aria-label="${copy.recipientLabel}"`);
    expect(markup).not.toContain('Message validation failed');
  });

  it.each(WORKSPACE_LOCALES)('localizes calendar categories and signature states in %s', (locale) => {
    if (locale !== 'en-US') expect(connectEventCategory(locale, 'security')).not.toBe('security');
    for (const status of ['verified', 'invalid', 'expired', 'not-yet-valid', 'unsigned', 'unknown'] as const) {
      if (locale !== 'en-US') expect(connectSignatureStatus(locale, status)).not.toBe(status);
    }
  });
});
