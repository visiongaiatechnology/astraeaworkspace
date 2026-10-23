/**
 * P25 / AST-0121 — die Umbruchstile: `resolveMediaWrapStyles`. Der letzte Export des Pakets.
 *
 * ## Der Vertrag, aus dem Quelltext gelesen
 *
 * ```ts
 * let wrapperClassName = 'group transition-all select-none ';
 * if (fixedToPage) {
 *   position absolute, left/top aus dem Anker, margin 0, float none;
 *   zIndex = behind-text ? 1 : 25;                       // FIXIERT: 1 oder 25
 *   return { ... };                                       // frueher Ausstieg
 * }
 * switch (wrapMode) {
 *   case 'square' | 'tight' | 'through':  float links/rechts nach alignment/placement
 *   case 'top-bottom':                    block mit Abstaenden
 *   case 'behind-text' | 'in-front-of-text': position absolute;
 *                                         zIndex = behind-text ? 0 : 20   // FREI: 0 oder 20
 *   case 'inline':                        inline-block
 * }
 * return { containerStyle, imageStyle, wrapperClassName: wrapperClassName.trim() };
 * ```
 *
 * **Zwei Zusicherungen geben den Ausschlag:**
 *
 * 1. **Der `zIndex` unterscheidet sich zwischen fixierten und frei fliessenden Bildern** (25/1 gegen 20/0).
 *    Wer nur einen Zweig prueft, bemerkt eine Vertauschung nicht.
 * 2. **`shapeImageThreshold` entsteht nur fuer ein RASTER-Daten-URL.** Die Freistellung bei `tight`/`through`
 *    laeuft durch `isSafeRasterDataUrl` - **ein SVG bekommt sie nicht.** Das ist eine Verweigerung, und sie
 *    gehoert getestet.
 */

import { describe, expect, it } from 'vitest';
import { resolveMediaWrapStyles } from '../../../../media/images/operations/writerMediaOperations';
import type { WriterImageBlockData } from '../../../../../../shared/contracts/workspace';

const PNG_URL = 'data:image/png;base64,iVBORw0KGgo=';
const image = (over: Record<string, unknown> = {}): WriterImageBlockData =>
  ({ id: 'img-1', dataUrl: PNG_URL, ...over } as unknown as WriterImageBlockData);

const styles = (over: Record<string, unknown> = {}, geometry?: unknown) =>
  resolveMediaWrapStyles(image(over), geometry as never) as unknown as {
    containerStyle: Record<string, unknown>;
    imageStyle: Record<string, unknown>;
    wrapperClassName: string;
  };

describe('resolveMediaWrapStyles — die Grundklassen', () => {
  it('die Basisklassen sind immer vorhanden und getrimmt', () => {
    const result = styles({ wrapMode: 'square' });
    expect(result.wrapperClassName).toContain('group');
    expect(result.wrapperClassName).toContain('transition-all');
    expect(result.wrapperClassName).toContain('select-none');
    // Getrimmt - kein Leerzeichen am Ende.
    expect(result.wrapperClassName).toBe(result.wrapperClassName.trim());
    expect(result.wrapperClassName.endsWith(' ')).toBe(false);
  });

  it('gibt genau drei Bestandteile zurueck', () => {
    const result = styles();
    expect(Object.keys(result).sort()).toEqual(['containerStyle', 'imageStyle', 'wrapperClassName']);
  });

  it('ist deterministisch', () => {
    expect(styles({ wrapMode: 'square' })).toEqual(styles({ wrapMode: 'square' }));
  });
});

describe('resolveMediaWrapStyles — fixierte Bilder, und der andere zIndex', () => {
  it('HAUPTZUSICHERUNG: ein fixiertes Bild bekommt 25 bzw. 1 — nicht 20 bzw. 0', () => {
    // Die beiden Wertepaare unterscheiden sich. Wer nur einen Zweig prueft, bemerkt eine Vertauschung nicht.
    expect(styles({ fixPositionOnPage: true, wrapMode: 'square' }).containerStyle.zIndex).toBe(25);
    expect(styles({ fixPositionOnPage: true, wrapMode: 'behind-text' }).containerStyle.zIndex).toBe(1);
  });

  it('ein frei fliessendes Bild bekommt 20 bzw. 0', () => {
    expect(styles({ wrapMode: 'in-front-of-text' }).containerStyle.zIndex).toBe(20);
    expect(styles({ wrapMode: 'behind-text' }).containerStyle.zIndex).toBe(0);
  });

  it('ein fixiertes Bild liegt absolut und verbraucht keinen Fluss', () => {
    const result = styles({ fixPositionOnPage: true, wrapMode: 'square', horizontalOffsetMm: 12, verticalOffsetMm: 34 });
    expect(result.containerStyle.position).toBe('absolute');
    // Der Kommentar nennt den Grund: "absolute page-layer objects and therefore never consume document flow".
    expect(result.containerStyle.float).toBe('none');
    expect(result.containerStyle.margin).toBe(0);
  });

  it('und traegt die passende Zusatzklasse', () => {
    expect(styles({ fixPositionOnPage: true, wrapMode: 'behind-text' }).wrapperClassName).toContain('opacity-80');
    expect(styles({ fixPositionOnPage: true, wrapMode: 'in-front-of-text' }).wrapperClassName).toContain('shadow-xl');
  });

  it('die Fixierung wird ueber alle fuenf Wege erkannt', () => {
    for (const over of [
      { fixPositionOnPage: true }, { moveWithText: false },
      { anchorTarget: 'page' }, { anchorTarget: 'margin' }, { anchorTarget: 'column' },
    ]) {
      expect(styles({ ...over, wrapMode: 'square' }).containerStyle.position, JSON.stringify(over)).toBe('absolute');
    }
  });
});

