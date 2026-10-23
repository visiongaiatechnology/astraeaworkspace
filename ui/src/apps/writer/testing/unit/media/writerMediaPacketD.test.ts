// STATUS: DIAMANT VGT SUPREME — Vitest Suite for Packet D: Bilder, Medien, Vektoren & Formeln
import { describe, it, expect } from 'vitest';
import type {
  WriterImageBlockData,
  WriterShapeBlockData,
} from '../../../../../shared/contracts/workspace';
import {
  resolveImageFilters,
  resolveImageTransforms,
  resolveMediaWrapStyles,
  resolveWriterImagePageAnchor,
  isWriterImageFixedToPage,
  applyWriterImagePlacementPatch,
  updateWriterImagePlacement,
  resolveFigureCaption,
  generateTableOfFigures,
} from '../../../media/images/operations/writerMediaOperations';
import {
  createWriterShape,
  updateWriterShape,
  bringShapeToFront,
  sendShapeToBack,
  bringShapeForward,
  sendShapeBackward,
  groupWriterShapes,
  ungroupWriterShapes,
  generateShapeSvgPath,
} from '../../../media/objects/shapes/writerShapeOperations';
import { estimateAnchoredMediaHeightPx } from '../../../layout/pagination/measurement/writerPaginationMeasurement';
import {
  latexToMathML,
  renderLatexTypographicHtml,
  EQUATION_SYMBOL_PALETTES,
} from '../../../editor/blocks/equations/writerEquationEngine';

