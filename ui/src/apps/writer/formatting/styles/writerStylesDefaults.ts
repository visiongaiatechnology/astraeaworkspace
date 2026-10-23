// STATUS: DIAMANT VGT SUPREME — Default Style Catalog & Document Themes
import type {
  WriterCharacterStyleDefinition,
  WriterLinkedStyleDefinition,
  WriterListStyleDefinition,
  WriterStyleCatalog,
  WriterStyleDefinition,
  WriterTableStyleDefinition,
  WriterTextEffect,
} from '../../../../shared/contracts/workspace';

export const DEFAULT_WRITER_STYLES: WriterStyleDefinition[] = [
  { name: 'normal', label: 'Normal', fontSizePt: 11, bold: false, lineHeight: 1.55, spaceBefore: 0, spaceAfter: 8, alignment: 'left' },
  { name: 'title', label: 'Title', fontSizePt: 26, bold: true, lineHeight: 1.2, spaceBefore: 0, spaceAfter: 14, alignment: 'left', basedOn: 'normal', nextStyle: 'subtitle' },
  { name: 'subtitle', label: 'Subtitle', fontSizePt: 14, bold: false, italic: true, textColor: '#64748b', lineHeight: 1.35, spaceBefore: 0, spaceAfter: 12, alignment: 'left', basedOn: 'normal', nextStyle: 'normal' },
  { name: 'heading1', label: 'Heading 1', fontSizePt: 20, bold: true, lineHeight: 1.25, spaceBefore: 14, spaceAfter: 8, alignment: 'left', basedOn: 'normal', nextStyle: 'normal' },
  { name: 'heading2', label: 'Heading 2', fontSizePt: 15, bold: true, lineHeight: 1.3, spaceBefore: 12, spaceAfter: 7, alignment: 'left', basedOn: 'normal', nextStyle: 'normal' },
  { name: 'heading3', label: 'Heading 3', fontSizePt: 13, bold: true, lineHeight: 1.35, spaceBefore: 10, spaceAfter: 6, alignment: 'left' },
  { name: 'heading4', label: 'Heading 4', fontSizePt: 12, bold: true, lineHeight: 1.4, spaceBefore: 9, spaceAfter: 5, alignment: 'left' },
  { name: 'heading5', label: 'Heading 5', fontSizePt: 11, bold: true, lineHeight: 1.4, spaceBefore: 8, spaceAfter: 4, alignment: 'left' },
  { name: 'heading6', label: 'Heading 6', fontSizePt: 11, bold: true, italic: true, lineHeight: 1.4, spaceBefore: 7, spaceAfter: 4, alignment: 'left' },
  { name: 'heading7', label: 'Heading 7', fontSizePt: 10, bold: true, lineHeight: 1.4, spaceBefore: 6, spaceAfter: 3, alignment: 'left' },
  { name: 'heading8', label: 'Heading 8', fontSizePt: 10, bold: false, italic: true, lineHeight: 1.4, spaceBefore: 5, spaceAfter: 3, alignment: 'left' },
  { name: 'heading9', label: 'Heading 9', fontSizePt: 9, bold: true, italic: true, lineHeight: 1.4, spaceBefore: 4, spaceAfter: 2, alignment: 'left' },
  { name: 'quote', label: 'Quote', fontSizePt: 11, bold: false, italic: true, textColor: '#475569', lineHeight: 1.55, spaceBefore: 8, spaceAfter: 10, alignment: 'left' },
  { name: 'caption', label: 'Caption', fontSizePt: 9, bold: false, italic: true, textColor: '#64748b', lineHeight: 1.35, spaceBefore: 4, spaceAfter: 8, alignment: 'center' },
  { name: 'toc1', label: 'TOC Level 1', fontSizePt: 11, bold: true, lineHeight: 1.35, spaceBefore: 3, spaceAfter: 2, alignment: 'left' },
  { name: 'toc2', label: 'TOC Level 2', fontSizePt: 10.5, bold: false, lineHeight: 1.35, spaceBefore: 1, spaceAfter: 1, alignment: 'left', firstLineIndentMm: 5 },
  { name: 'toc3', label: 'TOC Level 3', fontSizePt: 10, bold: false, lineHeight: 1.35, spaceBefore: 1, spaceAfter: 1, alignment: 'left', firstLineIndentMm: 10 },
  { name: 'toc4', label: 'TOC Level 4', fontSizePt: 10, bold: false, lineHeight: 1.35, spaceBefore: 1, spaceAfter: 1, alignment: 'left', firstLineIndentMm: 15 },
  { name: 'toc5', label: 'TOC Level 5', fontSizePt: 10, bold: false, lineHeight: 1.35, spaceBefore: 1, spaceAfter: 1, alignment: 'left', firstLineIndentMm: 20 },
  { name: 'toc6', label: 'TOC Level 6', fontSizePt: 9.5, bold: false, lineHeight: 1.35, spaceBefore: 1, spaceAfter: 1, alignment: 'left', firstLineIndentMm: 25 },
  { name: 'toc7', label: 'TOC Level 7', fontSizePt: 9.5, bold: false, lineHeight: 1.35, spaceBefore: 1, spaceAfter: 1, alignment: 'left', firstLineIndentMm: 30 },
  { name: 'toc8', label: 'TOC Level 8', fontSizePt: 9, bold: false, lineHeight: 1.35, spaceBefore: 1, spaceAfter: 1, alignment: 'left', firstLineIndentMm: 35 },
  { name: 'toc9', label: 'TOC Level 9', fontSizePt: 9, bold: false, lineHeight: 1.35, spaceBefore: 1, spaceAfter: 1, alignment: 'left', firstLineIndentMm: 40 },
];