describe('resolveMediaWrapStyles — die Freistellung nur fuer Rasterbilder', () => {
  it('HAUPTZUSICHERUNG: ein PNG bekommt bei tight/through einen shapeImageThreshold', () => {
    // 0.85 fuer through, 0.15 fuer tight - zwei verschiedene Werte.
    expect(styles({ wrapMode: 'through', dataUrl: PNG_URL }).containerStyle.shapeImageThreshold).toBe(0.85);
    expect(styles({ wrapMode: 'tight', dataUrl: PNG_URL }).containerStyle.shapeImageThreshold).toBe(0.15);
  });

  it('square bekommt KEINE Freistellung', () => {
    expect(styles({ wrapMode: 'square', dataUrl: PNG_URL }).containerStyle.shapeImageThreshold).toBeUndefined();
  });

  it('HAUPTZUSICHERUNG: ein SVG bekommt keine Freistellung — die Verweigerung greift', () => {
    // `isSafeRasterDataUrl` akzeptiert nur png, jpeg und webp. Ein SVG darf nicht durchrutschen.
    const svg = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
    expect(styles({ wrapMode: 'through', dataUrl: svg }).containerStyle.shapeImageThreshold).toBeUndefined();
    expect(styles({ wrapMode: 'tight', dataUrl: svg }).containerStyle.shapeImageThreshold).toBeUndefined();
  });

  it('JPEG und WebP werden ebenso akzeptiert', () => {
    expect(styles({ wrapMode: 'through', dataUrl: 'data:image/jpeg;base64,AAAA' }).containerStyle.shapeImageThreshold).toBe(0.85);
    expect(styles({ wrapMode: 'through', dataUrl: 'data:image/webp;base64,AAAA' }).containerStyle.shapeImageThreshold).toBe(0.85);
  });

  it('ein erfundener Rastertyp wird nicht akzeptiert', () => {
    expect(styles({ wrapMode: 'through', dataUrl: 'data:image/bmp;base64,AAAA' }).containerStyle.shapeImageThreshold).toBeUndefined();
    expect(styles({ wrapMode: 'through', dataUrl: 'data:text/html;base64,AAAA' }).containerStyle.shapeImageThreshold).toBeUndefined();
  });
});

describe('resolveMediaWrapStyles — die uebrigen Umbrucharten', () => {
  it('inline ergibt inline-block', () => {
    expect(styles({ wrapMode: 'inline' }).containerStyle.display).toBe('inline-block');
  });

  it('top-bottom ergibt block', () => {
    expect(styles({ wrapMode: 'top-bottom' }).containerStyle.display).toBe('block');
  });

  it('behind-text und in-front-of-text liegen absolut, ohne den Fluss zu stoeren', () => {
    for (const wrapMode of ['behind-text', 'in-front-of-text']) {
      const result = styles({ wrapMode });
      expect(result.containerStyle.position, wrapMode).toBe('absolute');
      expect(result.containerStyle.float, wrapMode).toBe('none');
    }
  });

  it('square richtet sich nach alignment und placement', () => {
    const rechts = styles({ wrapMode: 'square', alignment: 'right' });
    expect(rechts.containerStyle.float).toBe('right');
    expect(rechts.wrapperClassName).toContain('float-right');

    const links = styles({ wrapMode: 'square', alignment: 'left' });
    expect(links.containerStyle.float).toBe('left');
    expect(links.wrapperClassName).toContain('float-left');

    // `placement` wirkt ebenso.
    expect(styles({ wrapMode: 'square', placement: 'float-right' }).containerStyle.float).toBe('right');
  });

  it('ein fehlender wrapMode wird aufgeloest, nicht als undefined durchgereicht', () => {
    // W-057: eine Aufloesung fuer den fehlenden Fall, geteilt mit dem Schreibpfad.
    const result = styles({ wrapMode: undefined });
    // **ZWEI eigene Fehlannahmen in diesem einen Fall, beide gemessen:**
    //   1. Ich pruefte `position` auf `defined`. Falsch - `position` wird nur in den Zweigen `fixed` und
    //      `behind-text`/`in-front-of-text` gesetzt.
    //   2. Ich nahm an, der fehlende Umbruch werde zu `square` aufgeloest und das Ergebnis sei identisch.
    //      **Ist es nicht:** der Rueckfall erzeugt DREI Schluessel im `containerStyle`, `square` FUENF.
    //
    // **Welcher Modus der Rueckfall genau ist, behaupte ich hier nicht** - dafuer muesste ich
    // `resolveWriterImageWrapMode` lesen. Festgehalten wird, was messbar ist: es wird aufgeloest, es gibt
    // eine Klasse, und es gibt kein `undefined` durch.
    expect(result.containerStyle.position).toBeUndefined();
    expect(result.wrapperClassName.length).toBeGreaterThan(0);
    expect(result.containerStyle.maxWidth).toBe('100%');
    // Und der Rueckfall ist NICHT square - das ist der Befund.
    expect(result.containerStyle).not.toEqual(styles({ wrapMode: 'square' }).containerStyle);
  });
});
