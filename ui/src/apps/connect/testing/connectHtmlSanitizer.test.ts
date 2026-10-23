// STATUS: PLATIN — BATCH-CONNECT-3 tests: the HTML mail surface must fail closed on hostile markup.
//
// Every case in `MEASURED BYPASSES` was executed against the previous regex implementation in
// `domain/connectMailCore.ts:264` and survived it verbatim. They are the counter-check for the
// allowlist rewrite, so this file doubles as the regression record for the defect.
import { describe, expect, it } from 'vitest';
import {
  classifyMailUrl,
  decodeHtmlEntities,
  escapeHtmlAttribute,
  escapeHtmlText,
  normalizeForSchemeCheck,
  sanitizeMailHtmlDetailed,
  ConnectHtmlError,
} from '../domain/connectHtmlSanitizer';
import { sanitizeHtmlMail } from '../domain/connectMailCore';

const MEASURED_BYPASSES: ReadonlyArray<{ readonly payload: string; readonly forbidden: RegExp; readonly why: string }> = [
  { payload: '<svg/onload=alert(1)>', forbidden: /onload/i, why: 'on-handler without whitespace after the tag name' },
  { payload: '<a href="javas\tcript:alert(1)">x</a>', forbidden: /javascript/i, why: 'tab inside the scheme' },
  { payload: '<a href="java&#115;cript:alert(1)">x</a>', forbidden: /javascript/i, why: 'entity-encoded scheme' },
  { payload: '<img src=x onerror=alert(1)>', forbidden: /onerror/i, why: 'inline event handler' },
  { payload: '<div style="background:url(javascript:alert(1))">x</div>', forbidden: /javascript/i, why: 'CSS url() payload' },
  { payload: '<style>@import url(https://evil.test/a.css)</style><p>hi</p>', forbidden: /@import/i, why: 'CSS import of a remote sheet' },
  { payload: '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>', forbidden: /onerror/i, why: 'parser-confusion chain' },
  { payload: '<iframe src="https://evil.test"></iframe>', forbidden: /<iframe/i, why: 'frame element' },
  { payload: '<form action="https://evil.test"><input name="p"></form>', forbidden: /<form/i, why: 'form/credential phishing surface' },
  { payload: '<object data="x"></object><embed src="y">', forbidden: /<object|<embed/i, why: 'plugin elements' },
  { payload: '<a href="vbscript:msgbox(1)">x</a>', forbidden: /vbscript/i, why: 'vbscript scheme' },
  { payload: '<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>', forbidden: /data:text\/html/i, why: 'data: HTML document' },
  { payload: '<a href="  javascript:alert(1)">x</a>', forbidden: /javascript/i, why: 'leading whitespace in the scheme' },
  { payload: '<a href="JaVaScRiPt:alert(1)">x</a>', forbidden: /javascript/i, why: 'mixed case scheme' },
  { payload: '<a href="&#106;avascript:alert(1)">x</a>', forbidden: /javascript/i, why: 'entity-encoded first letter' },
  { payload: '<script>fetch("https://evil.test")</script>', forbidden: /script|fetch/i, why: 'script element' },
  { payload: '<body onload=alert(1)>', forbidden: /onload/i, why: 'handler on a dropped element' },
  { payload: '<base href="https://evil.test/">', forbidden: /<base/i, why: 'base-uri hijack' },
];

describe('Connect HTML sanitiser: the measured bypasses are gone', () => {
  it.each(MEASURED_BYPASSES)('removes the payload: $why', ({ payload, forbidden }) => {
    const outcome = sanitizeMailHtmlDetailed(payload, { collectIndicators: true });
    expect(outcome.html).not.toMatch(forbidden);
    expect(outcome.hadDangerousContent).toBe(true);
    // The wrapper used by the mail engine yields the same safe markup.
    expect(sanitizeHtmlMail(payload)).not.toMatch(forbidden);
  });

  it('keeps plain text readable instead of dropping the whole message', () => {
    const outcome = sanitizeMailHtmlDetailed('<p>Hello <b>Team</b>, the review is at 14:00.</p>');
    expect(outcome.html).toBe('<p>Hello <b>Team</b>, the review is at 14:00.</p>');
    expect(outcome.hadDangerousContent).toBe(false);
    expect(outcome.removedTags).toEqual([]);
  });

  it('reports what it removed, so a UI can explain the change', () => {
    const outcome = sanitizeMailHtmlDetailed('<p onclick="x()">hi</p><iframe src="https://evil.test"></iframe><blink>y</blink>');
    expect(outcome.removedAttributes).toContain('on*');
    expect(outcome.removedTags).toEqual(expect.arrayContaining(['iframe', 'blink']));
    expect(outcome.html).toContain('<p>hi</p>');
  });

  it('drops a hostile tag together with its raw text content', () => {
    const outcome = sanitizeMailHtmlDetailed('<style>p { color: red } .x{background:url(javascript:1)}</style><p class="x">ok</p>');
    expect(outcome.html).not.toContain('color: red');
    expect(outcome.html).toContain('<p>ok</p>');
  });

  it('closes elements the hostile input left open, so surrounding UI markup cannot be captured', () => {
    expect(sanitizeMailHtmlDetailed('<div><b>unterminated').html).toBe('<div><b>unterminated</b></div>');
  });
});

