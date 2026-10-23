// BATCH-PRESENT — hyperlinks (Paket 28) and accessible reading order / alt text / contrast (Paket 29).
import { describe, expect, it } from 'vitest';
import {
  presentLinkSummary,
  presentObjectLink,
  resolvePresentLinkActivation,
  validatePresentLinkTarget,
  withPresentObjectLink,
} from '../../canvas/model/presentHyperlinks';
import {
  PRESENT_MAX_ALT_TEXT_LENGTH,
  PRESENT_MAX_LINK_URL_LENGTH,
  readPresentAltText,
  withPresentAltText,
} from '../../canvas/model/presentObjectExtensions';
import {
  auditPresentAltText,
  auditPresentContrast,
  buildPresentReadingOrder,
  parsePresentColor,
  presentContrastRatio,
  presentRelativeLuminance,
} from '../../canvas/model/presentAccessibility';

describe('hyperlink targets (Paket 28)', () => {
  it('accepts an internal slide, a document and a plain HTTP(S) URL', () => {
    expect(validatePresentLinkTarget({ kind: 'slide', slideId: 's2' }, { slideIds: ['s1', 's2'] })).toMatchObject({ ok: true });
    expect(validatePresentLinkTarget({ kind: 'document', documentId: 'doc-9' })).toMatchObject({ ok: true, message: 'Link to document doc-9.' });
    expect(validatePresentLinkTarget({ kind: 'url', url: 'https://example.com/a' })).toMatchObject({ ok: true, message: 'Link to example.com.' });
  });

  it('refuses an unknown slide, an empty target and an unknown kind', () => {
    expect(validatePresentLinkTarget({ kind: 'slide', slideId: 'ghost' }, { slideIds: ['s1'] })).toMatchObject({ ok: false, reason: 'unknown-slide' });
    expect(validatePresentLinkTarget({ kind: 'slide', slideId: '  ' })).toMatchObject({ ok: false, reason: 'empty-slide' });
    expect(validatePresentLinkTarget(null)).toMatchObject({ ok: false, reason: 'unknown-kind' });
    expect(validatePresentLinkTarget({ kind: 'mailto', url: 'a@b.c' } as never)).toMatchObject({ ok: false, reason: 'unknown-kind' });
  });

  it('refuses non-HTTP schemes, credentials and an over-long URL', () => {
    expect(validatePresentLinkTarget({ kind: 'url', url: 'javascript:alert(1)' })).toMatchObject({ ok: false, reason: 'unsupported-scheme' });
    expect(validatePresentLinkTarget({ kind: 'url', url: 'file:///etc/passwd' })).toMatchObject({ ok: false, reason: 'unsupported-scheme' });
    expect(validatePresentLinkTarget({ kind: 'url', url: 'https://user:pass@example.com/x' })).toMatchObject({ ok: false, reason: 'credentials-in-url' });
    expect(validatePresentLinkTarget({ kind: 'url', url: `https://example.com/${'a'.repeat(PRESENT_MAX_LINK_URL_LENGTH)}` })).toMatchObject({ ok: false, reason: 'url-too-long' });
  });

  it('never navigates while editing, and resolves each kind while presenting', () => {
    const editing = resolvePresentLinkActivation({ kind: 'slide', slideId: 's1' }, { presenting: false, slideIds: ['s1'] });
    expect(editing).toMatchObject({ action: 'reject' });
    expect(editing.action === 'reject' ? editing.message : '').toContain('while presenting');
    expect(resolvePresentLinkActivation({ kind: 'slide', slideId: 's1' }, { presenting: true, slideIds: ['s1'] })).toMatchObject({ action: 'navigate-slide', slideId: 's1' });
    expect(resolvePresentLinkActivation({ kind: 'url', url: 'https://example.com' }, { presenting: true })).toMatchObject({ action: 'open-url' });
    expect(resolvePresentLinkActivation({ kind: 'document', documentId: 'd1' }, { presenting: true })).toMatchObject({ action: 'open-document', documentId: 'd1' });
    expect(resolvePresentLinkActivation({ kind: 'url', url: 'ftp://x/y' }, { presenting: true })).toMatchObject({ action: 'reject', reason: 'unsupported-scheme' });
  });

  it('stores only a validated link and reads an invalid stored one as none', () => {
    const withLink = withPresentObjectLink({ id: 'a' }, { kind: 'url', url: 'https://example.com' });
    expect(presentObjectLink(withLink)).toMatchObject({ kind: 'url', url: 'https://example.com/' });
    const refused = withPresentObjectLink({ id: 'a' }, { kind: 'url', url: 'javascript:alert(1)' });
    expect(presentObjectLink(refused)).toBeNull();
    expect(presentObjectLink({ id: 'a', link: { kind: 'url', url: 'javascript:alert(1)' } })).toBeNull();
  });

  it('summarises a link for the badge without leaking the full URL', () => {
    expect(presentLinkSummary(null)).toBe('No link');
    expect(presentLinkSummary({ kind: 'url', url: 'https://cdn.example.com/a/b/c?q=1' })).toBe('URL · cdn.example.com');
    expect(presentLinkSummary({ kind: 'slide', slideId: 's3' }, new Map([['s3', 2]]))).toBe('Slide 3');
    expect(presentLinkSummary({ kind: 'document', documentId: 'doc-7' })).toBe('Document doc-7');
  });
});