export const DEFAULT_WRITER_CHARACTER_STYLES: WriterCharacterStyleDefinition[] = [
  { id: 'emphasis', label: 'Betonung', italic: true },
  { id: 'strong', label: 'Starke Betonung', bold: true },
  { id: 'code', label: 'Quelltext', fontFamily: 'JetBrains Mono, monospace', textColor: '#0f766e' },
];

export const DEFAULT_WRITER_LIST_STYLES: WriterListStyleDefinition[] = [
  { id: 'bullet-standard', label: 'Aufzählung', listStyle: 'bullet', leftIndentMm: 6.35, hangingIndentMm: 3.18 },
  { id: 'number-standard', label: 'Nummerierung', listStyle: 'number', leftIndentMm: 6.35, hangingIndentMm: 3.18 },
  { id: 'checklist-standard', label: 'Checkliste', listStyle: 'checklist', leftIndentMm: 6.35, hangingIndentMm: 3.18 },
];

export const DEFAULT_WRITER_TABLE_STYLES: WriterTableStyleDefinition[] = [
  { id: 'grid-neutral', label: 'Raster Neutral', headerBackground: '#1e293b', rowBackground: '#0f172a', alternateRowBackground: '#172033', borderColor: '#334155', textColor: '#e2e8f0' },
  { id: 'grid-accent', label: 'Raster Akzent', headerBackground: '#4338ca', rowBackground: '#111827', alternateRowBackground: '#1e1b4b', borderColor: '#6366f1', textColor: '#f8fafc' },
];

export const DEFAULT_WRITER_LINKED_STYLES: WriterLinkedStyleDefinition[] = [
  { id: 'title-accent', label: 'Titel + Akzent', paragraphStyleName: 'title', characterStyleId: 'strong' },
  { id: 'quote-emphasis', label: 'Zitat + Betonung', paragraphStyleName: 'quote', characterStyleId: 'emphasis' },
];

export const DEFAULT_WRITER_STYLE_CATALOG: WriterStyleCatalog = {
  paragraphStyles: DEFAULT_WRITER_STYLES,
  characterStyles: DEFAULT_WRITER_CHARACTER_STYLES,
  listStyles: DEFAULT_WRITER_LIST_STYLES,
  tableStyles: DEFAULT_WRITER_TABLE_STYLES,
  linkedStyles: DEFAULT_WRITER_LINKED_STYLES,
};

export interface DocumentTheme {
  id: string;
  name: string;
  primaryFont: string;
  headingFont: string;
  accentColor: string;
  textColor: string;
  headingEffect: WriterTextEffect;
}

export const WRITER_DOCUMENT_THEMES: DocumentTheme[] = [
  { id: 'modern-indigo', name: 'Modern Indigo', primaryFont: 'Inter, sans-serif', headingFont: 'Inter, sans-serif', accentColor: '#4f46e5', textColor: '#0f172a', headingEffect: 'subtle-shadow' },
  { id: 'executive-navy', name: 'Executive Navy', primaryFont: 'Calibri, sans-serif', headingFont: 'Times New Roman, serif', accentColor: '#1e3a8a', textColor: '#0f172a', headingEffect: 'none' },
  { id: 'emerald-forest', name: 'Emerald Forest', primaryFont: 'Roboto Serif, serif', headingFont: 'Roboto Serif, serif', accentColor: '#047857', textColor: '#064e3b', headingEffect: 'subtle-shadow' },
  { id: 'crimson-burgundy', name: 'Crimson Burgundy', primaryFont: 'Merriweather, serif', headingFont: 'Merriweather, serif', accentColor: '#991b1b', textColor: '#450a0a', headingEffect: 'strong-shadow' },
  { id: 'technical-mono', name: 'Technical Mono', primaryFont: 'JetBrains Mono, monospace', headingFont: 'JetBrains Mono, monospace', accentColor: '#0369a1', textColor: '#0c4a6e', headingEffect: 'none' },
];

export const WRITER_FONT_FAMILIES = [
  { label: 'Inter (Sans)', value: 'Inter, sans-serif' },
  { label: 'Merriweather (Serif)', value: 'Merriweather, serif' },
  { label: 'Roboto Serif (Serif)', value: 'Roboto Serif, serif' },
  { label: 'JetBrains Mono (Code)', value: 'JetBrains Mono, monospace' },
  { label: 'Calibri', value: 'Calibri, sans-serif' },
  { label: 'Times New Roman', value: 'Times New Roman, serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
];

export const THEME_PALETTES = WRITER_DOCUMENT_THEMES;
export const AVAILABLE_FONTS = WRITER_FONT_FAMILIES.map((f) => f.label);
