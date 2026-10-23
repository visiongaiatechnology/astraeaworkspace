// @vitest-environment happy-dom
// STATUS: DIAMANT VGT SUPREME — die fuenfte DoD-Eigenschaft des PDF Studios, im DOM gemessen.
//
// WARUM DIESE DATEI EXISTIERT
// M05-Z1113 verlangt: "Tastaturbedienung, Screenreader-Semantik, High-Contrast, Fokusfuehrung und
// skalierbare UI gehoeren zum Definition-of-Done." Die Schwesterdatei
// `pdfStudioUiScale.runtime.test.tsx` belegt, dass die Skalierung AM WURZELKNOTEN ankommt, auf
// beiden Renderpfaden.
//
// SIE BELEGT NICHT DIE TYPOGRAFIE DER NACHFAHREN, und das ist gemessen: happy-dom merkt die
// Aufloesung von `rem` — bei einer Wurzel von 200 % stieg nur die Wurzel (16px -> 64px), ein
// rem-Kind blieb 16px und ein px-Kind blieb 11px. Eine feste Pixelgroesse kann der Skalierung in
// einem echten Browser nicht folgen. Das PDF Studio trug 334 solcher Klassen in 34 Dateien. Sie
// sind jetzt rem — groessengleich bei einer Wurzel von 16px.
//
// WAS DIESER TEST BELEGT: die VORBEDINGUNG — keine feste Pixelgroesse mehr am gerenderten DOM,
// auf BEIDEN Renderpfaden. Was er NICHT belegt: dass die Schrift bei vergroesserter Wurzel
// mitwaechst. Das braucht echtes Layout und bleibt ein NATIVE Release-Gate (Paragraf 2).
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import type { PdfDocumentModel } from '../../../../shared/contracts/notes-pdf/pdf/workspacePdf';
import { PdfStudio } from '../../../../apps/pdf/studio/PdfStudio';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function pdfDokument(): WorkspaceDocument {
  return {
    id: 'pdf-skalierung-witness',
    title: 'PDF Skalierung',
    kind: 'PdfStudio',
    created_at: 0,
    modified_at: 0,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
  };
}

/** Der native Pfad haengt an `pdfData.rawPdfDataUrl`; `redactions` und `pages` werden vor dem Rendern gelesen. */
function nativerPdfDokument(): WorkspaceDocument {
  const pdfData: PdfDocumentModel = {
    numPages: 0,
    pages: [],
    annotations: [],
    redactions: [],
    rawPdfDataUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
    rawPdfFileName: 'fremd.pdf',
    rawPdfByteLength: 9,
  };
  return { ...pdfDokument(), pdfData };
}

async function mitGerendertemPdf(
  dokument: WorkspaceDocument,
  pruefung: (container: HTMLElement) => void,
): Promise<void> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<PdfStudio document={dokument} onUpdateDocument={vi.fn()} />);
  });
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 80);
    });
  });
  try {
    pruefung(container);
  } finally {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }
}

/** Sammelt jede feste Pixel-Schriftgroesse, die an einem gerenderten Element ankommt. */
function festePixelgroessen(container: HTMLElement): string[] {
  const treffer: string[] = [];
  for (const element of container.querySelectorAll<HTMLElement>('*')) {
    const gefunden = (element.getAttribute('class') ?? '').match(/text-\[\d+px\]/gu);
    if (gefunden) {
      treffer.push(`<${element.tagName.toLowerCase()}> ${gefunden.join(', ')}`);
    }
  }
  return treffer;
}

describe('die Schrift des PDF Studios traegt keine feste Pixelgroesse mehr', () => {
  it('traegt auf dem strukturierten Pfad keine feste Pixel-Schriftgroesse', async () => {
    await mitGerendertemPdf(pdfDokument(), (container) => {
      const treffer = festePixelgroessen(container);
      expect(
        treffer,
        `feste Pixel-Schriftgroessen an gerenderten Elementen:\n${treffer.join('\n')}`,
      ).toEqual([]);
      expect(container.querySelectorAll<HTMLElement>('[class]').length).toBeGreaterThan(10);
    });
  });

  it('traegt auf dem nativen Pfad keine feste Pixel-Schriftgroesse', async () => {
    await mitGerendertemPdf(nativerPdfDokument(), (container) => {
      const treffer = festePixelgroessen(container);
      expect(
        treffer,
        `feste Pixel-Schriftgroessen an gerenderten Elementen (nativ):\n${treffer.join('\n')}`,
      ).toEqual([]);
      expect(container.querySelectorAll<HTMLElement>('[class]').length).toBeGreaterThan(10);
    });
  });
});
