// STATUS: PLATIN — bounded package-graph mutations through real Office import entrypoints.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { exportDocx, importDocx } from '../../../platform/interop/docx';
import { exportXlsx, importXlsx } from '../../../platform/interop/xlsx';
import { exportOds, importOds } from '../../../platform/interop/ods';
import { exportPptx, importPptx } from '../../../platform/interop/pptx';
import { exportOdp, importOdp } from '../../../platform/interop/odp';
import { readZip, utf8, writeStoredZip, type ZipEntry } from '../../../platform/interop/zip';

const EXPLICIT_CASES = 44;
const DETERMINISTIC_CORPUS_CASES = 4_096;
type Importer = (bytes: Uint8Array, fileName: string) => Promise<WorkspaceDocument>;

interface FormatFixture {
  readonly name: string;
  readonly extension: string;
  readonly importer: Importer;
  readonly bytes: Uint8Array;
}

interface MutationCase {
  readonly label: string;
  readonly fixture: FormatFixture;
  readonly mutate: (entries: ZipEntry[]) => ZipEntry[];
}

function writerFixture(): WorkspaceDocument {
  const id = 'graph-writer-text';
  return {
    schema_version: 1,
    id,
    title: 'Package graph fixture',
    kind: 'Writer',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'default',
    root_object_ids: [id],
    objects: {
      [id]: {
        type: 'TextBlock',
        data: {
          id,
          paragraphs: [{
            id: 'graph-writer-paragraph',
            style: { alignment: 'left', line_height: 1.4, space_before: 0, space_after: 4 },
            spans: [{ text: 'Package graph fixture' }],
          }],
        },
      },
    },
    writerData: {
      pageSetup: {
        paperSize: 'A4', orientation: 'portrait', margins: 'normal', paperColor: 'white',
        showPageNumbers: false, headerText: '', footerText: '',
      },
      tables: [],
    },
  };
}

function gridFixture(): WorkspaceDocument {
  const tableId = 'graph-grid-table';
  return {
    schema_version: 1,
    id: 'graph-grid',
    title: 'Package graph fixture',
    kind: 'Grid',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'default',
    root_object_ids: [tableId],
    objects: {
      [tableId]: { type: 'Table', data: { id: tableId, rows: 1, cols: 1, cells: { A1: { value: 'bounded' } } } },
    },
    gridData: {
      sheets: [{ id: 'graph-sheet', name: 'Graph', tableObjectId: tableId }],
      activeSheetId: 'graph-sheet',
      namedRanges: [],
    },
  };
}

function presentationFixture(): WorkspaceDocument {
  return {
    schema_version: 1,
    id: 'graph-presentation',
    title: 'Package graph fixture',
    kind: 'Present',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'midnight',
    root_object_ids: [],
    objects: {},
    presentData: {
      slides: [{
        id: 'graph-slide', title: 'Package graph fixture', subtitle: '', layout: 'blank',
        bulletPoints: [], cards: [], speakerNotes: '', sceneObjects: [], images: [], animations: [],
        transition: { effect: 'none', durationMs: 0 },
      }],
      theme: 'dark', themeId: 'midnight', aspectRatio: '16:9',
    },
  };
}

async function packageEntries(source: Uint8Array): Promise<ZipEntry[]> {
  const entries = await readZip(source);
  return [...entries].map(([name, data]) => ({ name, data }));
}

function replacePart(entries: ZipEntry[], name: string, data: Uint8Array): ZipEntry[] {
  let found = false;
  const output = entries.map((entry) => {
    if (entry.name !== name) return entry;
    found = true;
    return { name, data };
  });
  if (!found) throw new Error(`Fixture is missing required part: ${name}`);
  return output;
}

function removePart(entries: ZipEntry[], name: string): ZipEntry[] {
  return entries.filter((entry) => entry.name !== name);
}

