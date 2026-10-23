import { describe, expect, it } from 'vitest';
import { parseRtfDocument } from '../../../../writer/interchange/import/rtfTokenizer';

describe('W-185 — \\bin bytes are skipped, never read as text', () => {
  it('does not let binary bytes reach the text', () => {
    // `\bin5` is followed by five raw bytes, then the paragraph continues.
    const rtf = '{\\rtf1\\ansi\\pard\\ql Vor \\bin5 \u0001\u0002\u0003\u0004\u0005 nach\\par}';
    const parsed = parseRtfDocument(rtf);
    const text = parsed[0]!.runs.map((run) => run.text).join('');
    expect(text).toBe('Vor  nach');
    // No control character survived into the document.
    expect(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text)).toBe(false);
  });

  it('skips exactly the declared count, so the following text is intact', () => {
    const rtf = '{\\rtf1\\ansi\\pard\\ql A\\bin3 xyzB\\par}';
    expect(parseRtfDocument(rtf)[0]!.runs.map((run) => run.text).join('')).toBe('AB');
  });

  it('survives a hostile count instead of walking off the end', () => {
    expect(() => parseRtfDocument('{\\rtf1\\ansi\\pard\\ql A\\bin999999999 x\\par}')).not.toThrow();
    const parsed = parseRtfDocument('{\\rtf1\\ansi\\pard\\ql A\\bin999999999 x\\par}');
    expect(parsed[0]!.runs.map((run) => run.text).join('')).toBe('A');
  });

  it('treats a missing or zero count as nothing to skip', () => {
    // The space after a control word is the RTF **delimiter**, not text — so `\bin B` is `AB`, exactly as
    // `\b B` would be. My first expectation here was `'A B'`; the code was right and the test was wrong.
    expect(parseRtfDocument('{\\rtf1\\ansi\\pard\\ql A\\bin B\\par}')[0]!.runs.map((r) => r.text).join('')).toBe('AB');
    expect(parseRtfDocument('{\\rtf1\\ansi\\pard\\ql A\\bin0 B\\par}')[0]!.runs.map((r) => r.text).join('')).toBe('AB');
    // And with an explicit delimiter that is not consumed, the space survives as text.
    expect(parseRtfDocument('{\\rtf1\\ansi\\pard\\ql A\\bin  B\\par}')[0]!.runs.map((r) => r.text).join('')).toBe('A B');
  });

  it('leaves an ordinary document untouched', () => {
    expect(parseRtfDocument('{\\rtf1\\ansi\\pard\\ql Hallo Welt\\par}')[0]!.runs.map((r) => r.text).join('')).toBe('Hallo Welt');
  });
});
