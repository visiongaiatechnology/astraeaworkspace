// STATUS: PLATIN — Struktur-Vertrag der aufgeräumten Publish-Leiste (Nutzerbefund „riesiges Chaos").
//
// **Der Befund:** Eine einzige h-12-Leiste trug 25+ Einzelknöpfe gleichzeitig (Seiten, Rahmen, jeder
// Formtyp, SVG, Vault, Zoom, Undo/Redo, Preflight, Studio, fünf Exportziele, Historie).
//
// **Dieser Test hält die neue, ruhige Struktur fest — nicht nur, dass irgendetwas rendert:**
//   1. Primärleiste `role="toolbar"` mit klar benannten Gruppen (Dokument/Einfügen/Ansicht/Verlauf/Ausgabe),
//      jede Gruppe hat einen zugänglichen Namen.
//   2. Formen und Exporte sind echte Menüs (`aria-haspopup="menu"`, `aria-expanded`, geschlossen = `hidden`)
//      — die Einzeleinträge bleiben vollständig vorhanden und benannt.
//   3. Die seltenere „Seite & Dokument"-Ebene ist eine eigene, einklappbare Leiste (`aria-expanded`).
//   4. Keine Funktions- oder A11y-Zusicherung fällt weg: Guide-Anker, Vault-Grund, Preflight-Zahl,
//      Undo/Redo/Zoom-Namen bleiben.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { DEFAULT_PUBLISH_MODEL } from '../../contracts/types';
import { PUBLISH_TOOLBAR_COPY } from '../../publishToolbarLocale';
import { PUBLISH_EXPORT_TARGETS, PublishToolbar } from '../../editor/PublishToolbar';
import { PUBLISH_SHAPE_KINDS } from '../../model/publishShapeOps';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));
const EN = 'en-US';
const noop = (): void => undefined;
const copy = PUBLISH_TOOLBAR_COPY[EN];

function render(overrides: Partial<ComponentProps<typeof PublishToolbar>> = {}): string {
  vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: EN, locale: EN, setPreference: noop });
  const props: ComponentProps<typeof PublishToolbar> = {
    model: DEFAULT_PUBLISH_MODEL,
    onUpdateModel: noop,
    onAddFrame: noop,
    onAddShape: noop,
    onEmbedSvg: noop,
    onPickVaultAsset: noop,
    vaultAssetBlockedReason: null,
    onNewDocument: noop,
    onExport: noop,
    documentTitle: 'Astraea brochure',
    showPreflight: false,
    onTogglePreflight: noop,
    onOpenStudioModal: noop,
    onUndo: noop,
    onRedo: noop,
    canUndo: true,
    canRedo: false,
    zoomPercent: 100,
    onZoomOut: noop,
    onZoomIn: noop,
    pagesPanelOpen: true,
    onTogglePagesPanel: noop,
    preflightErrorCount: 2,
    ...overrides,
  };
  return renderToStaticMarkup(<PublishToolbar {...props} />);
}