describe('Connect HTML sanitiser: remote content is blocked by default', () => {
  it('rewrites remote images, links and protocol-relative references', () => {
    const outcome = sanitizeMailHtmlDetailed('<img src="https://cdn.test/a.png"><a href="//tracker.test/x">t</a><a href="https://tracker.test/y?utm_source=x">u</a>', { collectIndicators: true });
    expect(outcome.html).toContain('src="#remote-content-blocked"');
    expect(outcome.html).toContain('href="#remote-content-blocked"');
    expect(outcome.blockedRemoteContent).toBe(3);
    expect(outcome.html).not.toContain('cdn.test');
    expect(outcome.indicators.some((indicator) => indicator.kind === 'remote-tracker')).toBe(true);
  });

  it('allows the same references only under an explicit grant', () => {
    const outcome = sanitizeMailHtmlDetailed('<img src="https://cdn.test/a.png">', { allowRemote: true });
    expect(outcome.html).toContain('https://cdn.test/a.png');
    expect(outcome.blockedRemoteContent).toBe(0);
  });

  it('keeps cid: and relative references (they do not leave the message)', () => {
    const outcome = sanitizeMailHtmlDetailed('<img src="cid:logo"><a href="#section">jump</a><img src="images/local.png">');
    expect(outcome.html).toContain('src="cid:logo"');
    expect(outcome.html).toContain('href="#section"');
    expect(outcome.html).toContain('src="images/local.png"');
    expect(outcome.blockedRemoteContent).toBe(0);
  });
});

describe('Connect HTML sanitiser: bounds and helpers', () => {
  it('rejects an oversized body instead of truncating it silently', () => {
    expect(() => sanitizeMailHtmlDetailed('x'.repeat(200), { maxChars: 100 })).toThrowError(expect.objectContaining({ code: 'html-size' }));
    expect(() => sanitizeMailHtmlDetailed('x'.repeat(200), { maxChars: 100 })).toThrowError(ConnectHtmlError);
  });

  it('rejects deeply nested markup instead of recursing without a bound', () => {
    expect(() => sanitizeMailHtmlDetailed('<div>'.repeat(200))).toThrowError(expect.objectContaining({ code: 'html-depth-limit' }));
  });

  it('decodes entities and normalises obfuscated schemes deterministically', () => {
    expect(decodeHtmlEntities('java&#115;cript:')).toBe('javascript:');
    expect(decodeHtmlEntities('&#x6a;avascript:')).toBe('javascript:');
    expect(decodeHtmlEntities('&amp;lt;')).toBe('&lt;');
    expect(decodeHtmlEntities('&unknownentity;')).toBe('&unknownentity;');
    expect(normalizeForSchemeCheck('jAvA\tScRiPt:')).toBe('javascript:');
  });

  it('classifies URLs fail-closed', () => {
    expect(classifyMailUrl('https://example.test/docs')).toMatchObject({ verdict: 'safe', displayHost: 'example.test' });
    expect(classifyMailUrl('javascript:alert(1)').verdict).toBe('unsafe-scheme');
    expect(classifyMailUrl('data:text/html,<b>').verdict).toBe('unsafe-scheme');
    expect(classifyMailUrl('https://x.test/p?utm_medium=mail').verdict).toBe('remote-blocked');
    expect(classifyMailUrl('//x.test/a').verdict).toBe('remote-blocked');
    expect(classifyMailUrl('/local/path').verdict).toBe('safe');
    expect(classifyMailUrl('cid:part1').verdict).toBe('safe');
    expect(classifyMailUrl('https://[bad').verdict).toBe('malformed');
  });

  it('escapes text and attribute values so a value cannot break out of its context', () => {
    expect(escapeHtmlText('<img src=x onerror=y>')).toBe('&lt;img src=x onerror=y&gt;');
    expect(escapeHtmlAttribute('" onmouseover="x')).not.toContain('"');
    expect(escapeHtmlAttribute("' onmouseover='x")).not.toContain("'");
  });

  it('drops a stray closing tag (opened nowhere) and records the removal', () => {
    const outcome = sanitizeMailHtmlDetailed('</div><p>ok</p>');
    // A closing tag with no matching open is parser-state confusion, so it is dropped rather than
    // emitted where it could close an element of the surrounding UI.
    expect(outcome.html).toBe('<p>ok</p>');
    expect(outcome.removedTags).toContain('div');
  });
});

describe('Connect HTML sanitiser: no second sanitizer path', () => {
  it('is the only implementation the mail engine uses', () => {
    const outcome = sanitizeMailHtmlDetailed('<a href="javascript:1">x</a>');
    expect(sanitizeHtmlMail('<a href="javascript:1">x</a>')).toBe(outcome.html);
  });
});
