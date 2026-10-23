// STATUS: DIAMANT VGT SUPREME — Bounded, validated Writer style-set persistence and interchange
import type {
  WriterParagraphStyleName,
  WriterStyleCatalog,
  WriterStyleDefinition,
  WriterStyleSet,
} from '../../../../shared/contracts/workspace';
import { ensureWriterStyleCatalog, writerStyleRelationshipWouldCycle } from './writerStyles';

export const WRITER_STYLE_SET_MAX_BYTES = 1_048_576;
const MAX_NAME_LENGTH = 80;
const MAX_ID_LENGTH = 128;
const ID_PATTERN = /^[A-Za-z0-9._-]+$/u;
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/u;
const PARAGRAPH_STYLE_NAMES = new Set<string>([
  'normal', 'title', 'subtitle', 'quote', 'caption',
  'heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6', 'heading7', 'heading8', 'heading9',
  'toc1', 'toc2', 'toc3', 'toc4', 'toc5', 'toc6', 'toc7', 'toc8', 'toc9',
]);

export class WriterStyleSetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WriterStyleSetValidationError';
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new WriterStyleSetValidationError(`${label} muss ein Objekt sein.`);
  }
  return value as Record<string, unknown>;
}

function boundedString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') throw new WriterStyleSetValidationError(`${label} muss Text sein.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new WriterStyleSetValidationError(`${label} muss 1 bis ${maxLength} Zeichen enthalten.`);
  }
  return normalized;
}

function boundedArray(value: unknown, label: string, maxLength: number): unknown[] {
  if (!Array.isArray(value) || value.length > maxLength) {
    throw new WriterStyleSetValidationError(`${label} darf höchstens ${maxLength} Einträge enthalten.`);
  }
  return value;
}

function finiteNumber(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new WriterStyleSetValidationError(`${label} liegt außerhalb des zulässigen Bereichs.`);
  }
  return value;
}

function optionalBoolean(value: unknown, label: string): void {
  if (value !== undefined && typeof value !== 'boolean') throw new WriterStyleSetValidationError(`${label} muss boolesch sein.`);
}

function optionalString(value: unknown, label: string, maxLength: number): void {
  if (value !== undefined) boundedString(value, label, maxLength);
}

function optionalNumber(value: unknown, label: string, minimum: number, maximum: number): void {
  if (value !== undefined) finiteNumber(value, label, minimum, maximum);
}

function validateColor(value: unknown, label: string, required = false): void {
  if (required && value === undefined) throw new WriterStyleSetValidationError(`${label} fehlt.`);
  if (value !== undefined && (typeof value !== 'string' || !HEX_COLOR_PATTERN.test(value))) {
    throw new WriterStyleSetValidationError(`${label} muss eine sechsstellige Hex-Farbe sein.`);
  }
}

function uniqueField(entries: readonly unknown[], field: string, label: string): void {
  const seen = new Set<string>();
  entries.forEach((entry, index) => {
    const value = boundedString(record(entry, `${label} ${index + 1}`)[field], `${label} ${index + 1}: ${field}`, MAX_ID_LENGTH);
    if (seen.has(value)) throw new WriterStyleSetValidationError(`${label}: ${field} „${value}“ ist doppelt.`);
    seen.add(value);
  });
}

