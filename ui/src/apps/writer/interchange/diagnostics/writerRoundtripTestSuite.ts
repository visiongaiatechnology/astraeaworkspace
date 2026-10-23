// STATUS: DIAMANT VGT SUPREME — Writer Interoperability Runtime Fidelity Benchmark
import type { Paragraph, WorkspaceDocument, WriterPageSetupConfig } from '../../../../shared/contracts/workspace';
import {
  exportWriterPortableDocument,
  importWriterPortableBytes,
  type WriterPortableFormat as PortableFormat,
} from '../portable/writerPortableInterop';

export interface TestResult {
  format: string;
  passed: boolean;
  score: number;
  textFidelity: number;
  structureFidelity: number;
  anomalies: string[];
}

export interface FidelityReport {
  overallPassed: boolean;
  averageScore: number;
  timestamp: number;
  tests: TestResult[];
}

const PAGE_SETUP: WriterPageSetupConfig = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  paperColor: 'white',
  showPageNumbers: true,
  headerText: '',
  footerText: '',
};

export const SAMPLE_CORPUS: Paragraph[] = [
  {
    id: 'test-1',
    style: { style_name: 'heading1', heading_level: 1, alignment: 'left', line_height: 1.3, space_before: 14, space_after: 6 },
    spans: [{ text: 'Astraea High-Assurance Architecture Overview', bold: true, font_size_pt: 24 }],
  },
  {
    id: 'test-2',
    style: { style_name: 'normal', alignment: 'left', line_height: 1.25, space_before: 0, space_after: 4 },
    spans: [
      { text: 'This is a normal paragraph with ' },
      { text: 'bold text', bold: true },
      { text: ' and ' },
      { text: 'italic emphasis', italic: true },
      { text: ' plus Unicode Ω中🙂.' },
    ],
  },
  {
    id: 'test-3',
    style: { style_name: 'heading2', heading_level: 2, alignment: 'left', line_height: 1.3, space_before: 14, space_after: 6 },
    spans: [{ text: 'Sub-heading for Systematic Validation', bold: true, font_size_pt: 18 }],
  },
  {
    id: 'test-4',
    style: { style_name: 'normal', alignment: 'left', line_height: 1.25, space_before: 0, space_after: 4, list_style: 'number' },
    spans: [{ text: 'First item of an ordered enumeration sequence.' }],
  },
  {
    id: 'test-5',
    style: { style_name: 'normal', alignment: 'left', line_height: 1.25, space_before: 0, space_after: 4, list_style: 'bullet' },
    spans: [{ text: 'Second item with nested bullet representation.' }],
  },
];

interface FormatExpectation {
  label: string;
  format: PortableFormat;
  preservesHeadings: boolean;
  preservesLists: boolean;
  preservesInlineFormatting: boolean;
}

const EXPECTATIONS: readonly FormatExpectation[] = [
  { label: 'DOCX / OOXML', format: 'docx', preservesHeadings: true, preservesLists: false, preservesInlineFormatting: true },
  { label: 'ODT / ODF', format: 'odt', preservesHeadings: true, preservesLists: true, preservesInlineFormatting: true },
  { label: 'RTF', format: 'rtf', preservesHeadings: false, preservesLists: false, preservesInlineFormatting: false },
  { label: 'HTML5', format: 'html', preservesHeadings: true, preservesLists: true, preservesInlineFormatting: false },
  { label: 'Markdown', format: 'markdown', preservesHeadings: true, preservesLists: true, preservesInlineFormatting: true },
  { label: 'Plain Text', format: 'txt', preservesHeadings: false, preservesLists: false, preservesInlineFormatting: false },
];

function sampleDocument(): WorkspaceDocument {
  const textId = 'writer-roundtrip-benchmark-text';
  return {
    schema_version: 1,
    id: 'writer-roundtrip-benchmark',
    title: 'Astraea Roundtrip Benchmark',
    kind: 'Writer',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'default',
    root_object_ids: [textId],
    objects: {
      [textId]: { type: 'TextBlock', data: { id: textId, paragraphs: SAMPLE_CORPUS } },
    },
    writerData: { pageSetup: PAGE_SETUP, tables: [] },
  };
}

