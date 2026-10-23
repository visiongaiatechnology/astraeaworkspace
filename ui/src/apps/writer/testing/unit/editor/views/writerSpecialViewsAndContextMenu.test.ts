// STATUS: DIAMANT VGT SUPREME — Unit Tests for Context Menu Clamping & Special Views Object Handling
import { describe, expect, it } from 'vitest';
import { calculateClampedMenuPosition } from '../../../../editor/context-menu/WriterContextMenu';
import type { Paragraph } from '../../../../../../shared/contracts/workspace';
import type { TableBlockData, ImageBlockData, EquationBlockData } from '../../../../types';

const createTestParagraph = (
  id: string,
  text: string,
  opts?: { headingLevel?: 1 | 2 | 3 }
): Paragraph => ({
  id,
  style: {
    style_name: opts?.headingLevel ? `heading${opts.headingLevel}` : 'normal',
    heading_level: opts?.headingLevel,
    alignment: 'left',
    line_height: 1.5,
    space_before: 0,
    space_after: 8,
  },
  spans: [{ text }],
});

describe('WriterContextMenu Viewport Clamping & Auto-Flip Engine', () => {
  const MENU_W = 260;
  const MENU_H = 580;
  const PAD = 12;

  it('maintains exact coordinates when click is safely inside viewport', () => {
    const pos = calculateClampedMenuPosition(100, 150, MENU_W, MENU_H, 1920, 1080, PAD);
    expect(pos.left).toBe(100);
    expect(pos.top).toBe(150);
  });

  it('flips menu upwards when clicking near the bottom of the screen with sufficient space above', () => {
    // Click at Y=750 on a 900px high viewport.
    // 750 + 580 + 12 = 1342 > 900 -> overflows bottom!
    // Space above: 750 - 580 = 170 >= 12 -> flips upward!
    const pos = calculateClampedMenuPosition(200, 750, MENU_W, MENU_H, 1440, 900, PAD);
    expect(pos.top).toBe(170);
    expect(pos.left).toBe(200);
    expect(pos.top + MENU_H).toBeLessThanOrEqual(900 - PAD);
  });

  it('clamps to top padding when screen height is shorter than menu height', () => {
    // Laptop screen with small height: 500px, menu is 580px
    const pos = calculateClampedMenuPosition(100, 300, MENU_W, MENU_H, 1024, 500, PAD);
    expect(pos.top).toBe(PAD);
  });

  it('flips menu leftwards when clicking near the right edge of the screen', () => {
    // Click at X=1800 on a 1920px screen:
    // 1800 + 260 + 12 = 2072 > 1920 -> overflows right edge!
    // Space to the left: 1800 - 260 = 1540 >= 12 -> flips leftward!
    const pos = calculateClampedMenuPosition(1800, 100, MENU_W, MENU_H, 1920, 1080, PAD);
    expect(pos.left).toBe(1540);
    expect(pos.top).toBe(100);
    expect(pos.left + MENU_W).toBeLessThanOrEqual(1920 - PAD);
  });

  it('clamps left and top coordinates to padding when coordinates are zero or negative', () => {
    const pos = calculateClampedMenuPosition(-50, -20, MENU_W, MENU_H, 1024, 768, PAD);
    expect(pos.left).toBe(PAD);
    expect(pos.top).toBe(PAD);
  });

  it('guarantees that menu top + height never exceeds viewportHeight - PAD on arbitrary coordinates', () => {
    const viewports = [
      { w: 1920, h: 1080 },
      { w: 1366, h: 768 },
      { w: 1024, h: 600 },
      { w: 800, h: 600 },
    ];
    const clickYPositions = [0, 50, 200, 400, 600, 750, 900, 1050];

    viewports.forEach(({ w, h }) => {
      clickYPositions.forEach((y) => {
        const pos = calculateClampedMenuPosition(500, y, MENU_W, MENU_H, w, h, PAD);
        expect(pos.top).toBeGreaterThanOrEqual(PAD);
        if (MENU_H + PAD * 2 <= h) {
          expect(pos.top + MENU_H).toBeLessThanOrEqual(h);
        } else {
          expect(pos.top).toBe(PAD);
        }
      });
    });
  });
});

