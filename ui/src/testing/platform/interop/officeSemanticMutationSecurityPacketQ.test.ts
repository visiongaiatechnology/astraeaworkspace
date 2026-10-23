// STATUS: PLATIN — bounded hostile OOXML/ODF semantic-import mutation coverage
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { exportDocx, importDocx } from '../../../platform/interop/docx';
import { exportXlsx, importXlsx } from '../../../platform/interop/xlsx';
import { exportOds, importOds } from '../../../platform/interop/ods';
import { exportPptx, importPptx } from '../../../platform/interop/pptx';
import { exportOdp, importOdp } from '../../../platform/interop/odp';
import { readZip, utf8, writeStoredZip, type ZipEntry } from '../../../platform/interop/zip';

const CASES_PER_FORMAT = 4_096;
const MAX_PACKAGE_BYTES = 64 * 1024 * 1024;
const encoder = new TextEncoder();

type Importer = (bytes: Uint8Array, fileName: string) => Promise<WorkspaceDocument>;
type MutationKind = 'xml' | 'json' | 'pptx-json';

interface MutationTarget {
  readonly name: string;
  readonly kind: MutationKind;
}

interface FormatCase {
  readonly name: string;
  readonly extension: string;
  readonly importer: Importer;
  readonly packageBytes: Uint8Array;
  readonly targets: readonly MutationTarget[];
  readonly expectedKind: WorkspaceDocument['kind'];
}

function baseDocument(kind: WorkspaceDocument['kind']): WorkspaceDocument {
  const common = {
    schema_version: 1,
    id: `mutation-${kind.toLowerCase()}`,
    title: 'Mutation fixture',
    kind,
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'default',
    root_object_ids: [] as string[],
    objects: {} as WorkspaceDocument['objects'],
  };

  if (kind === 'Writer') {
    const textId = 'mutation-text';
    return {
      ...common,
      root_object_ids: [textId],
      objects: {
        [textId]: {
          type: 'TextBlock',
          data: {
            id: textId,
            paragraphs: [{
              id: 'mutation-paragraph',
              style: { alignment: 'left', line_height: 1.4, space_before: 0, space_after: 4 },
              spans: [{ text: 'Bounded Office parser fixture' }],
            }],
          },
        },
      },
      writerData: {
        pageSetup: {
          paperSize: 'A4',
          orientation: 'portrait',
          margins: 'normal',
          paperColor: 'white',
          showPageNumbers: false,
          headerText: '',
          footerText: '',
        },
        tables: [],
      },
    };
  }

  if (kind === 'Grid') {
    const tableId = 'mutation-table';
    return {
      ...common,
      root_object_ids: [tableId],
      objects: {
        [tableId]: {
          type: 'Table',
          data: { id: tableId, rows: 1, cols: 1, cells: { A1: { value: 'bounded' } } },
        },
      },
      gridData: {
        sheets: [{ id: 'mutation-sheet', name: 'Mutation', tableObjectId: tableId }],
        activeSheetId: 'mutation-sheet',
        namedRanges: [],
      },
    };
  }

  const slide = {
    id: 'mutation-slide',
    title: 'Bounded parser fixture',
    subtitle: 'Semantic Office import',
    layout: 'bullet-list' as const,
    bulletPoints: ['Deterministic mutation case'],
    cards: [],
    speakerNotes: '',
    sceneObjects: [],
    images: [],
    animations: [],
    transition: { effect: 'none' as const, durationMs: 0 },
  };
  return {
    ...common,
    presentData: { slides: [slide], theme: 'dark', themeId: 'midnight', aspectRatio: '16:9' },
  };
}

