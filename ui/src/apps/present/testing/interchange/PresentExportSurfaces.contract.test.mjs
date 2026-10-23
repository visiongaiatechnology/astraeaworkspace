// Contract test for BATCH-PRESENT-5 (Paket 23/24/25/26/27): the visible export centre must enforce the
// interop ceiling, offer the round-trip comparison, and the sidebar must expose the template picker.
// Also covers the two registered defects PRES-D002 (bypassed bound) and PRES-D003 (duplicated constant).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PresentExportCenterModal } from '../../interchange/PresentExportCenterModal';
import { PresentSidebar } from '../../editor/navigation/PresentSidebar';

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(resolve(here, relative), 'utf8');

const exportCenter = read('../../interchange/PresentExportCenterModal.tsx');
const productivity = read('../../productivity/PresentProductivityModal.tsx');
const sidebar = read('../../editor/navigation/PresentSidebar.tsx');
const presentCanvas = read('../../PresentCanvas.tsx');

const document = (slideCount) => ({
  id: 'doc-1',
  kind: 'Present',
  title: 'Deck',
  version: 1,
  modified_at: 0,
  presentData: {
    slides: Array.from({ length: slideCount }, (_, index) => ({ id: `s${index}`, title: `S${index}`, subtitle: '', layout: 'blank' })),
  },
});

describe('PresentExportCenterModal contract (Paket 24/26)', () => {
  const render = (slideCount) => renderToStaticMarkup(createElement(PresentExportCenterModal, {
    isOpen: true,
    document: document(slideCount),
    model: document(slideCount).presentData,
    currentSlide: { id: 's0', title: 'S0', subtitle: '', layout: 'blank' },
    onClose: vi.fn(),
  }));

  it('offers PPTX and ODP export plus the round-trip verification', () => {
    const html = render(3);
    expect(html).toContain('data-present-export="pptx"');
    expect(html).toContain('data-present-export="odp"');
    expect(html).toContain('data-present-export-verify="pptx"');
    expect(html).toContain('data-present-export-verify="odp"');
    expect(html).toContain('Verify PPTX round trip');
  });

  it('shows the interop ceiling and disables the office export above it (PRES-D002)', () => {
    const html = render(513);
    expect(html).toContain('data-present-export-limit="true"');
    expect(html).toContain('the interoperable ceiling is 512');
    // The buttons must be disabled rather than silently truncating the deck. The assertion extracts
    // the actual tag: a plain substring check for "disabled" is satisfied by the Tailwind class
    // `disabled:opacity-40`, which is how the first version of this test missed the revert.
    const pptxTag = html.match(/<button[^>]*data-present-export="pptx"[^>]*>/)?.[0] ?? '';
    const odpTag = html.match(/<button[^>]*data-present-export="odp"[^>]*>/)?.[0] ?? '';
    expect(pptxTag).toContain('disabled=""');
    expect(odpTag).toContain('disabled=""');
  });

  it('enables the office export inside the ceiling', () => {
    const html = render(3);
    const pptxTag = html.match(/<button[^>]*data-present-export="pptx"[^>]*>/)?.[0] ?? '';
    expect(pptxTag).not.toContain('disabled=""');
  });

  it('does not render a limit warning for a deck inside the ceiling', () => {
    expect(render(3)).not.toContain('data-present-export-limit="true"');
  });
});

describe('BATCH-PRESENT-5 reachability and defect closure', () => {
  it('routes the office export through the bounded module (PRES-D002)', () => {
    expect(exportCenter).toContain('exportPresentDeck(document, \'pptx\')');
    expect(exportCenter).toContain('exportPresentDeck(document, \'odp\')');
    expect(exportCenter).toContain('verifyPresentRoundTrip(document');
    expect(exportCenter).toContain('PRESENT_OFFICE_FIDELITY_LIMITS.map');
    expect(exportCenter).toContain('data-present-fidelity-report');
    // The direct platform calls that bypassed the bound must be gone from the visible path.
    expect(exportCenter).not.toContain("from '../../../platform/interop/pptx'");
    expect(exportCenter).not.toContain("from '../../../platform/interop/odp'");
  });

  it('uses the shared import bounds instead of a duplicated constant (PRES-D003)', () => {
    expect(productivity).toContain('assertPresentOfficeImportBounds(bytes, file.name)');
    expect(productivity).toContain('PRESENT_OFFICE_IMPORT_MAX_BYTES');
    expect(productivity).not.toContain('const MAX_IMPORT_BYTES');
    expect(productivity).toContain('importPresentDeckBytes(bytes, file.name)');
    expect(productivity).not.toContain("from '../../../platform/interop/pptx'");
  });

  it('offers "open as this deck" and states what is not mapped (Paket 23)', () => {
    expect(productivity).toContain('data-present-import-open="true"');
    expect(productivity).toContain('presentImportFidelityNote(imported.format)');
    expect(productivity).toContain('undo restores the previous deck');
  });

  it('exposes the template picker and applies templates through the pure rule (Paket 27)', () => {
    expect(sidebar).toContain('data-present-template-select="true"');
    expect(sidebar).toContain('data-present-template-apply="true"');
    expect(sidebar).toContain('PRESENT_TEMPLATES.map');
    expect(presentCanvas).toContain('applyPresentTemplate(presentData, template, values');
    expect(presentCanvas).toContain('presentTemplateById(templateId)');
    expect(presentCanvas).toContain('Unfilled placeholders remain visible');
    expect(presentCanvas).toContain('its master and theme were kept');
  });

  it('keeps the rendered output selection in deck order (Paket 26)', () => {
    const presentExport = read('../../interchange/render/presentExport.ts');
    const documentExport = read('../../interchange/document-export/presentDocumentExport.ts');
    expect(presentExport).toContain('export function resolvePresentSlideSelection');
    expect(presentExport).toContain('const selected = resolvePresentSlideSelection(model, slideIds);');
    expect(documentExport).toContain('resolvePresentSlideSelection(model, slideIds)');
    expect(documentExport).toContain('resolvePresentSlideSelection(normalized, slideIds)');
    // The three inline copies of the filter rule are gone.
    expect(presentExport).not.toContain('model.slides.filter((slide) => slideIds.includes(slide.id))');
    expect(documentExport).not.toContain('slideIds.includes(slide.id)');
  });
});