function validateParagraphStyle(value: unknown, index: number): void {
  const label = `Absatzstil ${index + 1}`;
  const style = record(value, label);
  const name = boundedString(style.name, `${label}: Name`, 32);
  if (!PARAGRAPH_STYLE_NAMES.has(name)) throw new WriterStyleSetValidationError(`${label}: Name ist nicht unterstützt.`);
  boundedString(style.label, `${label}: Bezeichnung`, MAX_NAME_LENGTH);
  finiteNumber(style.fontSizePt, `${label}: Schriftgröße`, 1, 512);
  finiteNumber(style.lineHeight, `${label}: Zeilenabstand`, 0.5, 20);
  finiteNumber(style.spaceBefore, `${label}: Abstand davor`, 0, 1440);
  finiteNumber(style.spaceAfter, `${label}: Abstand danach`, 0, 1440);
  if (typeof style.bold !== 'boolean') throw new WriterStyleSetValidationError(`${label}: Fett muss boolesch sein.`);
  for (const key of ['italic', 'autoUpdate', 'keepWithNext', 'keepLinesTogether', 'widowOrphanControl', 'pageBreakBefore']) {
    optionalBoolean(style[key], `${label}: ${key}`);
  }
  optionalString(style.fontFamily, `${label}: Schriftfamilie`, 160);
  optionalString(style.basedOn, `${label}: Basis`, 32);
  optionalString(style.nextStyle, `${label}: Folgestil`, 32);
  optionalNumber(style.firstLineIndentMm, `${label}: Erstzeileneinzug`, -300, 300);
  optionalNumber(style.hangingIndentMm, `${label}: Hängender Einzug`, 0, 300);
  validateColor(style.textColor, `${label}: Textfarbe`);
  validateColor(style.backgroundColor, `${label}: Hintergrundfarbe`);
  if (style.alignment !== undefined && !['left', 'center', 'right', 'justify', 'distributed'].includes(style.alignment as string)) {
    throw new WriterStyleSetValidationError(`${label}: Ausrichtung ist ungültig.`);
  }
  if (style.textEffect !== undefined && !['none', 'subtle-shadow', 'strong-shadow'].includes(style.textEffect as string)) {
    throw new WriterStyleSetValidationError(`${label}: Texteffekt ist ungültig.`);
  }
  if (style.tabStops !== undefined) {
    boundedArray(style.tabStops, `${label}: Tabstopps`, 64).forEach((entry, tabIndex) => {
      const tab = record(entry, `${label}: Tabstopp ${tabIndex + 1}`);
      boundedString(tab.id, `${label}: Tabstopp-ID`, MAX_ID_LENGTH);
      finiteNumber(tab.positionMm, `${label}: Tabstoppposition`, 0, 1000);
      if (!['left', 'right', 'center', 'decimal'].includes(tab.alignment as string)) throw new WriterStyleSetValidationError(`${label}: Tabstoppausrichtung ist ungültig.`);
      if (!['none', 'dots', 'dashes', 'underline'].includes(tab.leader as string)) throw new WriterStyleSetValidationError(`${label}: Füllzeichen ist ungültig.`);
    });
  }
}

function validateCatalog(value: unknown): WriterStyleCatalog {
  const catalog = record(value, 'Style-Katalog');
  const paragraphStyles = boundedArray(catalog.paragraphStyles, 'Absatzstile', 128);
  const characterStyles = boundedArray(catalog.characterStyles, 'Zeichenstile', 256);
  const listStyles = boundedArray(catalog.listStyles, 'Listenstile', 64);
  const tableStyles = boundedArray(catalog.tableStyles, 'Tabellenstile', 64);
  const linkedStyles = boundedArray(catalog.linkedStyles, 'Verknüpfte Stile', 128);

  paragraphStyles.forEach(validateParagraphStyle);
  uniqueField(paragraphStyles, 'name', 'Absatzstil');
  for (const [label, entries] of [['Zeichenstil', characterStyles], ['Listenstil', listStyles], ['Tabellenstil', tableStyles], ['Verknüpfter Stil', linkedStyles]] as const) {
    uniqueField(entries, 'id', label);
    entries.forEach((entry, index) => boundedString(record(entry, `${label} ${index + 1}`).label, `${label} ${index + 1}: Bezeichnung`, MAX_NAME_LENGTH));
  }

  characterStyles.forEach((entry, index) => {
    const style = record(entry, `Zeichenstil ${index + 1}`);
    for (const key of ['bold', 'italic', 'underline', 'strikethrough']) optionalBoolean(style[key], `Zeichenstil ${index + 1}: ${key}`);
    optionalString(style.fontFamily, `Zeichenstil ${index + 1}: Schriftfamilie`, 160);
    optionalNumber(style.fontSizePt, `Zeichenstil ${index + 1}: Schriftgröße`, 1, 512);
    validateColor(style.textColor, `Zeichenstil ${index + 1}: Textfarbe`);
    validateColor(style.highlightColor, `Zeichenstil ${index + 1}: Hervorhebungsfarbe`);
  });
  listStyles.forEach((entry, index) => {
    const style = record(entry, `Listenstil ${index + 1}`);
    if (!['bullet', 'number', 'checklist'].includes(style.listStyle as string)) throw new WriterStyleSetValidationError(`Listenstil ${index + 1}: Typ ist ungültig.`);
    finiteNumber(style.leftIndentMm, `Listenstil ${index + 1}: Einzug`, 0, 300);
    finiteNumber(style.hangingIndentMm, `Listenstil ${index + 1}: Hängender Einzug`, 0, 300);
  });
  tableStyles.forEach((entry, index) => {
    const style = record(entry, `Tabellenstil ${index + 1}`);
    for (const key of ['headerBackground', 'rowBackground', 'alternateRowBackground', 'borderColor', 'textColor']) {
      validateColor(style[key], `Tabellenstil ${index + 1}: ${key}`, true);
    }
  });

  const normalized = ensureWriterStyleCatalog(catalog as unknown as WriterStyleCatalog);
  const paragraphNames = new Set(normalized.paragraphStyles.map((style) => style.name));
  const characterIds = new Set(normalized.characterStyles.map((style) => style.id));
  normalized.paragraphStyles.forEach((style) => {
    if (style.basedOn && !paragraphNames.has(style.basedOn as WriterParagraphStyleName)) throw new WriterStyleSetValidationError(`Absatzstil „${style.name}“ verweist auf eine unbekannte Basis.`);
    if (style.nextStyle && !paragraphNames.has(style.nextStyle as WriterParagraphStyleName)) throw new WriterStyleSetValidationError(`Absatzstil „${style.name}“ verweist auf einen unbekannten Folgestil.`);
    if (writerStyleRelationshipWouldCycle(normalized.paragraphStyles, style.name, style.basedOn)) throw new WriterStyleSetValidationError(`Absatzstil „${style.name}“ erzeugt einen Vererbungszyklus.`);
  });
  normalized.linkedStyles.forEach((style) => {
    if (!paragraphNames.has(style.paragraphStyleName) || !characterIds.has(style.characterStyleId)) {
      throw new WriterStyleSetValidationError(`Verknüpfter Stil „${style.id}“ enthält eine unbekannte Referenz.`);
    }
  });
  return normalized;
}