function createCases(): readonly FormatCase[] {
  const writer = baseDocument('Writer');
  const grid = baseDocument('Grid');
  const presentation = baseDocument('Present');
  return [
    {
      name: 'DOCX', extension: 'docx', importer: importDocx, packageBytes: exportDocx(writer), expectedKind: 'Writer',
      targets: [
        { name: 'word/document.xml', kind: 'xml' },
        { name: 'word/styles.xml', kind: 'xml' },
        { name: 'word/settings.xml', kind: 'xml' },
        { name: 'word/_rels/document.xml.rels', kind: 'xml' },
      ],
    },
    {
      name: 'XLSX', extension: 'xlsx', importer: importXlsx, packageBytes: exportXlsx(grid), expectedKind: 'Grid',
      targets: [
        { name: 'xl/workbook.xml', kind: 'xml' },
        { name: 'xl/worksheets/sheet1.xml', kind: 'xml' },
        { name: 'xl/styles.xml', kind: 'xml' },
        { name: 'xl/_rels/workbook.xml.rels', kind: 'xml' },
        { name: '[Content_Types].xml', kind: 'xml' },
      ],
    },
    {
      name: 'ODS', extension: 'ods', importer: importOds, packageBytes: exportOds(grid), expectedKind: 'Grid',
      targets: [{ name: 'content.xml', kind: 'xml' }],
    },
    {
      name: 'PPTX', extension: 'pptx', importer: importPptx, packageBytes: exportPptx(presentation), expectedKind: 'Present',
      targets: [
        { name: 'ppt/vgt-present.xml', kind: 'pptx-json' },
        { name: 'ppt/presentation.xml', kind: 'xml' },
        { name: 'ppt/_rels/presentation.xml.rels', kind: 'xml' },
        { name: 'ppt/slides/slide1.xml', kind: 'xml' },
        { name: '[Content_Types].xml', kind: 'xml' },
      ],
    },
    {
      name: 'ODP', extension: 'odp', importer: importOdp, packageBytes: exportOdp(presentation), expectedKind: 'Present',
      targets: [
        { name: 'vgt/present.json', kind: 'json' },
        { name: 'content.xml', kind: 'xml' },
        { name: 'META-INF/manifest.xml', kind: 'xml' },
        { name: 'mimetype', kind: 'xml' },
      ],
    },
  ];
}

function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

function spliceBytes(source: Uint8Array, start: number, deleteCount: number, inserted: Uint8Array): Uint8Array {
  const boundedStart = Math.max(0, Math.min(start, source.byteLength));
  const boundedDelete = Math.max(0, Math.min(deleteCount, source.byteLength - boundedStart));
  const outputLength = source.byteLength - boundedDelete + inserted.byteLength;
  if (outputLength > MAX_PACKAGE_BYTES) throw new Error('Mutation corpus exceeded its package byte bound.');
  const output = new Uint8Array(outputLength);
  output.set(source.subarray(0, boundedStart), 0);
  output.set(inserted, boundedStart);
  output.set(source.subarray(boundedStart + boundedDelete), boundedStart + inserted.byteLength);
  return output;
}

function genericXmlMutation(source: Uint8Array, caseIndex: number, random: () => number): Uint8Array {
  const offset = source.byteLength === 0 ? 0 : random() % source.byteLength;
  const hostileFragments = [
    encoder.encode('<!DOCTYPE x [<!ENTITY vgt "x">]>'),
    encoder.encode('&vgt-expansion;'),
    encoder.encode(`${'<vgt-depth>'.repeat(98)}${'</vgt-depth>'.repeat(98)}`),
    new Uint8Array([0xff, 0xfe, 0]),
    encoder.encode('<broken attr="unterminated>'),
    encoder.encode(']]>'),
  ];
  switch (caseIndex % 8) {
    case 0: {
      const output = source.slice();
      if (output.byteLength) output[offset] = [0, 0xff, 0x3c, 0x26, 0x22][random() % 5];
      return output;
    }
    case 1: {
      const output = source.slice();
      if (output.byteLength) output[offset] ^= 1 << (random() % 8);
      return output;
    }
    case 2:
      return spliceBytes(source, offset, 0, hostileFragments[random() % hostileFragments.length]);
    case 3:
      return spliceBytes(source, offset, Math.min(1 + (random() % 12), source.byteLength - offset), hostileFragments[random() % hostileFragments.length]);
    case 4:
      return spliceBytes(source, offset, 1 + (random() % Math.max(1, source.byteLength - offset)), new Uint8Array());
    case 5:
      return source.slice(0, Math.max(0, source.byteLength - (1 + (random() % Math.min(24, source.byteLength)))));
    case 6:
      return spliceBytes(source, offset, 0, encoder.encode('" & < > '));
    default:
      return spliceBytes(source, offset, 0, hostileFragments[random() % hostileFragments.length]);
  }
}