describe('Publish-Leiste: ruhige Gruppen statt Knopfwand', () => {
  it('rendert genau eine Primärleiste mit fünf benannten Gruppen', () => {
    const markup = render();
    expect(markup.match(/data-publish-primary-toolbar="true"/gu)).toHaveLength(1);
    expect(markup).toContain('role="toolbar"');
    expect(markup).toContain(`aria-label="${copy.toolbar}"`);

    const groups: Array<[string, string]> = [
      ['document', copy.documentGroup],
      ['insert', copy.insertGroup],
      ['view', copy.zoom],
      ['history', copy.historyGroup],
      ['output', copy.outputGroup],
    ];
    for (const [id, label] of groups) {
      expect(markup, id).toContain(`data-publish-group="${id}"`);
      expect(markup, id).toContain(`aria-label="${label}"`);
    }
  });

  it('bündelt die Formen in einem echten Menü — jeder Formtyp bleibt benannt und erreichbar', () => {
    const markup = render();
    const triggerStart = markup.indexOf('data-publish-shapes-trigger="true"');
    expect(triggerStart).toBeGreaterThan(-1);
    const trigger = markup.slice(triggerStart, triggerStart + 700);
    expect(trigger).toContain('aria-haspopup="menu"');
    expect(trigger).toContain('aria-expanded="false"');

    const menuStart = markup.indexOf('data-publish-shapes-menu="closed"');
    expect(menuStart, 'Formen-Menü ist standardmäßig geschlossen').toBeGreaterThan(-1);
    for (const kind of PUBLISH_SHAPE_KINDS) {
      const shapeIndex = markup.indexOf(`data-publish-add-shape="${kind}"`);
      expect(shapeIndex, kind).toBeGreaterThan(menuStart);
      expect(markup.slice(shapeIndex, shapeIndex + 300)).toContain(`aria-label="${copy.shape}: ${kind}"`);
    }
    // Die Formen liegen nicht mehr lose in der Primärleiste vor dem Menü-Trigger.
    const firstShape = markup.indexOf('data-publish-add-shape');
    expect(firstShape).toBeGreaterThan(triggerStart);
  });

  it('bündelt die Exportziele in einem echten Menü und behält den Ausgabe-Anker', () => {
    const markup = render();
    const triggerStart = markup.indexOf('data-publish-export-trigger="true"');
    expect(triggerStart).toBeGreaterThan(-1);
    const trigger = markup.slice(triggerStart, triggerStart + 800);
    expect(trigger).toContain('aria-haspopup="menu"');
    expect(trigger).toContain('aria-expanded="false"');
    expect(trigger).toContain('data-vgt-app-guide-anchor="Publish:second"');

    const menuStart = markup.indexOf('data-publish-export-menu="closed"');
    expect(menuStart, 'Export-Menü ist standardmäßig geschlossen').toBeGreaterThan(-1);
    for (const target of PUBLISH_EXPORT_TARGETS) {
      const targetIndex = markup.indexOf(`data-publish-export-button="${target}"`);
      expect(targetIndex, target).toBeGreaterThan(menuStart);
    }
  });

  it('sperrt im laufenden Export alle Ziele und markiert genau das laufende Ziel', () => {
    const markup = render({ exporting: 'epub' });
    expect(markup).toContain('data-publish-export-menu="closed"');
    for (const target of PUBLISH_EXPORT_TARGETS) {
      // Reihenfolge der Attribute im SSR-Markup: disabled steht vor dem data-Attribut.
      const disabledTarget = new RegExp(`<button[^>]*disabled=""[^>]*data-publish-export-button="${target}"`, 'u');
      expect(markup, target).toMatch(disabledTarget);
    }
    const busyEpub = /<button[^>]*aria-busy="true"[^>]*data-publish-export-button="epub"/u;
    expect(markup).toMatch(busyEpub);
  });

  it('gibt der Seite-&-Dokument-Ebene eine eigene, einklappbare Leiste mit aria-expanded', () => {
    const markup = render();
    expect(markup).toContain('data-publish-secondary-bar="true"');
    expect(markup).toContain('data-publish-secondary-state="open"');
    const toggleStart = markup.indexOf('data-publish-secondary-toggle="true"');
    expect(toggleStart).toBeGreaterThan(-1);
    const toggle = markup.slice(toggleStart, toggleStart + 600);
    expect(toggle).toContain('aria-expanded="true"');
    expect(toggle).toContain('aria-controls="publish-page-settings-bar"');

    const pageBarStart = markup.indexOf('id="publish-page-settings-bar"');
    expect(pageBarStart).toBeGreaterThan(-1);
    const pageBar = markup.slice(pageBarStart);
    expect(pageBar).toContain(`aria-label="${copy.documentBar}"`);
    expect(pageBar).toContain(`aria-label="${copy.previousPage}"`);
    expect(pageBar).toContain(`aria-label="${copy.nextPage}"`);
    expect(pageBar).toContain('data-vgt-app-guide-anchor="Publish:first"');
    expect(pageBar).toContain(`aria-label="${copy.setColumns.replace('{count}', '1')}"`);
    expect(pageBar).toContain(copy.guides);
  });

  it('nennt den Vault-Blockierungsgrund weiterhin als Text und deaktiviert den Einstieg', () => {
    const markup = render({ vaultAssetBlockedReason: 'The Vault is locked in this session.' });
    expect(markup).toContain('data-vault-picker-entry="Publish"');
    const vaultStart = markup.indexOf('data-vault-picker-entry="Publish"');
    expect(markup.slice(vaultStart, vaultStart + 700)).toContain('disabled=""');
    expect(markup).toContain('data-vault-blocked-reason="true"');
    expect(markup).toContain('The Vault is locked in this session.');
  });

  it('behält die Kernbedienung: Undo/Redo/Zoom-Namen, Preflight-Zahl, Neues Dokument', () => {
    const markup = render();
    for (const label of [copy.undo, copy.redo, copy.zoomIn, copy.zoomOut]) {
      expect(markup, label).toContain(`aria-label="${label}"`);
    }
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('data-publish-preflight-count="2"');
    expect(markup).toContain('data-publish-new-document-entry="true"');
    expect(markup).toContain(`aria-label="${copy.textFrame}"`);
    expect(markup).toContain(`aria-label="${copy.imageFrame}"`);
    expect(markup).toContain('data-publish-document-title="Astraea brochure"');
  });
});
