// STATUS: DIAMANT VGT SUPREME — ODT reading keeps layout and rich text
//
// Paket 37 acceptance: "Fremddatei öffnen, rich text ändern und wieder interoperabel
// exportieren" — with layout preserved.
//
// W-179: the previous reader stripped every tag from `<text:p|h>`:
//   const cleanText = inner.replace(/<[^>]+>/g, '').trim();
// so spans lost their styles, `<text:s text:c="3"/>` lost its spaces (it carries no text),
// tabs and line breaks vanished, every heading became `heading1`, and lists were not
// recognised. Re-exporting could not be interoperable: the information was gone.
import { describe, expect, it } from 'vitest';
import { importOdtXml } from '../../../interchange/import/writerImporter';
import { parseOdtContent } from '../../../interchange/import/odtContentReader';

const content = (body: string, automaticStyles = '') =>
  '<?xml version="1.0" encoding="UTF-8"?>'
  + '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"'
  + ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"'
  + ' xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"'
  + ' xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.3">'
  + `<office:automatic-styles>${automaticStyles}</office:automatic-styles>`
  + `<office:body><office:text>${body}</office:text></office:body></office:document-content>`;

const textStyle = (name: string, properties: string) =>
  `<style:style style:name="${name}" style:family="text"><style:text-properties ${properties}/></style:style>`;

describe('ODT reading keeps layout', () => {
  it('reads the real heading level instead of forcing level 1', () => {
    const parsed = parseOdtContent(content(
      '<text:h text:outline-level="1">Eins</text:h>'
      + '<text:h text:outline-level="3">Drei</text:h>',
    ));
    expect(parsed.map((p) => p.headingLevel)).toEqual([1, 3]);
    const imported = importOdtXml(content('<text:h text:outline-level="3">Drei</text:h>'));
    expect(imported.paragraphs[0]?.style.style_name).toBe('heading3');
    expect(imported.paragraphs[0]?.style.heading_level).toBe(3);
  });

  it('does not force a heading to be bold when its style says otherwise', () => {
    const imported = importOdtXml(content('<text:h text:outline-level="2">Kapitel</text:h>'));
    expect(imported.paragraphs[0]?.spans[0]?.bold).toBeUndefined();
  });

  it('keeps a run of spaces encoded as text:s', () => {
    // The tag carries no text, so stripping tags lost the spaces.
    const parsed = parseOdtContent(content('<text:p>A<text:s text:c="3"/>B<text:s/>C</text:p>'));
    expect(parsed[0]?.runs.map((r) => r.text).join('')).toBe('A   B C');
  });

  it('keeps tabs and line breaks', () => {
    const parsed = parseOdtContent(content('<text:p>A<text:tab/>B<text:line-break/>C</text:p>'));
    expect(parsed[0]?.runs.map((r) => r.text).join('')).toBe('A\tB\nC');
  });

  it('reads bold, italic and underline from the automatic styles', () => {
    const styles = textStyle('T1', 'fo:font-weight="bold"')
      + textStyle('T2', 'fo:font-style="italic"')
      + textStyle('T3', 'style:text-underline-style="solid"');
    const imported = importOdtXml(content(
      '<text:p><text:span text:style-name="T1">fett</text:span>'
      + '<text:span text:style-name="T2">kursiv</text:span>'
      + '<text:span text:style-name="T3">unterstrichen</text:span></text:p>',
      styles,
    ));
    expect(imported.paragraphs[0]?.spans.map((s) => ({
      text: s.text, bold: s.bold ?? false, italic: s.italic ?? false, underline: s.underline ?? false,
    }))).toEqual([
      { text: 'fett', bold: true, italic: false, underline: false },
      { text: 'kursiv', bold: false, italic: true, underline: false },
      { text: 'unterstrichen', bold: false, italic: false, underline: true },
    ]);
  });

  it('reads font size in several units and the colour', () => {
    const styles = textStyle('T1', 'fo:font-size="14pt"')
      + textStyle('T2', 'fo:font-size="1.5cm"')
      + textStyle('T3', 'fo:color="#FF0000"');
    const parsed = parseOdtContent(content(
      '<text:p><text:span text:style-name="T1">a</text:span>'
      + '<text:span text:style-name="T2">b</text:span>'
      + '<text:span text:style-name="T3">c</text:span></text:p>',
      styles,
    ));
    expect(parsed[0]?.runs.map((r) => r.font_size_pt)).toEqual([14, 42.52, undefined]);
    expect(parsed[0]?.runs[2]?.text_color).toBe('#ff0000');
  });

  it('reads the paragraph alignment from the paragraph style', () => {
    const styles = '<style:style style:name="P1" style:family="paragraph">'
      + '<style:paragraph-properties fo:text-align="center"/></style:style>';
    const parsed = parseOdtContent(content('<text:p text:style-name="P1">mittig</text:p>', styles));
    expect(parsed[0]?.alignment).toBe('center');
  });

  it('recognises a numbered list and a bullet list', () => {
    const styles = '<text:list-style style:name="LNum"><text:list-level-style-number text:level="1"/></text:list-style>'
      + '<text:list-style style:name="LBul"><text:list-level-style-bullet text:level="1"/></text:list-style>';
    const imported = importOdtXml(content(
      '<text:list text:style-name="LNum"><text:list-item><text:p>erster</text:p></text:list-item></text:list>'
      + '<text:list text:style-name="LBul"><text:list-item><text:p>punkt</text:p></text:list-item></text:list>',
      styles,
    ));
    expect(imported.paragraphs.map((p) => p.style.list_style)).toEqual(['number', 'bullet']);
  });

  it('does not mistake a nested list for a change of kind', () => {
    const styles = '<text:list-style style:name="LNum"><text:list-level-style-number text:level="1"/></text:list-style>';
    const parsed = parseOdtContent(content(
      '<text:list text:style-name="LNum"><text:list-item><text:p>aussen</text:p>'
      + '<text:list><text:list-item><text:p>innen</text:p></text:list-item></text:list>'
      + '</text:list-item></text:list>',
      styles,
    ));
    expect(parsed.map((p) => p.listStyle)).toEqual(['number', 'number']);
  });

  it('keeps the text of an unknown element instead of dropping it', () => {
    const parsed = parseOdtContent(content('<text:p>A<vendor:marke>B</vendor:marke>C</text:p>'));
    expect(parsed[0]?.runs.map((r) => r.text).join('')).toBe('ABC');
  });

  it('decodes the XML entities that appear in text', () => {
    const parsed = parseOdtContent(content('<text:p>a &amp; b &lt;c&gt; &quot;d&quot;</text:p>'));
    expect(parsed[0]?.runs.map((r) => r.text).join('')).toBe('a & b <c> "d"');
  });

  it('treats consecutive paragraphs as separate and keeps empty ones out of the way', () => {
    const parsed = parseOdtContent(content('<text:p>eins</text:p><text:p>zwei</text:p><text:p/>'));
    expect(parsed.map((p) => p.runs.map((r) => r.text).join(''))).toEqual(['eins', 'zwei', '']);
  });

  it('survives an unterminated document without throwing', () => {
    expect(() => parseOdtContent(content('<text:p>unvollstaendig'))).not.toThrow();
    expect(parseOdtContent(content('<text:p>unvollstaendig'))[0]?.runs.map((r) => r.text).join('')).toBe('unvollstaendig');
  });

  it('produces one empty paragraph for an empty document rather than nothing', () => {
    const imported = importOdtXml(content(''));
    expect(imported.paragraphs).toHaveLength(1);
    expect(imported.paragraphs[0]?.spans[0]?.text).toBe('');
  });
});