function appendXmlChild(entries: ZipEntry[], name: string, child: string): ZipEntry[] {
  const entry = entries.find((candidate) => candidate.name === name);
  if (!entry) throw new Error(`Fixture is missing required graph part: ${name}`);
  const xml = new TextDecoder('utf-8', { fatal: true }).decode(entry.data);
  const rootClose = xml.lastIndexOf('</');
  if (rootClose < 0) throw new Error(`Fixture graph XML has no closing root: ${name}`);
  return replacePart(entries, name, utf8(`${xml.slice(0, rootClose)}${child}${xml.slice(rootClose)}`));
}

function replaceText(entries: ZipEntry[], name: string, search: string, replacement: string): ZipEntry[] {
  const entry = entries.find((candidate) => candidate.name === name);
  if (!entry) throw new Error(`Fixture is missing required graph part: ${name}`);
  const xml = new TextDecoder('utf-8', { fatal: true }).decode(entry.data);
  if (!xml.includes(search)) throw new Error(`Fixture graph text not found in ${name}`);
  return replacePart(entries, name, utf8(xml.replace(search, replacement)));
}

function contentTypeMutations(fixture: FormatFixture): MutationCase[] {
  const mainPart = fixture.name === 'DOCX' ? '/word/document.xml'
    : fixture.name === 'XLSX' ? '/xl/workbook.xml' : '/ppt/presentation.xml';
  return [
    {
      label: `${fixture.name}: missing [Content_Types].xml`,
      fixture,
      mutate: (entries) => removePart(entries, '[Content_Types].xml'),
    },
    {
      label: `${fixture.name}: malformed [Content_Types].xml`,
      fixture,
      mutate: (entries) => replacePart(entries, '[Content_Types].xml', utf8('<Types><Broken/></Types><')),
    },
    {
      label: `${fixture.name}: duplicate content-type override`,
      fixture,
      mutate: (entries) => appendXmlChild(entries, '[Content_Types].xml', `<Override PartName="${mainPart}" ContentType="application/xml"/>`),
    },
    {
      label: `${fixture.name}: escaping content-type PartName`,
      fixture,
      mutate: (entries) => appendXmlChild(entries, '[Content_Types].xml', '<Override PartName="/../../outside.xml" ContentType="application/xml"/>'),
    },
  ];
}

function rootRelationshipMutations(fixture: FormatFixture): MutationCase[] {
  const rootRel = '_rels/.rels';
  const rootTarget = fixture.name === 'DOCX' ? 'word/document.xml'
    : fixture.name === 'XLSX' ? 'xl/workbook.xml' : 'ppt/presentation.xml';
  return [
    {
      label: `${fixture.name}: missing package root relationships`,
      fixture,
      mutate: (entries) => removePart(entries, rootRel),
    },
    {
      label: `${fixture.name}: malformed package root relationship`,
      fixture,
      mutate: (entries) => appendXmlChild(entries, rootRel, '<Relationship Id=bad/>'),
    },
    {
      label: `${fixture.name}: duplicate package root relationship Id`,
      fixture,
      mutate: (entries) => appendXmlChild(entries, rootRel, `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${rootTarget}"/>`),
    },
    {
      label: `${fixture.name}: escaping package root relationship Target`,
      fixture,
      mutate: (entries) => replaceText(entries, rootRel, `Target="${rootTarget}"`, 'Target="../../outside.xml"'),
    },
  ];
}