describe('accessible reading order and alt text (Paket 29)', () => {
  type OrderObject = Parameters<typeof buildPresentReadingOrder>[0][number];
  const object = (id: string, patch: Partial<OrderObject> = {}): OrderObject => ({ id, kind: 'shape', zIndex: 1, ...patch });

  it('announces back-to-front by layer position and skips hidden objects', () => {
    const order = buildPresentReadingOrder([
      object('top', { zIndex: 3 }),
      object('bottom', { zIndex: 1 }),
      object('middle', { zIndex: 2 }),
      object('gone', { zIndex: 4, hidden: true }),
    ]);
    expect(order.map((entry) => entry.id)).toEqual(['bottom', 'middle', 'top']);
    expect(order.map((entry) => entry.position)).toEqual([1, 2, 3]);
  });

  it('never produces an empty label and marks links', () => {
    const order = buildPresentReadingOrder([
      { id: 'img', kind: 'image', zIndex: 1, altText: 'Revenue chart' },
      { id: 'shape', kind: 'shape', zIndex: 2 },
      { id: 'link', kind: 'shape', zIndex: 3, link: { kind: 'url', url: 'https://example.com' } },
    ]);
    expect(order[0].label).toBe('Revenue chart');
    expect(order[0].hasAltText).toBe(true);
    expect(order[1].label.length).toBeGreaterThan(0);
    expect(order[2].isLink).toBe(true);
  });

  it('reports which objects still need an alternative text', () => {
    const report = auditPresentAltText([
      { id: 'img', kind: 'image' },
      { id: 'chart', kind: 'chart' },
      { id: 'shape', kind: 'shape' },
      { id: 'decor', kind: 'shape' },
      { id: 'img2', kind: 'image', altText: 'described' },
      { id: 'hidden', kind: 'image', hidden: true },
    ]);
    expect(report.total).toBe(5);
    expect(report.withAltText).toBe(1);
    expect(report.missing.map((entry) => entry.id)).toEqual(['img', 'chart']);
    expect(report.decorative).toEqual(['shape', 'decor']);
  });

  it('bounds alt text both ways', () => {
    const stored = withPresentAltText({ id: 'a' }, 'x'.repeat(PRESENT_MAX_ALT_TEXT_LENGTH + 500)) as { altText?: string };
    expect((stored.altText ?? '').length).toBe(PRESENT_MAX_ALT_TEXT_LENGTH);
    expect(readPresentAltText({ altText: '   ' })).toBe('');
    expect(withPresentAltText({ id: 'a', altText: 'old' }, '')).toEqual({ id: 'a' });
  });
});

describe('contrast (Paket 29)', () => {
  it('computes the WCAG contrast ratio for known pairs', () => {
    expect(presentContrastRatio('#000000', '#ffffff')).toBe(21);
    expect(presentContrastRatio('#ffffff', '#ffffff')).toBe(1);
    expect(presentContrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
    expect(parsePresentColor('#abc')).toEqual({ r: 170, g: 187, b: 204 });
    expect(parsePresentColor('rgb(1,2,3)')).toBeNull();
    expect(presentRelativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
  });

  it('requires 4.5:1 for normal text and 3:1 for large text', () => {
    const findings = auditPresentContrast(
      [
        { id: 'small', kind: 'text', color: '#777777', fontSizePt: 14 },
        { id: 'large', kind: 'text', color: '#777777', fontSizePt: 24 },
        { id: 'invisible', kind: 'text', color: 'not-a-colour', fontSizePt: 14 },
        { id: 'shape', kind: 'shape' },
      ] as never,
      '#ffffff',
    );
    expect(findings).toHaveLength(3);
    expect(findings.find((finding) => finding.objectId === 'small')).toMatchObject({ required: 4.5, passes: false });
    expect(findings.find((finding) => finding.objectId === 'large')).toMatchObject({ required: 3, passes: true });
    // An unparseable colour is a finding, never a silent pass.
    expect(findings.find((finding) => finding.objectId === 'invisible')).toMatchObject({ ratio: null, passes: false });
    expect(findings.find((finding) => finding.objectId === 'invisible')?.message).toContain('could not be checked');
  });

  it('uses the object background when it has one', () => {
    const findings = auditPresentContrast(
      [{ id: 't', kind: 'text', color: '#000000', fontSizePt: 14, backgroundColor: '#000000' }] as never,
      '#ffffff',
    );
    expect(findings[0].ratio).toBe(1);
    expect(findings[0].passes).toBe(false);
  });
});