function jsonMutation(source: Uint8Array, caseIndex: number, random: () => number): Uint8Array {
  switch (caseIndex % 8) {
    case 0: return utf8('null');
    case 1: return utf8('{"slides":[null]}');
    case 2: return utf8('{"slides":[{}]}');
    case 3: return utf8('{"slides":[{"id":4,"title":null,"subtitle":false,"layout":"unknown"}]}');
    case 4: return utf8('{"slides":[]}');
    case 5: return spliceBytes(source, source.byteLength, 0, utf8(' trailing'));
    case 6: return genericXmlMutation(source, caseIndex + 2, random);
    default: return genericXmlMutation(source, caseIndex + 3, random);
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

function mutatePptxCanonicalXml(source: Uint8Array, caseIndex: number, random: () => number): Uint8Array {
  const xml = new TextDecoder('utf-8', { fatal: true }).decode(source);
  const match = /(<vgt:present\b[^>]*>)([A-Za-z0-9+/=]+)(<\/vgt:present>)/u.exec(xml);
  if (!match) return genericXmlMutation(source, caseIndex, random);
  const jsonBytes = new Uint8Array(globalThis.atob(match[2]).length);
  const binary = globalThis.atob(match[2]);
  for (let index = 0; index < binary.length; index += 1) jsonBytes[index] = binary.charCodeAt(index);
  const changed = jsonMutation(jsonBytes, caseIndex, random);
  const rebuilt = `${match[1]}${encodeBase64(changed)}${match[3]}`;
  return utf8(xml.replace(match[0], rebuilt));
}

function mutateEntry(source: Uint8Array, kind: MutationKind, caseIndex: number, targetIndex: number): Uint8Array {
  const random = makeRandom(0x9e3779b9 ^ (caseIndex + 1) * 0x85ebca6b ^ (targetIndex + 1) * 0xc2b2ae35);
  if (kind === 'json') return jsonMutation(source, caseIndex, random);
  if (kind === 'pptx-json') return mutatePptxCanonicalXml(source, caseIndex, random);
  return genericXmlMutation(source, caseIndex, random);
}

function invalidUtf8PackageEntry(format: FormatCase, name: string): Uint8Array | null {
  if (format.name === 'PPTX') {
    if (name === 'ppt/vgt-present.xml') return utf8('<root/>');
    if (name === 'ppt/slides/slide1.xml') return new Uint8Array([0xff]);
  }
  if (format.name === 'ODP' && name === 'content.xml') return new Uint8Array([0xff]);
  if (name === format.targets[0].name && format.name !== 'PPTX' && format.name !== 'ODP') {
    return new Uint8Array([0xff]);
  }
  return null;
}

async function packageWithParts(
  source: Uint8Array,
  replacements: ReadonlyMap<string, Uint8Array>,
): Promise<Uint8Array> {
  const entries = await readZip(source);
  const rebuilt: ZipEntry[] = [];
  for (const [name, data] of entries) rebuilt.push({ name, data: replacements.get(name) ?? data });
  return writeStoredZip(rebuilt);
}

async function assertControlledReject(label: string, operation: () => Promise<unknown>): Promise<void> {
  let failure: unknown;
  try {
    await operation();
  } catch (error) {
    failure = error;
  }
  expect(failure, `${label} must reject malformed input.`).toBeInstanceOf(Error);
  expect(failure, `${label} must not leak a native TypeError.`).not.toBeInstanceOf(TypeError);
  expect(failure, `${label} must not leak a native RangeError.`).not.toBeInstanceOf(RangeError);
  expect((failure as Error).message.length, `${label} must return a bounded error message.`).toBeGreaterThan(0);
  expect((failure as Error).message.length, `${label} error messages must remain bounded.`).toBeLessThanOrEqual(512);
}

function assertImportedDocument(document: WorkspaceDocument, expectedKind: WorkspaceDocument['kind'], context: string): void {
  expect(document).toBeTypeOf('object');
  expect(document.kind).toBe(expectedKind);
  expect(document.title).toBeTypeOf('string');
  expect(document.id).toBeTypeOf('string');

  if (expectedKind === 'Writer') {
    expect(document.root_object_ids.length).toBeGreaterThan(0);
    for (const id of document.root_object_ids) {
      const object = document.objects[id];
      expect(object?.type).toBe('TextBlock');
      if (object?.type === 'TextBlock') expect(Array.isArray(object.data.paragraphs)).toBe(true);
    }
    return;
  }

  if (expectedKind === 'Grid') {
    const sheets = document.gridData?.sheets;
    expect(Array.isArray(sheets)).toBe(true);
    expect(sheets?.length).toBeGreaterThan(0);
    for (const sheet of sheets ?? []) {
      expect(sheet).toBeTypeOf('object');
      expect(sheet.id).toBeTypeOf('string');
      expect(sheet.name).toBeTypeOf('string');
      expect(document.objects[sheet.tableObjectId]?.type).toBe('Table');
    }
    return;
  }

  const slides = document.presentData?.slides;
  expect(Array.isArray(slides)).toBe(true);
  expect(slides?.length).toBeGreaterThan(0);
  expect(slides?.length).toBeLessThanOrEqual(512);
  for (const slide of slides ?? []) {
    expect(slide).toBeTypeOf('object');
    expect(slide.id, `${context}: each slide must have a stable string ID.`).toBeTypeOf('string');
    expect(slide.title, `${context}: each slide must have a string title.`).toBeTypeOf('string');
    expect(slide.subtitle, `${context}: each slide must have a string subtitle.`).toBeTypeOf('string');
    expect(['cards', 'chart', 'split', 'bullet-list', 'blank']).toContain(slide.layout);
    if (slide.bulletPoints !== undefined) {
      expect(Array.isArray(slide.bulletPoints)).toBe(true);
      for (const bullet of slide.bulletPoints) expect(bullet).toBeTypeOf('string');
    }
  }
}

async function runMutationCampaign(format: FormatCase): Promise<{ accepted: number; rejected: number }> {
  const originalEntries = await readZip(format.packageBytes);
  expect(format.packageBytes.byteLength).toBeLessThanOrEqual(MAX_PACKAGE_BYTES);
  expect(format.targets.length).toBeGreaterThan(0);
  for (const target of format.targets) expect(originalEntries.has(target.name)).toBe(true);

  let accepted = 0;
  let rejected = 0;
  for (let caseIndex = 0; caseIndex < CASES_PER_FORMAT; caseIndex += 1) {
    const targetIndex = caseIndex % format.targets.length;
    const targetCaseIndex = Math.floor(caseIndex / format.targets.length);
    const target = format.targets[targetIndex];
    const entries: ZipEntry[] = [];
    for (const [name, data] of originalEntries) {
      const invalidUtf8Data = caseIndex === 0 ? invalidUtf8PackageEntry(format, name) : null;
      entries.push({
        name,
        data: invalidUtf8Data
          ?? (name === target.name ? mutateEntry(data, target.kind, targetCaseIndex, targetIndex) : data),
      });
    }
    const packageBytes = writeStoredZip(entries);
    expect(packageBytes.byteLength).toBeLessThanOrEqual(MAX_PACKAGE_BYTES);
    let document: WorkspaceDocument;
    try {
      document = await format.importer(packageBytes, `mutation-${caseIndex}.${format.extension}`);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(TypeError);
      expect(error).not.toBeInstanceOf(RangeError);
      expect((error as Error).message.length).toBeGreaterThan(0);
      expect((error as Error).message.length).toBeLessThanOrEqual(512);
      rejected += 1;
      continue;
    }
    expect(caseIndex, `${format.name} must reject the dedicated invalid-UTF-8 package.`).not.toBe(0);
    assertImportedDocument(document, format.expectedKind, `${format.name} case ${caseIndex} (${target.name})`);
    accepted += 1;
  }

  expect(accepted + rejected).toBe(CASES_PER_FORMAT);
  console.info(`[SEC-096] ${format.name}: ${CASES_PER_FORMAT} cases (${accepted} valid imports, ${rejected} controlled rejects).`);
  return { accepted, rejected };
}

async function testFormatBounds(format: FormatCase): Promise<void> {
  if (format.name === 'DOCX') {
    await assertControlledReject('DOCX input-size ceiling', () =>
      importDocx(new Uint8Array(64 * 1024 * 1024 + 1), 'oversized.docx'));
    const paragraphs = '<w:p><w:r><w:t>x</w:t></w:r></w:p>'.repeat(3_400);
    const overElementLimit = await packageWithParts(format.packageBytes, new Map([
      ['word/document.xml', utf8(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}</w:body></w:document>`)],
    ]));
    await assertControlledReject('DOCX XML element-count ceiling', () => importDocx(overElementLimit, 'many-paragraphs.docx'));
    return;
  }

  if (format.name === 'XLSX') {
    const worksheetTags = Array.from({ length: 257 }, (_, index) =>
      `<sheet name="S${index + 1}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('');
    const workbook = `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${worksheetTags}</sheets></workbook>`;
    const overSheetLimit = await packageWithParts(format.packageBytes, new Map([['xl/workbook.xml', utf8(workbook)]]));
    await assertControlledReject('XLSX worksheet-count ceiling', () => importXlsx(overSheetLimit, 'many-sheets.xlsx'));
    return;
  }

  if (format.name === 'ODS') {
    const repeatedRow = '<table:table-row table:number-rows-repeated="100"><table:table-cell table:number-columns-repeated="100" office:value-type="string"><text:p>x</text:p></table:table-cell></table:table-row>';
    const rows = repeatedRow.repeat(26);
    const content = `<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:spreadsheet><table:table table:name="Large">${rows}</table:table></office:spreadsheet></office:body></office:document-content>`;
    const overCellLimit = await packageWithParts(format.packageBytes, new Map([['content.xml', utf8(content)]]));
    await assertControlledReject('ODS expanded cell-count ceiling', () => importOds(overCellLimit, 'many-cells.ods'));
    return;
  }

  if (format.name === 'PPTX') {
    const slideIds = Array.from({ length: 513 }, (_, index) =>
      `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`).join('');
    const presentation = `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>${slideIds}</p:sldIdLst></p:presentation>`;
    const overSlideLimit = await packageWithParts(format.packageBytes, new Map([
      ['ppt/vgt-present.xml', utf8('<root/>')],
      ['ppt/presentation.xml', utf8(presentation)],
    ]));
    await assertControlledReject('PPTX slide-count ceiling', () => importPptx(overSlideLimit, 'many-slides.pptx'));
    return;
  }

  const pages = Array.from({ length: 513 }, (_, index) => `<draw:page draw:name="S${index + 1}"></draw:page>`).join('');
  const content = `<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"><office:body><office:presentation>${pages}</office:presentation></office:body></office:document-content>`;
  const cappedPages = await packageWithParts(format.packageBytes, new Map([
    ['vgt/present.json', utf8('null')],
    ['content.xml', utf8(content)],
  ]));
  const document = await importOdp(cappedPages, 'many-pages.odp');
  expect(document.presentData?.slides).toHaveLength(512);
  expect(document.presentData?.slides.length).toBeLessThanOrEqual(512);
}

describe('Office semantic import parser mutation packet Q', () => {
  for (const format of createCases()) {
    it(`preserves the valid ${format.name} export/import semantic roundtrip`, async () => {
      const document = await format.importer(format.packageBytes, `baseline.${format.extension}`);
      assertImportedDocument(document, format.expectedKind, `${format.name} baseline`);
      if (format.expectedKind === 'Writer') {
        const textBlockId = document.root_object_ids[0];
        const textBlock = document.objects[textBlockId];
        expect(textBlock?.type).toBe('TextBlock');
        if (textBlock?.type === 'TextBlock') {
          expect(textBlock.data.paragraphs.flatMap((paragraph) => paragraph.spans.map((span) => span.text)).join(' '))
            .toContain('Bounded Office parser fixture');
        }
      } else if (format.expectedKind === 'Grid') {
        const tableId = document.gridData?.sheets[0]?.tableObjectId;
        const table = tableId ? document.objects[tableId] : undefined;
        expect(table?.type).toBe('Table');
        if (table?.type === 'Table') expect(table.data.cells.A1?.value).toBe('bounded');
      } else {
        expect(document.presentData?.slides[0]?.title).toBe('Bounded parser fixture');
      }
    });

    it(`keeps ${format.name} imports bounded and structurally valid across ${CASES_PER_FORMAT} deterministic mutations`, async () => {
      const result = await runMutationCampaign(format);
      expect(result.accepted + result.rejected).toBe(CASES_PER_FORMAT);
    }, 60_000);

    it(`enforces ${format.name} input size or semantic item-count ceilings`, async () => {
      await testFormatBounds(format);
    }, 60_000);
  }
});