function documentRelationshipMutations(fixture: FormatFixture): MutationCase[] {
  const relPart = fixture.name === 'DOCX' ? 'word/_rels/document.xml.rels'
    : fixture.name === 'XLSX' ? 'xl/_rels/workbook.xml.rels' : 'ppt/_rels/presentation.xml.rels';
  const duplicateRel = fixture.name === 'DOCX'
    ? '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>'
    : fixture.name === 'XLSX'
      ? '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
      : '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>';
  const missingTargetPart = fixture.name === 'DOCX' ? 'word/settings.xml'
    : fixture.name === 'XLSX' ? 'xl/worksheets/sheet1.xml' : 'ppt/slideMasters/slideMaster1.xml';
  const targetSearch = fixture.name === 'DOCX' ? 'Target="settings.xml"'
    : fixture.name === 'XLSX' ? 'Target="worksheets/sheet1.xml"' : 'Target="slides/slide1.xml"';
  const targetReplacement = fixture.name === 'DOCX' ? 'Target="../../word/settings.xml"'
    : fixture.name === 'XLSX' ? 'Target="../../xl/worksheets/sheet1.xml"' : 'Target="../../ppt/slides/slide1.xml"';
  return [
    {
      label: `${fixture.name}: missing relationship target part`,
      fixture,
      mutate: (entries) => removePart(entries, missingTargetPart),
    },
    {
      label: `${fixture.name}: malformed document relationship attribute`,
      fixture,
      mutate: (entries) => appendXmlChild(entries, relPart, '<Relationship Id=bad/>'),
    },
    {
      label: `${fixture.name}: duplicate document relationship Id`,
      fixture,
      mutate: (entries) => appendXmlChild(entries, relPart, duplicateRel),
    },
    {
      label: `${fixture.name}: escaping document relationship Target`,
      fixture,
      mutate: (entries) => replaceText(entries, relPart, targetSearch, targetReplacement),
    },
  ];
}

function odfManifestMutations(fixture: FormatFixture): MutationCase[] {
  const manifest = 'META-INF/manifest.xml';
  const duplicateEntry = fixture.name === 'ODS'
    ? '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>'
    : '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>';
  return [
    { label: `${fixture.name}: missing ODF manifest`, fixture, mutate: (entries) => removePart(entries, manifest) },
    { label: `${fixture.name}: malformed ODF manifest`, fixture, mutate: (entries) => replacePart(entries, manifest, utf8('<manifest:manifest><broken/></manifest:manifest><')) },
    { label: `${fixture.name}: duplicate ODF manifest file-entry`, fixture, mutate: (entries) => appendXmlChild(entries, manifest, duplicateEntry) },
    { label: `${fixture.name}: escaping ODF manifest full-path`, fixture, mutate: (entries) => appendXmlChild(entries, manifest, '<manifest:file-entry manifest:full-path="/../../outside.xml" manifest:media-type="text/xml"/>') },
  ];
}

async function createFixtures(): Promise<FormatFixture[]> {
  const writer = writerFixture();
  const grid = gridFixture();
  const presentation = presentationFixture();
  const pptxEntries = await packageEntries(exportPptx(presentation));
  // Exercise PPTX's ordinary relationship-driven importer instead of its VGT-specific shortcut.
  const pptxBytes = writeStoredZip(removePart(pptxEntries, 'ppt/vgt-present.xml'));
  return [
    { name: 'DOCX', extension: 'docx', importer: importDocx, bytes: exportDocx(writer) },
    { name: 'XLSX', extension: 'xlsx', importer: importXlsx, bytes: exportXlsx(grid) },
    { name: 'PPTX', extension: 'pptx', importer: importPptx, bytes: pptxBytes },
    { name: 'ODS', extension: 'ods', importer: importOds, bytes: exportOds(grid) },
    { name: 'ODP', extension: 'odp', importer: importOdp, bytes: exportOdp(presentation) },
  ];
}

