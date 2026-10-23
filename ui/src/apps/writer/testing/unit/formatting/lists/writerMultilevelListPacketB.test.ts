// STATUS: DIAMANT VGT SUPREME — Exhaustive Verification Suite for Paket B: Listen & Nummerierungen
import { describe, it, expect } from 'vitest';
import type { Paragraph } from '../../../../../../shared/contracts/workspace';
import type { WriterListTemplate } from '../../../../../../shared/contracts/writer/workspaceWriterList';
import {
  BUILTIN_LIST_TEMPLATES,
  formatOrdinalNumber,
  resolveWriterListBulletGlyph,
  calculateMultilevelListOrdinal,
  calculateHeadingOutlineNumber,
  resolveWriterListLevelGeometry,
  formatPageNumber,
} from '../../../../formatting/lists/writerMultilevelList';

function makeParagraph(
  id: string,
  text: string,
  style: Partial<Paragraph['style']> = {}
): Paragraph {
  return {
    id,
    spans: [{ text }],
    style: {
      alignment: 'left',
      line_height: 1.5,
      space_before: 0,
      space_after: 8,
      ...style,
    },
  };
}

describe('Paket B: Listen & Nummerierungen — 6 Punkte vollständige Abnahme', () => {
  // --------------------------------------------------------------------------
  // Punkt 1: Listentypen (Bullets, Zahlen, Buchstaben, römische Ziffern, Glyphen)
  // --------------------------------------------------------------------------
  describe('Punkt 1: Listentypen & Formate', () => {
    it('formatiert arabische Zahlen, führende Nullen, Buchstaben und römische Ziffern', () => {
      expect(formatOrdinalNumber(1, 'arabic')).toBe('1');
      expect(formatOrdinalNumber(42, 'arabic')).toBe('42');

      expect(formatOrdinalNumber(1, 'leading_zero')).toBe('01');
      expect(formatOrdinalNumber(9, 'leading_zero')).toBe('09');
      expect(formatOrdinalNumber(10, 'leading_zero')).toBe('10');

      expect(formatOrdinalNumber(1, 'alpha_lower')).toBe('a');
      expect(formatOrdinalNumber(2, 'alpha_lower')).toBe('b');
      expect(formatOrdinalNumber(26, 'alpha_lower')).toBe('z');
      expect(formatOrdinalNumber(27, 'alpha_lower')).toBe('aa');

      expect(formatOrdinalNumber(1, 'alpha_upper')).toBe('A');
      expect(formatOrdinalNumber(3, 'alpha_upper')).toBe('C');
      expect(formatOrdinalNumber(26, 'alpha_upper')).toBe('Z');
      expect(formatOrdinalNumber(27, 'alpha_upper')).toBe('AA');

      expect(formatOrdinalNumber(1, 'roman_lower')).toBe('i');
      expect(formatOrdinalNumber(4, 'roman_lower')).toBe('iv');
      expect(formatOrdinalNumber(9, 'roman_lower')).toBe('ix');
      expect(formatOrdinalNumber(14, 'roman_lower')).toBe('xiv');

      expect(formatOrdinalNumber(1, 'roman_upper')).toBe('I');
      expect(formatOrdinalNumber(4, 'roman_upper')).toBe('IV');
      expect(formatOrdinalNumber(10, 'roman_upper')).toBe('X');
      expect(formatOrdinalNumber(50, 'roman_upper')).toBe('L');
    });

    it('formatiert typografische Bullet-Typen und benutzerdefinierte Glyphen', () => {
      expect(formatOrdinalNumber(1, 'bullet_disc')).toBe('•');
      expect(formatOrdinalNumber(1, 'bullet_circle')).toBe('◦');
      expect(formatOrdinalNumber(1, 'bullet_square')).toBe('▪');
      expect(formatOrdinalNumber(1, 'bullet_arrow')).toBe('‣');
      expect(formatOrdinalNumber(1, 'bullet_check')).toBe('✓');
      expect(formatOrdinalNumber(1, 'bullet_diamond')).toBe('◆');
    });

    it('löst Bullet-Glyphen mit benutzerdefiniertem Override und Tiered-Fallback auf', () => {
      const pWithOverride = makeParagraph('p1', 'Custom Item', {
        list_style: 'bullet',
        list_override_glyph: '✦',
      });
      expect(resolveWriterListBulletGlyph(pWithOverride, 0)).toBe('✦');

      const pTieredL0 = makeParagraph('p2', 'L0 Item', { list_style: 'bullet', list_level: 0 });
      const pTieredL1 = makeParagraph('p3', 'L1 Item', { list_style: 'bullet', list_level: 1 });
      const pTieredL2 = makeParagraph('p4', 'L2 Item', { list_style: 'bullet', list_level: 2 });
      const pTieredL4 = makeParagraph('p5', 'L4 Item', { list_style: 'bullet', list_level: 4 });

      expect(resolveWriterListBulletGlyph(pTieredL0, 0)).toBe('•');
      expect(resolveWriterListBulletGlyph(pTieredL1, 1)).toBe('◦');
      expect(resolveWriterListBulletGlyph(pTieredL2, 2)).toBe('▪');
      expect(resolveWriterListBulletGlyph(pTieredL4, 4)).toBe('‣');
    });
  });

  // --------------------------------------------------------------------------
  // Punkt 2: Mehrstufige Listen bis zu 9 Ebenen (0–8)
  // --------------------------------------------------------------------------
  describe('Punkt 2: Mehrstufige Listen bis 9 Ebenen (0–8)', () => {
    it('generiert korrekte hierarchische Ordinale über alle 9 Ebenen (DIN/ISO)', () => {
      const paragraphs: Paragraph[] = [
        makeParagraph('p0', 'Root 1', { list_style: 'number', list_level: 0 }),
        makeParagraph('p1', 'Sub 1.1', { list_style: 'number', list_level: 1 }),
        makeParagraph('p2', 'Sub 1.1.1', { list_style: 'number', list_level: 2 }),
        makeParagraph('p3', 'Sub 1.1.1.1', { list_style: 'number', list_level: 3 }),
        makeParagraph('p4', 'Sub 1.1.1.1.1', { list_style: 'number', list_level: 4 }),
        makeParagraph('p5', 'Sub 1.1.1.1.1.1', { list_style: 'number', list_level: 5 }),
        makeParagraph('p6', 'Sub 1.1.1.1.1.1.1', { list_style: 'number', list_level: 6 }),
        makeParagraph('p7', 'Sub 1.1.1.1.1.1.1.1', { list_style: 'number', list_level: 7 }),
        makeParagraph('p8', 'Sub 1.1.1.1.1.1.1.1.1', { list_style: 'number', list_level: 8 }),
      ];

      expect(calculateMultilevelListOrdinal(paragraphs, 0)).toBe('1.');
      expect(calculateMultilevelListOrdinal(paragraphs, 1)).toBe('1.1.');
      expect(calculateMultilevelListOrdinal(paragraphs, 2)).toBe('1.1.1.');
      expect(calculateMultilevelListOrdinal(paragraphs, 3)).toBe('1.1.1.1.');
      expect(calculateMultilevelListOrdinal(paragraphs, 4)).toBe('1.1.1.1.1.');
      expect(calculateMultilevelListOrdinal(paragraphs, 5)).toBe('1.1.1.1.1.1.');
      expect(calculateMultilevelListOrdinal(paragraphs, 6)).toBe('1.1.1.1.1.1.1.');
      expect(calculateMultilevelListOrdinal(paragraphs, 7)).toBe('1.1.1.1.1.1.1.1.');
      expect(calculateMultilevelListOrdinal(paragraphs, 8)).toBe('1.1.1.1.1.1.1.1.1.');
    });

    it('begrenzt ungültige Ebenenwerte deterministisch auf 0 bis 8', () => {
      const paragraphs: Paragraph[] = [
        makeParagraph('p0', 'Clamped negative', { list_style: 'number', list_level: -5 }),
        makeParagraph('p1', 'Clamped excessive', { list_style: 'number', list_level: 99 }),
      ];
      expect(calculateMultilevelListOrdinal(paragraphs, 0)).toBe('1.');
      // Level 99 is clamped to 8, which becomes subordinate to level 0 (1.1.1.1.1.1.1.1.1.)
      expect(calculateMultilevelListOrdinal(paragraphs, 1)).toBe('1.1.1.1.1.1.1.1.1.');
    });
  });

  // --------------------------------------------------------------------------
  // Punkt 3: Nummerierungslogik (Fortsetzen, Neu starten, Startwert, List-ID)
  // --------------------------------------------------------------------------
  describe('Punkt 3: Nummerierungslogik (Fortsetzen, Restart, Startwert, Scoping)', () => {
    it('führt Zähler auf gleicher Ebene fort und setzt untergeordnete Ebenen bei höherer Ebene zurück', () => {
      const paragraphs: Paragraph[] = [
        makeParagraph('p0', 'First', { list_style: 'number', list_level: 0 }),
        makeParagraph('p1', 'Sub 1.1', { list_style: 'number', list_level: 1 }),
        makeParagraph('p2', 'Sub 1.2', { list_style: 'number', list_level: 1 }),
        makeParagraph('p3', 'Second', { list_style: 'number', list_level: 0 }),
        makeParagraph('p4', 'Sub 2.1', { list_style: 'number', list_level: 1 }),
      ];

      expect(calculateMultilevelListOrdinal(paragraphs, 0)).toBe('1.');
      expect(calculateMultilevelListOrdinal(paragraphs, 1)).toBe('1.1.');
      expect(calculateMultilevelListOrdinal(paragraphs, 2)).toBe('1.2.');
      expect(calculateMultilevelListOrdinal(paragraphs, 3)).toBe('2.');
      expect(calculateMultilevelListOrdinal(paragraphs, 4)).toBe('2.1.');
    });

    it('unterstützt beliebigen Startwert (list_start_value)', () => {
      const paragraphs: Paragraph[] = [
        makeParagraph('p0', 'Item 10', { list_style: 'number', list_level: 0, list_start_value: 10 }),
        makeParagraph('p1', 'Item 11', { list_style: 'number', list_level: 0 }),
        makeParagraph('p2', 'Sub 11.5', { list_style: 'number', list_level: 1, list_start_value: 5 }),
        makeParagraph('p3', 'Sub 11.6', { list_style: 'number', list_level: 1 }),
      ];

      expect(calculateMultilevelListOrdinal(paragraphs, 0)).toBe('10.');
      expect(calculateMultilevelListOrdinal(paragraphs, 1)).toBe('11.');
      expect(calculateMultilevelListOrdinal(paragraphs, 2)).toBe('11.5.');
      expect(calculateMultilevelListOrdinal(paragraphs, 3)).toBe('11.6.');
    });

    it('unterstützt expliziten Neustart (list_restart_numbering)', () => {
      const paragraphs: Paragraph[] = [
        makeParagraph('p0', 'Item 1', { list_style: 'number', list_level: 0 }),
        makeParagraph('p1', 'Item 2', { list_style: 'number', list_level: 0 }),
        makeParagraph('p2', 'Restarted at 1', { list_style: 'number', list_level: 0, list_restart_numbering: true }),
        makeParagraph('p3', 'Item 2 next', { list_style: 'number', list_level: 0 }),
      ];

      expect(calculateMultilevelListOrdinal(paragraphs, 0)).toBe('1.');
      expect(calculateMultilevelListOrdinal(paragraphs, 1)).toBe('2.');
      expect(calculateMultilevelListOrdinal(paragraphs, 2)).toBe('1.');
      expect(calculateMultilevelListOrdinal(paragraphs, 3)).toBe('2.');
    });

    it('isoliert Zählerfolgen über list_id Scoping', () => {
      const paragraphs: Paragraph[] = [
        makeParagraph('p0', 'List A Item 1', { list_style: 'number', list_level: 0, list_id: 'list_A' }),
        makeParagraph('p1', 'List B Item 1', { list_style: 'number', list_level: 0, list_id: 'list_B' }),
        makeParagraph('p2', 'List A Item 2', { list_style: 'number', list_level: 0, list_id: 'list_A' }),
        makeParagraph('p3', 'List B Item 2', { list_style: 'number', list_level: 0, list_id: 'list_B' }),
      ];

      expect(calculateMultilevelListOrdinal(paragraphs, 0)).toBe('1.');
      expect(calculateMultilevelListOrdinal(paragraphs, 1)).toBe('1.');
      expect(calculateMultilevelListOrdinal(paragraphs, 2)).toBe('2.');
      expect(calculateMultilevelListOrdinal(paragraphs, 3)).toBe('2.');
    });
  });

  // --------------------------------------------------------------------------
  // Punkt 4: Kapitelnummerierung (Heading-Verknüpfung)
  // --------------------------------------------------------------------------
  describe('Punkt 4: Kapitelnummerierung (Outline Headings)', () => {
    it('berechnet hierarchische Kapitelnummern für Headings 1–6', () => {
      const paragraphs: Paragraph[] = [
        makeParagraph('h1', 'Einleitung', { heading_level: 1, heading_outline_numbered: true }),
        makeParagraph('b1', 'Fließtext der Einleitung...'),
        makeParagraph('h2', 'Hintergrund', { heading_level: 2, heading_outline_numbered: true }),
        makeParagraph('h3', 'Historie', { heading_level: 3, heading_outline_numbered: true }),
        makeParagraph('h2b', 'Zielsetzung', { heading_level: 2, heading_outline_numbered: true }),
        makeParagraph('h1b', 'Hauptteil', { heading_level: 1, heading_outline_numbered: true }),
        makeParagraph('h2c', 'Methodik', { heading_level: 2, heading_outline_numbered: true }),
      ];

      expect(calculateHeadingOutlineNumber(paragraphs, 0)).toBe('1.');
      expect(calculateHeadingOutlineNumber(paragraphs, 1)).toBe(''); // kein Heading
      expect(calculateHeadingOutlineNumber(paragraphs, 2)).toBe('1.1.');
      expect(calculateHeadingOutlineNumber(paragraphs, 3)).toBe('1.1.1.');
      expect(calculateHeadingOutlineNumber(paragraphs, 4)).toBe('1.2.');
      expect(calculateHeadingOutlineNumber(paragraphs, 5)).toBe('2.');
      expect(calculateHeadingOutlineNumber(paragraphs, 6)).toBe('2.1.');
    });

    it('ignoriert Headings ohne aktive Kapitelnummerierung', () => {
      const paragraphs: Paragraph[] = [
        makeParagraph('h1', 'Standard Heading 1', { heading_level: 1 }),
        makeParagraph('h2', 'Standard Heading 2', { heading_level: 2 }),
      ];
      expect(calculateHeadingOutlineNumber(paragraphs, 0)).toBe('');
      expect(calculateHeadingOutlineNumber(paragraphs, 1)).toBe('');
    });
  });

  // --------------------------------------------------------------------------
  // Punkt 5: Eigene List Templates & Vorlagenkatalog
  // --------------------------------------------------------------------------
  describe('Punkt 5: List Templates & Vorlagenkatalog', () => {
    it('stellt alle 6 geforderten Standard-Vorlagen bereit', () => {
      expect(BUILTIN_LIST_TEMPLATES).toHaveLength(6);
      const ids = BUILTIN_LIST_TEMPLATES.map((t) => t.id);
      expect(ids).toContain('hierarchical_numeric');
      expect(ids).toContain('legal_document');
      expect(ids).toContain('harvard_outline');
      expect(ids).toContain('tiered_bullets');
      expect(ids).toContain('alpha_numeric');
      expect(ids).toContain('modern_tech');
    });

    it('formatiert juristische Dokumente nach der Legal-Vorlage (§ 1 > § 1.01 > (a))', () => {
      const legalTmpl = BUILTIN_LIST_TEMPLATES.find((t) => t.id === 'legal_document')!;
      const paragraphs: Paragraph[] = [
        makeParagraph('p0', 'Vertragsgegenstand', { list_style: 'number', list_level: 0 }),
        makeParagraph('p1', 'Leistungsumfang', { list_style: 'number', list_level: 1 }),
        makeParagraph('p2', 'Einzelpunkt A', { list_style: 'number', list_level: 2 }),
      ];

      expect(calculateMultilevelListOrdinal(paragraphs, 0, legalTmpl)).toBe('§ 1');
      expect(calculateMultilevelListOrdinal(paragraphs, 1, legalTmpl)).toBe('§ 1.01');
      expect(calculateMultilevelListOrdinal(paragraphs, 2, legalTmpl)).toBe('(a)');
    });

    it('formatiert Harvard Outline Vorlage (I. > A. > 1. > a.)', () => {
      const harvardTmpl = BUILTIN_LIST_TEMPLATES.find((t) => t.id === 'harvard_outline')!;
      const paragraphs: Paragraph[] = [
        makeParagraph('p0', 'Thesis Statement', { list_style: 'number', list_level: 0 }),
        makeParagraph('p1', 'Primary Argument', { list_style: 'number', list_level: 1 }),
        makeParagraph('p2', 'Supporting Evidence', { list_style: 'number', list_level: 2 }),
        makeParagraph('p3', 'Case Study', { list_style: 'number', list_level: 3 }),
      ];

      expect(calculateMultilevelListOrdinal(paragraphs, 0, harvardTmpl)).toBe('I.');
      expect(calculateMultilevelListOrdinal(paragraphs, 1, harvardTmpl)).toBe('A.');
      expect(calculateMultilevelListOrdinal(paragraphs, 2, harvardTmpl)).toBe('1.');
      expect(calculateMultilevelListOrdinal(paragraphs, 3, harvardTmpl)).toBe('a.');
    });

    it('unterstützt vollkommen freie benutzerdefinierte Vorlagen', () => {
      const customTmpl: WriterListTemplate = {
        id: 'custom_contract',
        name: 'Custom Contract',
        levels: [
          { level: 0, numberFormat: 'arabic', prefix: 'Artikel ', suffix: ':', pattern: 'Artikel %1:', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 10, hangingIndentMm: 5 },
          { level: 1, numberFormat: 'alpha_lower', prefix: '[', suffix: ']', pattern: '[%2]', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 20, hangingIndentMm: 5 },
        ],
      };

      const paragraphs: Paragraph[] = [
        makeParagraph('p0', 'Vertragsbeginn', { list_style: 'number', list_level: 0 }),
        makeParagraph('p1', 'Unterklausel', { list_style: 'number', list_level: 1 }),
      ];

      expect(calculateMultilevelListOrdinal(paragraphs, 0, customTmpl)).toBe('Artikel 1:');
      expect(calculateMultilevelListOrdinal(paragraphs, 1, customTmpl)).toBe('[a]');
    });
  });

  // --------------------------------------------------------------------------
  // Punkt 6: Ebenengeometrie (Einzug und Tabstopp pro Listenebene)
  // --------------------------------------------------------------------------
  describe('Punkt 6: Ebenengeometrie (Einzüge und Tabstopps pro Ebene)', () => {
    it('berechnet deterministische DIN / ISO Standard-Einzüge in 6.35 mm Schritten', () => {
      const geom0 = resolveWriterListLevelGeometry(0);
      expect(geom0.leftIndentMm).toBeCloseTo(6.35);
      expect(geom0.hangingIndentMm).toBeCloseTo(6.35);
      expect(geom0.tabStopMm).toBeCloseTo(6.35);

      const geom1 = resolveWriterListLevelGeometry(1);
      expect(geom1.leftIndentMm).toBeCloseTo(12.70);
      expect(geom1.hangingIndentMm).toBeCloseTo(6.35);

      const geom2 = resolveWriterListLevelGeometry(2);
      expect(geom2.leftIndentMm).toBeCloseTo(19.05);

      const geom8 = resolveWriterListLevelGeometry(8);
      expect(geom8.leftIndentMm).toBeCloseTo(57.15);
    });

    it('respektiert vorlageneigene Geometriewerte', () => {
      const customTmpl: WriterListTemplate = {
        id: 'geom_custom',
        name: 'Custom Geometry',
        levels: [
          { level: 0, numberFormat: 'arabic', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 15.0, hangingIndentMm: 8.0, tabStopMm: 15.0 },
          { level: 1, numberFormat: 'arabic', startAt: 1, restartOnHigherLevel: true, leftIndentMm: 30.0, hangingIndentMm: 10.0, tabStopMm: 30.0 },
        ],
      };

      const geom0 = resolveWriterListLevelGeometry(0, customTmpl);
      expect(geom0.leftIndentMm).toBe(15.0);
      expect(geom0.hangingIndentMm).toBe(8.0);
      expect(geom0.tabStopMm).toBe(15.0);

      const geom1 = resolveWriterListLevelGeometry(1, customTmpl);
      expect(geom1.leftIndentMm).toBe(30.0);
      expect(geom1.hangingIndentMm).toBe(10.0);
    });
  });

  // --------------------------------------------------------------------------
  // Seitennummerierungs-Formatierer (Rückwärtskompatibilität)
  // --------------------------------------------------------------------------
  describe('formatPageNumber Rückwärtskompatibilität', () => {
    it('formatiert Seitenzahlen wie erwartet', () => {
      expect(formatPageNumber(1, 'arabic')).toBe('1');
      expect(formatPageNumber(5, 'roman')).toBe('v');
      expect(formatPageNumber(3, 'alpha')).toBe('c');
    });
  });
});
