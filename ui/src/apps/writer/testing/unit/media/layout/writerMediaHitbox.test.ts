// @vitest-environment happy-dom
// STATUS: PLATIN — native round 6: one hit-test rule for media islands and media bands
//
// The page used to ask `island.querySelector(marker)` whether an island *contains* media.
// An island that **is** the marked element was therefore classified as a text island and
// swallowed the click that was supposed to create the caption below the picture. These cases
// pin the rule itself: only non-media islands refuse the click.
import { describe, expect, it } from 'vitest';
import {
  isWriterMediaElement,
  isWriterTextIsland,
  paragraphCarriesWriterMedia,
} from '../../../../media/layout/writerMediaHitbox';

function element(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
}

describe('isWriterMediaElement', () => {
  it('recognises the marked element itself', () => {
    const host = element('<div contenteditable="false" data-writer-image-id="img-1"></div>');
    expect(isWriterMediaElement(host.firstElementChild)).toBe(true);
  });

  it('recognises a wrapper that only contains media', () => {
    const host = element(
      '<div contenteditable="false"><figure data-writer-image-id="img-2"><img alt="" /></figure></div>',
    );
    expect(isWriterMediaElement(host.firstElementChild)).toBe(true);
    // …and the figure inside it as well.
    expect(isWriterMediaElement(host.querySelector('figure'))).toBe(true);
  });

  it('accepts every media marker family the layers use', () => {
    const host = element([
      '<div contenteditable="false" data-writer-media-id="m1"></div>',
      '<div contenteditable="false" data-writer-media-object="o1"></div>',
      '<div contenteditable="false" data-writer-shape-canvas="true"></div>',
      '<div contenteditable="false" data-writer-shape-anchor="p1"></div>',
    ].join(''));
    for (const child of Array.from(host.children)) {
      expect(isWriterMediaElement(child), child.outerHTML).toBe(true);
    }
  });

  it('rejects a plain element and null', () => {
    const host = element('<div contenteditable="false"><span>Fußnote</span></div>');
    expect(isWriterMediaElement(host.firstElementChild)).toBe(false);
    expect(isWriterMediaElement(null)).toBe(false);
  });
});

describe('isWriterTextIsland', () => {
  it('treats a footnote island as text and refuses the click', () => {
    const host = element(
      '<div contenteditable="false"><span data-writer-footnote>Hinweis</span></div>',
    );
    expect(isWriterTextIsland(host.querySelector('span'))).toBe(true);
  });

  it('lets a media island through, whether it is marked or contains a marking', () => {
    const host = element([
      '<div contenteditable="false" data-writer-media-id="m1"><span id="inner">x</span></div>',
      '<div contenteditable="false"><figure data-writer-image-id="img-3"></figure></div>',
    ].join(''));
    const marked = host.querySelector('#inner');
    expect(isWriterTextIsland(marked), 'die markierte Insel selbst ist Medienfläche').toBe(false);
    const wrapper = host.children[1];
    expect(isWriterTextIsland(wrapper), 'die Insel um ein Bild ist Medienfläche').toBe(false);
  });

  it('does not claim elements outside any island', () => {
    const host = element('<div><p id="paper">Seite</p></div>');
    expect(isWriterTextIsland(host.querySelector('#paper'))).toBe(false);
    expect(isWriterTextIsland(null)).toBe(false);
  });
});

describe('paragraphCarriesWriterMedia', () => {
  it('answers from the model, independent of what the DOM renders', () => {
    expect(paragraphCarriesWriterMedia('p1', { images: [{ anchorParagraphId: 'p1' }] })).toBe(true);
    expect(paragraphCarriesWriterMedia('p1', { mediaObjects: [{ anchorParagraphId: 'p1' }] })).toBe(true);
    expect(paragraphCarriesWriterMedia('p1', { shapes: [{ anchorParagraphId: 'p1' }] })).toBe(true);
  });

  it('is false without an anchor, with another anchor, or with empty input', () => {
    expect(paragraphCarriesWriterMedia('p1', { images: [{ anchorParagraphId: 'p2' }] })).toBe(false);
    expect(paragraphCarriesWriterMedia('p1', { images: [] })).toBe(false);
    expect(paragraphCarriesWriterMedia('p1', {})).toBe(false);
    expect(paragraphCarriesWriterMedia('', { images: [{ anchorParagraphId: '' }] })).toBe(false);
  });
});