function mutateDeterministicGraphCase(fixture: FormatFixture, entries: ZipEntry[], variant: number): { category: string; entries: ZipEntry[] } {
  const isOoxml = fixture.name === 'DOCX' || fixture.name === 'XLSX' || fixture.name === 'PPTX';
  if (!isOoxml) {
    const manifest = 'META-INF/manifest.xml';
    switch (variant % 4) {
      case 0:
        return {
          category: 'manifest-malformed-xml',
          entries: replacePart(entries, manifest, utf8(`<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="content-${variant}.xml" manifest:media-type="text/xml"></manifest:manifest>`)),
        };
      case 1:
        return {
          category: 'manifest-duplicate-full-path',
          entries: appendXmlChild(entries, manifest, `<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="application/vnd.vgt.mutation-${variant}"/>`),
        };
      case 2:
        return {
          category: 'manifest-escaping-path',
          entries: appendXmlChild(entries, manifest, `<manifest:file-entry manifest:full-path="/../../outside-${variant}.xml" manifest:media-type="text/xml"/>`),
        };
      default:
        return {
          category: 'manifest-missing-target',
          entries: appendXmlChild(entries, manifest, `<manifest:file-entry manifest:full-path="missing-${variant}.xml" manifest:media-type="text/xml"/>`),
        };
    }
  }

  const mainPart = fixture.name === 'DOCX' ? 'word/document.xml' : fixture.name === 'XLSX' ? 'xl/workbook.xml' : 'ppt/presentation.xml';
  const mainPartUri = `/${mainPart}`;
  const mainTarget = mainPart;
  const contentType = fixture.name === 'DOCX' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'
    : fixture.name === 'XLSX' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'
      : 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml';
  const rootRel = '_rels/.rels';
  const relPart = fixture.name === 'DOCX' ? 'word/_rels/document.xml.rels'
    : fixture.name === 'XLSX' ? 'xl/_rels/workbook.xml.rels' : 'ppt/_rels/presentation.xml.rels';
  const relationshipSearch = fixture.name === 'DOCX' ? 'Target="settings.xml"'
    : fixture.name === 'XLSX' ? 'Target="worksheets/sheet1.xml"' : 'Target="slides/slide1.xml"';
  const duplicateRelationship = fixture.name === 'DOCX'
    ? '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>'
    : fixture.name === 'XLSX'
      ? '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
      : '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>';
  switch (variant % 10) {
    case 0:
      return {
        category: 'content-types-malformed-xml',
        entries: replacePart(entries, '[Content_Types].xml', utf8(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/broken-${variant}.xml" ContentType="${contentType}"`)),
      };
    case 1:
      return {
        category: 'content-types-duplicate-part',
        entries: appendXmlChild(entries, '[Content_Types].xml', `<Override PartName="${mainPartUri}" ContentType="application/vnd.vgt.mutation-${variant}+xml"/>`),
      };
    case 2:
      return {
        category: 'content-types-escaping-part',
        entries: appendXmlChild(entries, '[Content_Types].xml', `<Override PartName="/../../outside-${variant}.xml" ContentType="application/xml"/>`),
      };
    case 3:
      return {
        category: 'root-relationship-malformed-attribute',
        entries: appendXmlChild(entries, rootRel, `<Relationship Id=bad${variant}/>`),
      };
    case 4:
      return {
        category: 'root-relationship-duplicate-id',
        entries: appendXmlChild(entries, rootRel, `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${mainTarget}"/>`),
      };
    case 5:
      return {
        category: 'root-relationship-escaping-target',
        entries: replaceText(entries, rootRel, `Target="${mainTarget}"`, `Target="../../../outside-${variant}.xml"`),
      };
    case 6:
      return {
        category: 'part-relationship-malformed-attribute',
        entries: appendXmlChild(entries, relPart, `<Relationship Id=bad${variant}/>`),
      };
    case 7:
      return {
        category: 'part-relationship-duplicate-id',
        entries: appendXmlChild(entries, relPart, duplicateRelationship),
      };
    case 8:
      return {
        category: 'part-relationship-escaping-target',
        entries: replaceText(entries, relPart, relationshipSearch, `Target="../../outside-${variant}.xml"`),
      };
    default:
      return {
        category: 'part-relationship-missing-target',
        entries: replaceText(entries, relPart, relationshipSearch, `Target="missing-${variant}.xml"`),
      };
  }
}

async function expectBoundedReject(testCase: MutationCase, bytes: Uint8Array, fileName: string): Promise<void> {
  let failure: unknown;
  try {
    await testCase.fixture.importer(bytes, fileName);
  } catch (error) {
    failure = error;
  }
  expect(failure, `${testCase.label} must reject malformed package graph input.`).toBeInstanceOf(Error);
  expect(failure, `${testCase.label} must not leak a native TypeError.`).not.toBeInstanceOf(TypeError);
  expect(failure, `${testCase.label} must not leak a native RangeError.`).not.toBeInstanceOf(RangeError);
  expect((failure as Error).message.length, `${testCase.label} must return a bounded error.`).toBeGreaterThan(0);
  expect((failure as Error).message.length, `${testCase.label} error must remain bounded.`).toBeLessThanOrEqual(512);
}

describe('SEC-096 bounded package-graph mutation packet', () => {
  it('rejects all 44 explicit malformed package-graph mutations with bounded errors', async () => {
    const fixtures = await createFixtures();
    const ooxml = fixtures.filter((fixture) => fixture.name === 'DOCX' || fixture.name === 'XLSX' || fixture.name === 'PPTX');
    const odf = fixtures.filter((fixture) => fixture.name === 'ODS' || fixture.name === 'ODP');
    const cases = [
      ...ooxml.flatMap((fixture) => [
        ...contentTypeMutations(fixture),
        ...rootRelationshipMutations(fixture),
        ...documentRelationshipMutations(fixture),
      ]),
      ...odf.flatMap(odfManifestMutations),
    ];

    expect(cases).toHaveLength(EXPLICIT_CASES);
    for (const [index, testCase] of cases.entries()) {
      const original = await packageEntries(testCase.fixture.bytes);
      const bytes = writeStoredZip(testCase.mutate(original));
      await expectBoundedReject(testCase, bytes, `graph-${index}.${testCase.fixture.extension}`);
    }
    console.info(`[SEC-096 package graph] ${cases.length} explicit mutations: all rejected through production importers.`);
  });

  it('rejects 4,096 deterministic package-graph mutations and accepts valid exported roundtrips', async () => {
    const fixtures = await createFixtures();
    for (const fixture of fixtures) {
      const valid = await fixture.importer(fixture.bytes, `valid-${fixture.name}.${fixture.extension}`);
      expect(valid.kind).toBe(fixture.name === 'DOCX' ? 'Writer'
        : fixture.name === 'XLSX' || fixture.name === 'ODS' ? 'Grid' : 'Present');
    }

    let processed = 0;
    const countsByImporter = new Map<string, number>();
    const countsByCategory = new Map<string, number>();
    for (const fixture of fixtures) {
      const count = Math.floor(DETERMINISTIC_CORPUS_CASES / fixtures.length)
        + (processed === 0 ? DETERMINISTIC_CORPUS_CASES % fixtures.length : 0);
      for (let localIndex = 0; localIndex < count; localIndex += 1) {
        const corpusIndex = processed + localIndex;
          const original = await packageEntries(fixture.bytes);
          const mutation = mutateDeterministicGraphCase(fixture, original, localIndex);
          const bytes = writeStoredZip(mutation.entries);
          await expectBoundedReject({ label: `${fixture.name}: ${mutation.category} case ${localIndex}`, fixture, mutate: () => mutation.entries }, bytes, `graph-corpus-${corpusIndex}.${fixture.extension}`);
          countsByCategory.set(`${fixture.name}/${mutation.category}`, (countsByCategory.get(`${fixture.name}/${mutation.category}`) ?? 0) + 1);
      }
      processed += count;
      countsByImporter.set(fixture.name, count);
    }
    expect(processed).toBe(DETERMINISTIC_CORPUS_CASES);
    console.info(`[SEC-096 package graph] ${processed} structural mutations rejected; valid exported roundtrips accepted; by importer: ${[...countsByImporter].map(([name, count]) => `${name}=${count}`).join(', ')}; by mutation: ${[...countsByCategory].map(([name, count]) => `${name}=${count}`).join(', ')}.`);
  }, 15_000);
});