function writerParagraphs(doc: WorkspaceDocument): Paragraph[] {
  for (const id of doc.root_object_ids) {
    const object = doc.objects[id];
    if (object?.type === 'TextBlock') return object.data.paragraphs;
  }
  const fallback = Object.values(doc.objects).find((object) => object.type === 'TextBlock');
  return fallback?.type === 'TextBlock' ? fallback.data.paragraphs : [];
}

function paragraphText(paragraph: Paragraph): string {
  return paragraph.spans.map((span) => span.text).join('');
}

function normalized(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

function textFidelity(imported: readonly Paragraph[]): { score: number; anomalies: string[] } {
  const anomalies: string[] = [];
  const actual = normalized(imported.map(paragraphText).join(' '));
  const expectedParagraphs = SAMPLE_CORPUS.map((paragraph) => normalized(paragraphText(paragraph)));
  let matched = 0;
  for (const expected of expectedParagraphs) {
    if (actual.includes(expected)) matched += 1;
    else anomalies.push(`Textpassage fehlt: ${expected.slice(0, 72)}`);
  }
  return { score: Math.round((matched / expectedParagraphs.length) * 100), anomalies };
}

function structureFidelity(imported: readonly Paragraph[], expectation: FormatExpectation): { score: number; anomalies: string[] } {
  const checks: Array<{ ok: boolean; anomaly: string }> = [
    { ok: imported.length >= SAMPLE_CORPUS.length, anomaly: `Absatzzahl reduziert (${imported.length}/${SAMPLE_CORPUS.length}).` },
  ];
  if (expectation.preservesHeadings) {
    checks.push({ ok: imported.some((paragraph) => paragraph.style.heading_level === 1), anomaly: 'Heading 1 ging verloren.' });
    checks.push({ ok: imported.some((paragraph) => paragraph.style.heading_level === 2), anomaly: 'Heading 2 ging verloren.' });
  }
  if (expectation.preservesLists) {
    checks.push({ ok: imported.some((paragraph) => paragraph.style.list_style === 'number'), anomaly: 'Nummerierte Liste ging verloren.' });
    checks.push({ ok: imported.some((paragraph) => paragraph.style.list_style === 'bullet'), anomaly: 'Aufzählung ging verloren.' });
  }
  if (expectation.preservesInlineFormatting) {
    checks.push({ ok: imported.some((paragraph) => paragraph.spans.some((span) => span.bold)), anomaly: 'Fettformatierung ging verloren.' });
    checks.push({ ok: imported.some((paragraph) => paragraph.spans.some((span) => span.italic)), anomaly: 'Kursivformatierung ging verloren.' });
  }
  const passed = checks.filter((check) => check.ok).length;
  return {
    score: Math.round((passed / checks.length) * 100),
    anomalies: checks.filter((check) => !check.ok).map((check) => check.anomaly),
  };
}

async function testFormat(expectation: FormatExpectation): Promise<TestResult> {
  try {
    const exported = exportWriterPortableDocument(sampleDocument(), expectation.format);
    const imported = await importWriterPortableBytes(exported.bytes, exported.fileName);
    const paragraphs = writerParagraphs(imported);
    const text = textFidelity(paragraphs);
    const structure = structureFidelity(paragraphs, expectation);
    const score = Math.round(text.score * 0.7 + structure.score * 0.3);
    return {
      format: expectation.label,
      passed: text.score >= 80 && score >= 80,
      score,
      textFidelity: text.score,
      structureFidelity: structure.score,
      anomalies: [...text.anomalies, ...structure.anomalies],
    };
  } catch (error) {
    return {
      format: expectation.label,
      passed: false,
      score: 0,
      textFidelity: 0,
      structureFidelity: 0,
      anomalies: [error instanceof Error ? error.message : 'Unbekannter Roundtrip-Fehler.'],
    };
  }
}

export async function runRoundtripTestSuite(): Promise<FidelityReport> {
  const tests = await Promise.all(EXPECTATIONS.map(testFormat));
  const averageScore = tests.length > 0
    ? Math.round(tests.reduce((sum, test) => sum + test.score, 0) / tests.length)
    : 0;
  return {
    overallPassed: tests.every((test) => test.passed),
    averageScore,
    timestamp: Date.now(),
    tests,
  };
}