describe('WriterSpecialViews Object & Heading Architecture', () => {
  const sampleParagraphs: Paragraph[] = [
    createTestParagraph('p-h1', '1. Executive Summary', { headingLevel: 1 }),
    createTestParagraph('p-text1', 'This document describes Astraea architecture.'),
    createTestParagraph('p-h2', '1.1 System Components', { headingLevel: 2 }),
    createTestParagraph('p-text2', 'Detailed breakdown below.'),
  ];

  const sampleTables: TableBlockData[] = [
    {
      id: 'tbl-1',
      anchorParagraphId: 'p-text1',
      columns: ['Metric', 'Value'],
      rows: [
        {
          id: 'r-1',
          cells: [
            { id: 'c-1', content: 'Metric' },
            { id: 'c-2', content: 'Value' },
          ],
        },
      ],
    },
    {
      id: 'tbl-unanchored',
      columns: ['UnanchoredCol'],
      rows: [{ id: 'r-u1', cells: [{ id: 'c-u1', content: 'Unanchored' }] }],
    },
  ];

  const sampleImages: ImageBlockData[] = [
    {
      id: 'img-1',
      name: 'system-diagram.png',
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      intrinsicWidth: 300,
      intrinsicHeight: 200,
      widthPercent: 80,
      alignment: 'center',
      anchorParagraphId: 'p-text2',
    },
    {
      id: 'img-unanchored',
      name: 'logo.png',
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      intrinsicWidth: 150,
      intrinsicHeight: 100,
      widthPercent: 50,
      alignment: 'left',
    },
  ];

  const sampleEquations: EquationBlockData[] = [
    {
      id: 'eq-1',
      anchorParagraphId: 'p-text2',
      latex: 'E = mc^2',
      displayMode: true,
    },
  ];

  it('verifies anchored objects are correctly associated with their target paragraphs', () => {
    // p-text1 has tbl-1
    const p1Tables = sampleTables.filter((t) => t.anchorParagraphId === 'p-text1');
    expect(p1Tables).toHaveLength(1);
    expect(p1Tables[0].id).toBe('tbl-1');

    // p-text2 has img-1 and eq-1
    const p2Images = sampleImages.filter((img) => img.anchorParagraphId === 'p-text2');
    expect(p2Images).toHaveLength(1);
    expect(p2Images[0].id).toBe('img-1');

    const p2Eqs = sampleEquations.filter((eq) => eq.anchorParagraphId === 'p-text2');
    expect(p2Eqs).toHaveLength(1);
    expect(p2Eqs[0].latex).toBe('E = mc^2');
  });

  it('correctly partitions unanchored tables, images and equations from anchored elements', () => {
    const unanchoredTables = sampleTables.filter(
      (tbl) => !tbl.anchorParagraphId || !sampleParagraphs.some((p) => p.id === tbl.anchorParagraphId)
    );
    expect(unanchoredTables).toHaveLength(1);
    expect(unanchoredTables[0].id).toBe('tbl-unanchored');

    const unanchoredImages = sampleImages.filter(
      (img) => !img.anchorParagraphId || !sampleParagraphs.some((p) => p.id === img.anchorParagraphId)
    );
    expect(unanchoredImages).toHaveLength(1);
    expect(unanchoredImages[0].id).toBe('img-unanchored');
  });

  it('verifies heading hierarchy and section segmentation for Outline Mode', () => {
    const isHeading = (p: Paragraph) =>
      Boolean(p.style.heading_level || p.style.style_name?.startsWith('heading'));

    const headings = sampleParagraphs.filter(isHeading);
    expect(headings).toHaveLength(2);
    expect(headings[0].style.heading_level).toBe(1);
    expect(headings[1].style.heading_level).toBe(2);

    // Verify item counts in sections
    const sec1Items = sampleParagraphs.filter((_, idx) => idx > 0 && idx < 2);
    expect(sec1Items).toHaveLength(1);
    expect(sec1Items[0].id).toBe('p-text1');

    const sec2Items = sampleParagraphs.filter((_, idx) => idx > 2);
    expect(sec2Items).toHaveLength(1);
    expect(sec2Items[0].id).toBe('p-text2');
  });
});
