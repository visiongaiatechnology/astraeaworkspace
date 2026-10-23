// STATUS: DIAMANT VGT SUPREME — Block scanning must respect nesting
//
// Paket 36 acceptance: "Externes mehrseitiges DOCX importieren, normale Textbearbeitung
// sofort ermöglichen" — without losing paragraphs.
//
// W-169: `blocks`/`removeBlocks` matched `<name …>…</name>` with a **non-greedy** regex,
// which stops at the first closing tag. Measured on a table inside a table:
//   removeBlocks left 3 "body" paragraphs instead of 2 — the cell paragraph
//   "Nach der Innentabelle" leaked into the running text as an extra paragraph;
//   blocks(tbl) returned 1 truncated table, losing everything after the inner table.
// DOCX nests freely (tables in cells, paragraphs in text boxes), so the scan counts
// depth now.
import { describe, expect, it } from 'vitest';
import { blocks, removeBlocks } from '../../../platform/interop/docx/import/xmlParsing';

const textsIn = (xml: string) => (xml.match(/<w:t>([^<]*)<\/w:t>/g) ?? [])
  .map((token) => token.replace(/<\/?w:t>/gu, ''));
const textsOf = (xmls: readonly string[]) => xmls.map(textsIn);

const NESTED_TABLE = '<w:body>'
  + '<w:p><w:r><w:t>Vorher</w:t></w:r></w:p>'
  + '<w:tbl><w:tr><w:tc>'
  + '<w:p><w:r><w:t>Aussenzelle</w:t></w:r></w:p>'
  + '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Innenzelle</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
  + '<w:p><w:r><w:t>Nach der Innentabelle</w:t></w:r></w:p>'
  + '</w:tc></w:tr></w:tbl>'
  + '<w:p><w:r><w:t>Nachher</w:t></w:r></w:p>'
  + '</w:body>';

describe('DOCX block scanning with nesting', () => {
  it('removes a whole nested table, so no cell paragraph leaks into the body', () => {
    const body = removeBlocks(NESTED_TABLE, 'tbl');
    const paragraphs = blocks(body, 'p');
    // Exactly the two real body paragraphs — not three.
    expect(textsOf(paragraphs)).toEqual([['Vorher'], ['Nachher']]);
  });

  it('keeps everything inside the outer table, including what follows the inner one', () => {
    const tables = blocks(NESTED_TABLE, 'tbl');
    expect(tables).toHaveLength(1);
    expect(textsIn(tables[0]!)).toEqual(['Aussenzelle', 'Innenzelle', 'Nach der Innentabelle']);
  });

  it('counts depth over three levels', () => {
    const deep = '<w:tbl>a<w:tbl>b<w:tbl>c</w:tbl>d</w:tbl>e</w:tbl>f<w:tbl>g</w:tbl>';
    const found = blocks(deep, 'tbl');
    expect(found).toEqual(['<w:tbl>a<w:tbl>b<w:tbl>c</w:tbl>d</w:tbl>e</w:tbl>', '<w:tbl>g</w:tbl>']);
    expect(removeBlocks(deep, 'tbl')).toBe('f');
  });

  it('handles self-closing elements without swallowing the next one', () => {
    const xml = '<w:tbl/><w:p><w:r><w:t>Danach</w:t></w:r></w:p><w:tbl w:x="1"/>';
    expect(blocks(xml, 'tbl')).toEqual(['<w:tbl/>', '<w:tbl w:x="1"/>']);
    expect(removeBlocks(xml, 'tbl')).toBe('<w:p><w:r><w:t>Danach</w:t></w:r></w:p>');
  });

  it('returns siblings separately and in order', () => {
    const xml = '<w:p>eins</w:p><w:p>zwei</w:p><w:p>drei</w:p>';
    expect(blocks(xml, 'p')).toEqual(['<w:p>eins</w:p>', '<w:p>zwei</w:p>', '<w:p>drei</w:p>']);
  });

  it('does not mistake a longer name for the requested one', () => {
    // `pPr`, `proofErr`, `pict` all begin with `p`; only `p` is a paragraph.
    const xml = '<w:pPr><w:jc w:val="center"/></w:pPr><w:p>Text</w:p><w:proofErr w:type="spellStart"/><w:pict/>';
    expect(blocks(xml, 'p')).toEqual(['<w:p>Text</w:p>']);
    expect(removeBlocks(xml, 'p')).toBe('<w:pPr><w:jc w:val="center"/></w:pPr><w:proofErr w:type="spellStart"/><w:pict/>');
  });

  it('accepts any namespace prefix', () => {
    const xml = '<w:tbl>a</w:tbl><w14:tbl>b</w14:tbl>';
    expect(blocks(xml, 'tbl')).toEqual(['<w:tbl>a</w:tbl>', '<w14:tbl>b</w14:tbl>']);
  });

  it('keeps attributes on the opening tag', () => {
    const xml = '<w:tbl><w:tblPr><w:tblW w:w="5000"/></w:tblPr><w:tr/></w:tbl>';
    expect(blocks(xml, 'tbl')).toEqual([xml]);
  });

  it('skips an unclosed element instead of swallowing the rest of the document', () => {
    const xml = '<w:tbl><w:tr><w:p><w:r><w:t>Text</w:t></w:r></w:p>';
    // Nothing is removed and the text stays reachable.
    expect(removeBlocks(xml, 'tbl')).toBe(xml);
    expect(blocks(xml, 'tbl')).toEqual([]);
  });

  it('returns the input unchanged when the name does not occur', () => {
    const xml = '<w:body><w:p>x</w:p></w:body>';
    expect(removeBlocks(xml, 'tbl')).toBe(xml);
    expect(blocks(xml, 'tbl')).toEqual([]);
  });

  it('keeps ordinary, unnested documents byte-identical in structure', () => {
    const xml = '<w:body><w:p>a</w:p><w:tbl><w:tr/></w:tbl><w:p>b</w:p></w:body>';
    expect(blocks(xml, 'p')).toEqual(['<w:p>a</w:p>', '<w:p>b</w:p>']);
    expect(removeBlocks(xml, 'p')).toBe('<w:body><w:tbl><w:tr/></w:tbl></w:body>');
  });

  it('still refuses an absurd element count', () => {
    const many = '<w:p/>'.repeat(100_001);
    expect(() => blocks(many, 'p')).toThrow(/element count exceeds limit/u);
  });
});
