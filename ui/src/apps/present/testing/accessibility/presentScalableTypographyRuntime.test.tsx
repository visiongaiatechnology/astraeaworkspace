// @vitest-environment happy-dom
// STATUS: DIAMANT VGT SUPREME — die fuenfte DoD-Eigenschaft des Present-Moduls, im DOM gemessen.
//
// WARUM DIESE DATEI EXISTIERT
// M03-Z0692 verlangt: "Tastaturbedienung, Screenreader-Semantik, High-Contrast, Fokusfuehrung und
// skalierbare UI gehoeren zum Definition-of-Done." Die Schwesterdatei
// `presentCanvasUiScale.runtime.test.tsx` belegt, dass die Skalierung AM WURZELKNOTEN ankommt —
// sie setzt und aendert `data-astraea-scale-percent` und die Wurzel-Schriftgroesse.
//
// SIE BELEGT ABER NICHT DIE TYPOGRAFIE DER NACHFAHREN, und das hat der Agent, der sie geschrieben
// hat, ausdruecklich GEMESSEN statt angenommen:
//
//     happy-dom MERKT die Aufloesung von `rem`. Bei einer Wurzel von 200 % stieg nur die Wurzel
//     (16px -> 64px); ein `rem`-Kind blieb 16px und ein `px`-Kind blieb 11px.
//
// Daraus folgt beides: die Skalierung der Nachfahren ist unter happy-dom NICHT messbar, UND eine
// feste Pixelgroesse kann ihr in einem echten Browser nicht folgen. Das Present-Modul trug 375
// solcher Klassen in 36 Dateien (text-[6px] bis text-[22px]). Sie sind jetzt rem — groessengleich
// bei einer Wurzel von 16px, aber sie folgen der Wurzel.
//
// WAS DIESER TEST BELEGT: die VORBEDINGUNG — dass keine feste Pixelgroesse mehr am gerenderten
// DOM ankommt. Was er NICHT belegt: dass die Schrift bei vergroesserter Wurzel mitwaechst. Das
// braucht echtes Layout und bleibt ein NATIVE Release-Gate (Paragraf 2).
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { PresentCanvas } from '../../../../apps/present/PresentCanvas';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const presentDokument: WorkspaceDocument = {
  id: 'present-skalierung-witness',
  title: 'Present Skalierung',
  kind: 'Present',
  created_at: 0,
  modified_at: 0,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
};

async function mitGerendertemPresent(
  pruefung: (container: HTMLElement) => void,
): Promise<void> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <PresentCanvas
        document={presentDokument}
        onUpdateDocument={vi.fn()}
        onSelectSelectionType={vi.fn()}
      />,
    );
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

describe('die Schrift des Present-Moduls traegt keine feste Pixelgroesse mehr', () => {
  it('traegt an keinem gerenderten Element eine feste Pixel-Schriftgroesse', async () => {
    await mitGerendertemPresent((container) => {
      const treffer: string[] = [];
      for (const element of container.querySelectorAll<HTMLElement>('*')) {
        const gefunden = (element.getAttribute('class') ?? '').match(/text-\[\d+px\]/gu);
        if (gefunden) {
          treffer.push(`<${element.tagName.toLowerCase()}> ${gefunden.join(', ')}`);
        }
      }
      expect(
        treffer,
        `feste Pixel-Schriftgroessen an gerenderten Elementen:\n${treffer.join('\n')}`,
      ).toEqual([]);
    });
  });

  it('rendert ueberhaupt Inhalt, damit die Zusicherung nicht leer besteht', async () => {
    await mitGerendertemPresent((container) => {
      expect(container.querySelectorAll<HTMLElement>('[class]').length).toBeGreaterThan(10);
    });
  });
});