function cloneCatalog(catalog: WriterStyleCatalog): WriterStyleCatalog {
  return JSON.parse(JSON.stringify(catalog)) as WriterStyleCatalog;
}

export function createWriterStyleSet(name: string, catalog: WriterStyleCatalog, options: { id?: string; now?: number } = {}): WriterStyleSet {
  const normalizedName = boundedString(name, 'Style-Set-Name', MAX_NAME_LENGTH);
  const id = options.id ?? crypto.randomUUID();
  if (id.length > MAX_ID_LENGTH || !ID_PATTERN.test(id)) throw new WriterStyleSetValidationError('Style-Set-ID ist ungültig.');
  const now = options.now ?? Date.now();
  finiteNumber(now, 'Zeitstempel', 0, Number.MAX_SAFE_INTEGER);
  return { schemaVersion: 1, id, name: normalizedName, createdAt: now, updatedAt: now, catalog: cloneCatalog(validateCatalog(catalog)) };
}

export function serializeWriterStyleSet(styleSet: WriterStyleSet): string {
  return JSON.stringify(parseWriterStyleSetJson(JSON.stringify(styleSet)), null, 2);
}

export function parseWriterStyleSetJson(input: string): WriterStyleSet {
  if (new TextEncoder().encode(input).byteLength > WRITER_STYLE_SET_MAX_BYTES) throw new WriterStyleSetValidationError('Style-Set-Datei überschreitet 1 MiB.');
  let decoded: unknown;
  try {
    decoded = JSON.parse(input) as unknown;
  } catch {
    throw new WriterStyleSetValidationError('Style-Set-Datei enthält kein gültiges JSON.');
  }
  const source = record(decoded, 'Style-Set');
  if (source.schemaVersion !== 1) throw new WriterStyleSetValidationError('Nicht unterstützte Style-Set-Version.');
  const id = boundedString(source.id, 'Style-Set-ID', MAX_ID_LENGTH);
  if (!ID_PATTERN.test(id)) throw new WriterStyleSetValidationError('Style-Set-ID ist ungültig.');
  const name = boundedString(source.name, 'Style-Set-Name', MAX_NAME_LENGTH);
  const createdAt = finiteNumber(source.createdAt, 'Erstellzeit', 0, Number.MAX_SAFE_INTEGER);
  const updatedAt = finiteNumber(source.updatedAt, 'Änderungszeit', createdAt, Number.MAX_SAFE_INTEGER);
  return { schemaVersion: 1, id, name, createdAt, updatedAt, catalog: cloneCatalog(validateCatalog(source.catalog)) };
}

export function upsertWriterStyleSet(styleSets: readonly WriterStyleSet[], incoming: WriterStyleSet): WriterStyleSet[] {
  const validated = parseWriterStyleSetJson(JSON.stringify(incoming));
  return [...styleSets.filter((styleSet) => styleSet.id !== validated.id), validated]
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function applyWriterStyleSet(styleSet: WriterStyleSet): WriterStyleCatalog {
  return cloneCatalog(parseWriterStyleSetJson(JSON.stringify(styleSet)).catalog);
}

export function writerStyleSetFileName(styleSet: WriterStyleSet): string {
  const safeName = styleSet.name.normalize('NFKD').replace(/[^A-Za-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '');
  return `${safeName || 'writer-style-set'}.vgtstyles.json`;
}

export function writerStyleSetParagraphStyles(styleSet: WriterStyleSet): WriterStyleDefinition[] {
  return applyWriterStyleSet(styleSet).paragraphStyles;
}