describe('Paket D: Medien, Vektoren, Formeln & Bildverarbeitung', () => {
  const sampleImg: WriterImageBlockData = {
    id: 'img-1',
    name: 'test.png',
    dataUrl: 'data:image/png;base64,AAA',
    intrinsicWidth: 800,
    intrinsicHeight: 600,
    widthPercent: 60,
    alignment: 'center',
  };

  // Point 1: Text Wrap Modes & Distances
  describe('L101: Text Wrap Modes', () => {
    it('generates correct CSS wrap styles for inline, square, top-bottom, behind and in-front', () => {
      const inline = resolveMediaWrapStyles({ ...sampleImg, wrapMode: 'inline' });
      expect(inline.containerStyle.display).toBe('inline-block');

      const square = resolveMediaWrapStyles({
        ...sampleImg,
        wrapMode: 'square',
        wrapDistanceTopMm: 4,
        wrapDistanceRightMm: 6,
      });
      expect(square.containerStyle.float).toBe('left');
      expect(square.containerStyle.marginTop).toBe('4mm');
      expect(square.containerStyle.marginRight).toBe('6mm');

      const topBottom = resolveMediaWrapStyles({ ...sampleImg, wrapMode: 'top-bottom' });
      expect(topBottom.containerStyle.display).toBe('block');
      expect(topBottom.containerStyle.clear).toBe('both');

      const behind = resolveMediaWrapStyles({ ...sampleImg, wrapMode: 'behind-text' });
      expect(behind.containerStyle.position).toBe('absolute');
      expect(behind.containerStyle.zIndex).toBe(0);

      const inFront = resolveMediaWrapStyles({ ...sampleImg, wrapMode: 'in-front-of-text' });
      expect(inFront.containerStyle.zIndex).toBe(20);
    });
  });

  // Point 2: Positioning & Relative Anchoring
  describe('L102/L103: Positionierung & Verankerung', () => {
    it('resolves offset positioning and text attachment flags', () => {
      const anchoredImg: WriterImageBlockData = {
        ...sampleImg,
        id: 'img-anchored',
        anchorTarget: 'page',
        moveWithText: false,
        fixPositionOnPage: true,
        horizontalOffsetMm: 15,
        verticalOffsetMm: 25,
      };

      const wrap = resolveMediaWrapStyles(anchoredImg);
      expect(wrap.containerStyle.position).toBe('absolute');
      expect(wrap.containerStyle.left).toBe('15mm');
      expect(wrap.containerStyle.top).toBe('25mm');
      expect(isWriterImageFixedToPage(anchoredImg)).toBe(true);
    });

    it('resolves margin and column origins against canonical page geometry', () => {
      const geometry = {
        widthPx: 800, heightPx: 1100, bodyWidthPx: 600, bodyHeightPx: 900,
        columnWidthPx: 290, columnCount: 2, columnGapPx: 20, columnWidthsPx: [290, 290],
        marginsPx: { top: 80, bottom: 120, left: 100, right: 100 },
      };
      const margin = resolveWriterImagePageAnchor({
        ...sampleImg, anchorTarget: 'margin', fixPositionOnPage: true,
        horizontalOffsetMm: 5, verticalOffsetMm: 7,
      }, geometry);
      expect(margin?.left).toBe('calc(100px + 5mm)');
      expect(margin?.top).toBe('calc(80px + 7mm)');

      const column = resolveWriterImagePageAnchor({
        ...sampleImg, anchorTarget: 'column', anchorColumnIndex: 2, fixPositionOnPage: true,
        horizontalOffsetMm: 3, verticalOffsetMm: 4,
      }, geometry);
      expect(column?.left).toBe('calc(410px + 3mm)');
      expect(column?.top).toBe('calc(80px + 4mm)');
    });

    it('keeps paragraph-anchored objects in flow but fixes page targets', () => {
      expect(isWriterImageFixedToPage({ ...sampleImg, anchorTarget: 'paragraph', moveWithText: true })).toBe(false);
      expect(isWriterImageFixedToPage({ ...sampleImg, anchorTarget: 'paragraph', moveWithText: false })).toBe(true);
      expect(isWriterImageFixedToPage({ ...sampleImg, anchorTarget: 'page', moveWithText: true })).toBe(true);
    });

    it('captures the physical page when switching an image to fixed placement', () => {
      const pages = [
        { pageIndex: 1, isFirst: true, paragraphs: [{ id: 'p-a', spans: [], style: {} }] },
        { pageIndex: 2, isFirst: false, paragraphs: [{ id: 'p-b', spans: [], style: {} }] },
      ];
      const fixed = applyWriterImagePlacementPatch(
        { ...sampleImg, anchorParagraphId: 'p-b', anchorTarget: 'paragraph', moveWithText: true },
        { anchorTarget: 'page', moveWithText: false, fixPositionOnPage: true },
        pages,
      );
      expect(fixed.anchorPageIndex).toBe(2);
      const flowing = applyWriterImagePlacementPatch(fixed, { anchorTarget: 'paragraph', moveWithText: true, fixPositionOnPage: false }, pages);
      expect(flowing.anchorPageIndex).toBeUndefined();
      const collection = updateWriterImagePlacement([fixed], fixed.id, { horizontalOffsetMm: 42 }, pages);
      expect(collection[0]?.horizontalOffsetMm).toBe(42);
      expect(collection[0]?.anchorPageIndex).toBe(2);
    });

    it('removes page-fixed images from pagination flow height', () => {
      const geometry = {
        widthPx: 800, heightPx: 1100, bodyWidthPx: 600, bodyHeightPx: 900,
        columnWidthPx: 600, columnCount: 1, columnGapPx: 0, columnWidthsPx: [600],
        marginsPx: { top: 80, bottom: 120, left: 100, right: 100 },
      };
      const flowing = estimateAnchoredMediaHeightPx('p-1', geometry, {
        tables: [], equations: [], footnotes: [], images: [{ ...sampleImg, anchorParagraphId: 'p-1', anchorTarget: 'paragraph', moveWithText: true }],
      });
      const fixed = estimateAnchoredMediaHeightPx('p-1', geometry, {
        tables: [], equations: [], footnotes: [], images: [{ ...sampleImg, anchorParagraphId: 'p-1', anchorTarget: 'page', anchorPageIndex: 1, fixPositionOnPage: true }],
      });
      expect(flowing).toBeGreaterThan(0);
      expect(fixed).toBe(0);
    });
  });

  // Point 3: Transformations (Crop, Rotation, Flip, Opacity)
  describe('L99: Transformationen & Zuschneiden', () => {
    it('resolves rotation, flip and opacity in transform styles', () => {
      const styles = resolveImageTransforms(
        undefined,
        45,
        true,
        false,
        0.85,
      );

      expect(styles.transform).toContain('rotate(45deg)');
      expect(styles.transform).toContain('scaleX(-1)');
      expect(styles.opacity).toBe(0.85);
    });

    it('generates non-destructive clip-path for crop parameters', () => {
      const crop = { topPercent: 10, rightPercent: 15, bottomPercent: 5, leftPercent: 20 };
      const styles = resolveImageTransforms(crop);
      expect(styles.clipPath).toBe('inset(10% 15% 5% 20%)');
    });
  });

  // Point 4: Bildkorrekturen (Non-Destructive Adjustments)
  describe('L100: Bildkorrekturen (Helligkeit, Kontrast, etc.)', () => {
    it('resolves CSS filter pipeline with non-destructive modifications', () => {
      const adjustments = {
        brightness: 20,
        contrast: -10,
        saturation: 30,
        grayscale: true,
        sepia: false,
        invert: false,
      };

      const filterStr = resolveImageFilters(adjustments);
      expect(filterStr).toContain('brightness(120%)');
      expect(filterStr).toContain('contrast(90%)');
      expect(filterStr).toContain('saturate(130%)');
      expect(filterStr).toContain('grayscale(100%)');
    });

    it('returns "none" when no adjustments are configured', () => {
      expect(resolveImageFilters(undefined)).toBe('none');
    });
  });

  // Point 5: Vektorobjekte & Shapes CRUD + SVG Paths
  describe('L105: Vektorobjekte & Shapes', () => {
    it('creates all 7 shape kinds with standard geometry defaults', () => {
      const kinds = [
        'line',
        'rectangle',
        'rounded-rectangle',
        'ellipse',
        'arrow',
        'callout',
        'textbox',
      ] as const;

      for (const kind of kinds) {
        const shape = createWriterShape(kind, { xMm: 10, yMm: 15, widthMm: 40, heightMm: 25 });
        expect(shape.shapeKind).toBe(kind);
        expect(shape.xMm).toBe(10);
        expect(shape.yMm).toBe(15);
        expect(shape.id).toBeDefined();

        const { path } = generateShapeSvgPath(shape, 100, 60);
        expect(path.length).toBeGreaterThan(0);
      }
    });

    it('updates shape properties cleanly without mutation', () => {
      const initial = createWriterShape('rectangle', { widthMm: 50, heightMm: 30 });
      const updated = updateWriterShape(initial, {
        widthMm: 80,
        fillColor: '#3b82f6',
        text: 'Infobox',
      });

      expect(updated.widthMm).toBe(80);
      expect(updated.fillColor).toBe('#3b82f6');
      expect(updated.text).toBe('Infobox');
      expect(initial.widthMm).toBe(50);
    });
  });

  // Point 6: Shape Grouping & Z-Index Layering
  describe('L105: Layering (Z-Index) & Gruppierung', () => {
    it('modifies z-index through bringToFront, sendToBack, bringForward, sendBackward', () => {
      const s1: WriterShapeBlockData = { ...createWriterShape('rectangle'), id: 's1', zIndex: 1 };
      const s2: WriterShapeBlockData = { ...createWriterShape('ellipse'), id: 's2', zIndex: 2 };
      const s3: WriterShapeBlockData = { ...createWriterShape('line'), id: 's3', zIndex: 3 };

      const shapes = [s1, s2, s3];

      const front = bringShapeToFront(shapes, 's1');
      expect(front.find((s) => s.id === 's1')?.zIndex).toBe(4);

      const back = sendShapeToBack(shapes, 's3');
      expect(back.find((s) => s.id === 's3')?.zIndex).toBe(0);

      const forward = bringShapeForward(shapes, 's1');
      expect(forward.find((s) => s.id === 's1')?.zIndex).toBe(2);

      const backward = sendShapeBackward(shapes, 's3');
      expect(backward.find((s) => s.id === 's3')?.zIndex).toBe(2);
    });

    it('groups multiple shapes under common group_id and ungroups cleanly', () => {
      const s1 = createWriterShape('rectangle');
      const s2 = createWriterShape('arrow');
      const shapes = [s1, s2];

      const grouped = groupWriterShapes(shapes, [s1.id, s2.id], () => 'grp_test');
      expect(grouped.every((s) => s.groupId === 'grp_test')).toBe(true);

      const ungrouped = ungroupWriterShapes(grouped, 'grp_test');
      expect(ungrouped.every((s) => s.groupId === undefined)).toBe(true);
    });
  });

  // Point 7 & 8: Scientific Equations (LaTeX -> MathML & Typographic Render)
  describe('L107: Wissenschaftliche Formeln & Gleichungen', () => {
    it('converts LaTeX to MathML syntax', () => {
      const latex = '\\frac{a}{b} = c^2 + \\sqrt{x}';
      const mathml = latexToMathML(latex);

      expect(mathml).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">');
      expect(mathml).toContain('<mfrac>');
      expect(mathml).toContain('<msup>');
      expect(mathml).toContain('<msqrt>');
    });

    it('renders native typographic HTML without external CDN dependencies', () => {
      const latex = '\\int_{0}^{\\infty} e^{-x} dx = 1';
      const html = renderLatexTypographicHtml(latex);

      expect(html).toContain('font-serif');
      expect(html).toContain('∫');
      expect(html).toContain('∞');
    });

    it('provides comprehensive equation symbol palettes', () => {
      const greeks = EQUATION_SYMBOL_PALETTES.filter((s) => s.category === 'greek');
      const operators = EQUATION_SYMBOL_PALETTES.filter((s) => s.category === 'operator');
      const calculus = EQUATION_SYMBOL_PALETTES.filter((s) => s.category === 'calculus');
      const structures = EQUATION_SYMBOL_PALETTES.filter((s) => s.category === 'structure');

      expect(greeks.length).toBeGreaterThan(10);
      expect(operators.length).toBeGreaterThanOrEqual(4);
      expect(calculus.length).toBeGreaterThan(3);
      expect(structures.length).toBeGreaterThan(3);
    });
  });

  // Point 9 & 10: Figure Captions & Table of Figures
  describe('L104: Abbildungsbeschriftung & Abbildungsverzeichnis', () => {
    it('resolves figure caption numbering and position', () => {
      const img: WriterImageBlockData = {
        ...sampleImg,
        id: 'img-fig-1',
        caption: 'Architekturübersicht des VGT Kernels',
        captionPosition: 'below',
      };

      const caption = resolveFigureCaption(img, 1);
      expect(caption).toBe('Abbildung 1: Architekturübersicht des VGT Kernels');
    });

    it('generates Table of Figures items with page numbers', () => {
      const images: WriterImageBlockData[] = [
        {
          ...sampleImg,
          id: 'fig-1',
          name: 'Architektur',
          caption: 'Systemarchitektur',
          anchorParagraphId: 'p-10',
        },
        {
          ...sampleImg,
          id: 'fig-2',
          name: 'Diagramm',
          caption: 'Datenflussdiagramm',
          anchorParagraphId: 'p-20',
        },
      ];

      const mockPages = [
        {
          id: 'page-1',
          pageIndex: 1,
          displayPageNumber: 1,
          paragraphs: [{ id: 'p-10', spans: [{ text: 'Abschnitt 1' }] }],
        },
        {
          id: 'page-2',
          pageIndex: 2,
          displayPageNumber: 2,
          paragraphs: [{ id: 'p-20', spans: [{ text: 'Abschnitt 2' }] }],
        },
      ] as any;

      const tofItems = generateTableOfFigures(images, mockPages);
      expect(tofItems.length).toBe(2);

      expect(tofItems[0].label).toBe('Abbildung 1');
      expect(tofItems[0].caption).toBe('Systemarchitektur');
      expect(tofItems[0].pageNumber).toBe(1);

      expect(tofItems[1].label).toBe('Abbildung 2');
      expect(tofItems[1].caption).toBe('Datenflussdiagramm');
      expect(tofItems[1].pageNumber).toBe(2);
    });
  });

  // Point 11: Edge cases & Graceful Degradation
  describe('Robustness & Security Gate Checks', () => {
    it('handles empty or malformed latex gracefully without crashing', () => {
      const emptyMathML = latexToMathML('');
      expect(emptyMathML).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML"');

      const emptyHtml = renderLatexTypographicHtml('');
      expect(emptyHtml).toContain('Leere Gleichung');
    });

    it('clamps crop percentages safely', () => {
      const overCrop = { topPercent: -10, rightPercent: 120, bottomPercent: 0, leftPercent: 50 };
      const styles = resolveImageTransforms(overCrop);
      expect(styles.clipPath).toBe('inset(0% 100% 0% 50%)');
    });
  });
});
