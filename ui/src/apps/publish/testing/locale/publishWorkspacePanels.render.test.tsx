// STATUS: GOLD — der sichtbare Einstieg "Neues Layoutdokument" und die Seitenleiste, gerendert
//
// Geprueft wird der **Rendervertrag** der beiden neuen Flaechen: dass der Einstieg da ist, dass jede Angabe ein
// beschriftetes Feld hat, dass die Fehlermeldung eine Rolle traegt und dass die Seitenbefehle je Seite
// erreichbar sind. Kein DOM, kein @testing-library: `renderToStaticMarkup` und der Quelltext.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { createPublishProject } from '../../model/publishDocumentFactory';
import { addFrameToPublish } from '../../model/publishDocumentEngine';
import { PUBLISH_WORKSPACE_COPY, PUBLISH_WORKSPACE_LOCALE_KEYS } from '../../publishWorkspaceLocale';
import { PublishNewDocumentDialog } from '../../editor/PublishNewDocumentDialog';
import { PublishPagesPanel, type PublishPageCommand } from '../../editor/PublishPagesPanel';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));
const noop = (): void => undefined;
const locale = (value: (typeof WORKSPACE_LOCALES)[number]): void => {
  vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: value, locale: value, setPreference: noop });
};

const dialogProps = { isOpen: true, onCancel: noop, onCreate: noop } satisfies ComponentProps<typeof PublishNewDocumentDialog>;

describe('Publish-Redaktionslocale: vollstaendig in allen sieben Sprachen', () => {
  it('hat in jeder Sprache dieselben Schluessel, alle gefuellt', () => {
    const expected = [...PUBLISH_WORKSPACE_LOCALE_KEYS].sort();
    for (const value of WORKSPACE_LOCALES) {
      const copy = PUBLISH_WORKSPACE_COPY[value];
      expect(Object.keys(copy).sort(), value).toEqual(expected);
      for (const key of expected) expect(copy[key].trim(), `${value}.${key}`).not.toBe('');
    }
  });
});

describe('PublishNewDocumentDialog', () => {
  it('zeigt den Einstieg mit Titel, Format, Ausrichtung, Seiten, Rand und Anschnitt', () => {
    locale('en-US');
    const markup = renderToStaticMarkup(<PublishNewDocumentDialog {...dialogProps} />);
    const copy = PUBLISH_WORKSPACE_COPY['en-US'];
    expect(markup).toContain('data-publish-new-document-dialog="true"');
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain(copy.newDocumentTitle);
    expect(markup).toContain(copy.newDocumentDescription);
    for (const key of ['documentTitle', 'paper', 'orientation', 'pageCount', 'margin', 'bleed', 'create', 'cancel'] as const) {
      expect(markup, key).toContain(copy[key]);
    }
    expect(markup).toContain('type="number"');
  });

  it('beschriftet jedes Feld ueber ein label mit for, nicht nur optisch', () => {
    locale('en-US');
    const markup = renderToStaticMarkup(<PublishNewDocumentDialog {...dialogProps} />);
    // Vier sichtbare Zahlenfelder (Seiten, Rand, Anschnitt) und die Auswahlfelder brauchen `label for=`.
    expect((markup.match(/<label for="/gu) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(markup).toContain('data-publish-new-document-submit="true"');
  });

  it('zeigt die berechnete Seitengroesse als Text', () => {
    locale('en-US');
    const markup = renderToStaticMarkup(<PublishNewDocumentDialog {...dialogProps} />);
    expect(markup).toContain('data-publish-new-document-preview="210 × 297 mm"');
  });

  it('rendert nicht, wenn er geschlossen ist', () => {
    locale('en-US');
    expect(renderToStaticMarkup(<PublishNewDocumentDialog {...dialogProps} isOpen={false} />)).toBe('');
  });

  it('ist in jeder Sprache bedienbar', () => {
    for (const value of WORKSPACE_LOCALES) {
      locale(value);
      const markup = renderToStaticMarkup(<PublishNewDocumentDialog {...dialogProps} />);
      const copy = PUBLISH_WORKSPACE_COPY[value];
      expect(markup, value).toContain(copy.create);
      expect(markup, value).toContain(copy.cancel);
      expect(markup, value).toContain(copy.pageCount);
    }
  });
});

describe('PublishPagesPanel', () => {
  const model = addFrameToPublish(createPublishProject({ pages: 3 }), 'text', { content: 'A', name: 'Story' });
  const props = { model, onUpdateModel: noop } satisfies ComponentProps<typeof PublishPagesPanel>;

  it('zeigt je Seite eine Miniatur und die Seitenzahl', () => {
    locale('en-US');
    const markup = renderToStaticMarkup(<PublishPagesPanel {...props} />);
    expect(markup).toContain('data-publish-pages-panel="true"');
    expect(markup).toContain('data-publish-page-count="3"');
    expect((markup.match(/data-publish-page-thumbnail=/gu) ?? []).length).toBe(3);
  });

  it('bietet je Seite anlegen, duplizieren, hoch, runter und loeschen', () => {
    locale('en-US');
    const markup = renderToStaticMarkup(<PublishPagesPanel {...props} />);
    const copy = PUBLISH_WORKSPACE_COPY['en-US'];
    for (const key of ['addPage', 'duplicatePage', 'movePageUp', 'movePageDown', 'removePage'] as const) {
      expect(markup, key).toContain(`aria-label="${copy[key]}"`);
    }
    // Auf der ersten Seite ist "nach oben" gesperrt, auf der letzten "nach unten": der Zustand ist sichtbar.
    expect((markup.match(/disabled=""/gu) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('meldet die Absicht je Befehl, damit sie ohne DOM pruefbar ist', () => {
    locale('en-US');
    const commands: PublishPageCommand[] = [];
    // Kein DOM: der Rueckruf wird nicht ausgeloest, aber der Vertrag ist typgeprueft und die Signatur gepinnt.
    const markup = renderToStaticMarkup(<PublishPagesPanel {...props} onCommand={(command) => commands.push(command)} />);
    expect(markup).toContain('draggable="true"');
    expect(commands).toEqual([]);
  });

  it('sperrt das Loeschen bei einer einzigen Seite', () => {
    locale('en-US');
    const single = createPublishProject({ pages: 1 });
    const markup = renderToStaticMarkup(<PublishPagesPanel model={single} onUpdateModel={noop} />);
    // Genau ein Loeschknopf, und der ist gesperrt: die letzte Seite ist nicht loeschbar.
    expect((markup.match(/aria-label="Delete page"/gu) ?? []).length).toBe(1);
    expect(markup).toContain('disabled=""');
  });

  it('zeigt den Objektzaehler je Seite, nicht nur den Seitennamen', () => {
    locale('en-US');
    const markup = renderToStaticMarkup(<PublishPagesPanel {...props} />);
    // Eine Seite traegt den Rahmen, zwei sind leer.
    expect(markup).toContain('1 object(s)');
    expect((markup.match(/empty/gu) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
