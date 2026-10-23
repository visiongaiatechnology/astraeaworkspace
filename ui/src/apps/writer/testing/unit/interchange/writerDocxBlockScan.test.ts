// STATUS: DIAMANT — W-171: the block scan must survive what a foreign file can legally contain
//
// The scan was still text-based in two reachable ways: a `>` inside a **quoted attribute value** ended the
// tag early, and a **CDATA section** was tokenised as markup. Both are legal XML that a foreign producer can
// emit, and both shift every following block boundary — so the consequence is not "one odd file" but
// "paragraphs end up in the wrong place".
//
// The tests go through `blocks`/`removeBlocks`, which is what `importDocx` uses to split the body, so the
// property measured is the one that matters: the paragraph and table boundaries.
import { describe, expect, it } from 'vitest';

import { blocks, removeBlocks } from '../../../../../platform/interop/docx/import/xmlParsing';

describe('W-171 — a `>` inside an attribute value does not end the tag', () => {
  it('keeps a paragraph whole when its attribute carries a comparison', () => {
    // Legal XML: `>` needs no escaping inside an attribute value, and Word writes field instructions this way.
    const xml = '<w:p w:rsidR="00" w:instr="IF x > 5"><w:r><w:t>Treffer</w:t></w:r></w:p>'
      + '<w:p><w:r><w:t>Danach</w:t></w:r></w:p>';
    const found = blocks(xml, 'p');
    expect(found).toHaveLength(2);
    expect(found[0]).toContain('Treffer');
    expect(found[1]).toContain('Danach');
  });

  it('keeps a table whole when a cell attribute carries a comparison', () => {
    const xml = '<w:tbl><w:tr><w:tc w:val="a > b"><w:p><w:r><w:t>Zelle</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';
    expect(blocks(xml, 'tbl')).toHaveLength(1);
    expect(blocks(xml, 'tbl')[0]).toContain('Zelle');
  });

  it('handles a single-quoted attribute the same way', () => {
    const xml = "<w:p w:x='a > b'><w:r><w:t>Text</w:t></w:r></w:p>";
    expect(blocks(xml, 'p')).toHaveLength(1);
  });

  it('leaves the body without tables intact when an attribute carries a comparison', () => {
    const xml = '<w:body><w:p w:v="a > b"><w:r><w:t>Vorher</w:t></w:r></w:p>'
      + '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Zelle</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
      + '<w:p><w:r><w:t>Nachher</w:t></w:r></w:p></w:body>';
    const withoutTables = removeBlocks(xml, 'tbl');
    expect(withoutTables).toContain('Vorher');
    expect(withoutTables).toContain('Nachher');
    // The cell text must not leak into the running text.
    expect(withoutTables).not.toContain('Zelle');
    // And the two body paragraphs are still two.
    expect(blocks(withoutTables, 'p')).toHaveLength(2);
  });
});

describe('W-171 — a CDATA section is not markup', () => {
  it('does not open a block from inside CDATA', () => {
    const xml = '<w:p><w:r><w:t><![CDATA[<w:p>kein Absatz</w:p>]]></w:t></w:r></w:p>';
    // One real paragraph, not three: the CDATA content must not be scanned as elements.
    expect(blocks(xml, 'p')).toHaveLength(1);
  });

  it('does not close a block early from inside CDATA', () => {
    const xml = '<w:p><w:r><w:t><![CDATA[</w:p>]]></w:t></w:r><w:r><w:t>Rest</w:t></w:r></w:p>'
      + '<w:p><w:r><w:t>Zweiter</w:t></w:r></w:p>';
    const found = blocks(xml, 'p');
    expect(found).toHaveLength(2);
    expect(found[0]).toContain('Rest');
    expect(found[1]).toContain('Zweiter');
  });

  it('does not report a CDATA section as a block of the scanned name', () => {
    /*
     * Measured, not assumed: this test exists because my first CDATA tests passed with the guard in the walk
     * loop **removed**. `readTagEnd` also recognises CDATA (and reports it as self-closing), so a CDATA
     * section was being pushed as if it were an element — a phantom block that the count-based tests above
     * did not notice. The name is scanned as `body` here so the section is the only candidate.
     */
    const xml = '<body><![CDATA[kein Element]]></body>';
    expect(blocks(xml, 'body')).toHaveLength(1);
    // The body section ends at its real closer, not at the CDATA section.
    expect(blocks(xml, 'body')[0]).toBe(xml);
  });

  it('does not treat CDATA content as a self-closing block', () => {
    // With the guard in the walk loop, the section is skipped whole; without it, the section itself becomes
    // a block of the scanned name.
    const xml = '<body><![CDATA[<body>]]></body>';
    const found = blocks(xml, 'body');
    expect(found).toHaveLength(1);
    expect(found[0]).toBe(xml);
  });
  it('skips an unterminated CDATA section instead of hanging or throwing', () => {
    const xml = '<w:p><w:r><w:t><![CDATA[nie geschlossen';
    expect(() => blocks(xml, 'p')).not.toThrow();
    // The paragraph is unclosed, so it is skipped rather than swallowing the document.
    expect(blocks(xml, 'p')).toEqual([]);
  });
});

describe('the scan still does what it did before the fix', () => {
  it('finds the outermost element when elements nest', () => {
    const xml = '<w:tbl><w:tr><w:tc><w:tbl><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl></w:tc></w:tr></w:tbl>';
    expect(blocks(xml, 'tbl')).toHaveLength(1);
  });

  it('finds a self-closing element', () => {
    expect(blocks('<w:body><w:p/><w:p/></w:body>', 'p')).toHaveLength(2);
  });

  it('does not swallow the rest of the document for an unclosed element', () => {
    /*
     * This expectation changed with W-171, and the change is a **loss**, stated rather than hidden.
     *
     * The old scan restarted at the next opener when an element was never closed, so `<w:p>offen<w:p>x</w:p>`
     * yielded one block. The depth-walk cannot recover that way **soundly**: at the second `<w:p>` the input
     * is genuinely ambiguous — it can be an unclosed outer paragraph containing a closed inner one, or two
     * paragraphs where the first is malformed — and the recovery rule that "fixes" the second reading breaks
     * the nested reading that valid documents actually contain (`<w:tbl>a<w:tbl>b</w:tbl></w:tbl>`, pinned
     * above and in `docxNestedBlocks.test.ts`). I tried the heuristic, it broke three-level nesting, and the
     * nesting case is the one real files have.
     *
     * What is preserved is the property that matters: the scan does not run away, does not throw, and does
     * not swallow the rest of the document. An unclosed element simply yields nothing.
     */
    const xml = '<w:p>offen<w:p>geschlossen</w:p>';
    expect(() => blocks(xml, 'p')).not.toThrow();
    expect(blocks(xml, 'p')).toEqual([]);
    // And the text after an unclosed element is still reachable for the caller that removes blocks.
    expect(removeBlocks('<w:p>offen<w:tbl>x</w:tbl><w:p>y</w:p>', 'tbl')).toContain('<w:p>y</w:p>');
  });

  it('returns nothing for a name that is not present', () => {
    expect(blocks('<w:body><w:p/></w:body>', 'tbl')).toEqual([]);
  });

  it('does not match a longer name that merely starts with this one', () => {
    // `p` must not match `pPr`, or every paragraph property becomes a paragraph.
    expect(blocks('<w:body><w:pPr/></w:body>', 'p')).toEqual([]);
  });
});
