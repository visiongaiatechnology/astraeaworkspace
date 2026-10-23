import { secureRandomId } from '../../shared/crypto/secureRandom';
// STATUS: DIAMANT VGT SUPREME — bounded ODF Presentation package interoperability
import type { PresentDocumentModel, PresentSceneObject, PresentSlide, WorkspaceDocument } from '../../shared/contracts/workspace';
import { decodeUtf8, readZip, utf8, writeStoredZip, type ZipEntry } from './zip';
import { escapeXml, inspectBoundedForeignXml } from '../../shared/interoperability/xml';
import { isValidPresentInteropModel } from '../../apps/present/interoperability/presentModelValidation';
import { validateOdfPackageManifest } from './officePackageGraph';

const MAX_SLIDES = 512;
const MAX_TEXT_CHARS = 32 * 1024 * 1024;
const MAX_PRESERVED_PARTS = 96;
const MAX_PRESERVED_TOTAL_CHARS = 2 * 1024 * 1024;
const SAFE_PASSIVE_XML = /^(?:styles\.xml|settings\.xml|meta\.xml|Configurations2\/[^/]+\.xml|META-INF\/[^/]+\.xml)$/i;

function validateXml(xml: string): void {
  if (xml.length > MAX_TEXT_CHARS) throw new Error('ODP XML exceeds importer limit.');
  inspectBoundedForeignXml(xml);
}

function textOfPage(pageXml: string): string[] {
  const out: string[] = [];
  const regex = /<(?:text:)?p\b[^>]*>([\s\S]*?)<\/(?:text:)?p>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(pageXml))) {
    const plain = match[1].replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/\s+/g, ' ').trim();
    if (plain) out.push(plain.slice(0, 32_768));
    if (out.length >= 512) break;
  }
  return out;
}

function pageSegments(contentXml: string): string[] {
  const segments: string[] = [];
  const regex = /<(?:draw:)?page\b[\s\S]*?<\/(?:draw:)?page>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(contentXml))) {
    segments.push(match[0]);
    if (segments.length >= MAX_SLIDES) break;
  }
  return segments;
}

function parseVgtModel(entries: Map<string, Uint8Array>): PresentDocumentModel | null {
  const bytes = entries.get('vgt/present.json');
  if (!bytes || bytes.byteLength > 8 * 1024 * 1024) return null;
  try {
    const parsed: unknown = JSON.parse(decodeUtf8(bytes));
    return isValidPresentInteropModel(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function collectPassiveParts(entries: Map<string, Uint8Array>): PresentDocumentModel['interopPreservedParts'] {
  const parts: NonNullable<PresentDocumentModel['interopPreservedParts']> = [];
  let total = 0;
  for (const [path, bytes] of entries) {
    if (!SAFE_PASSIVE_XML.test(path) || path === 'META-INF/manifest.xml' || path === 'vgt/present.json') continue;
    if (bytes.byteLength > 512 * 1024) continue;
    const content = decodeUtf8(bytes);
    validateXml(content);
    if (total + content.length > MAX_PRESERVED_TOTAL_CHARS || parts.length >= MAX_PRESERVED_PARTS) break;
    parts.push({ format: 'odp', path, content });
    total += content.length;
  }
  return parts;
}

export async function importOdp(bytes: Uint8Array, fileName: string): Promise<WorkspaceDocument> {
  const entries = await readZip(bytes, { maxEntries: 2048, maxEntryBytes: 64 * 1024 * 1024, maxTotalUncompressedBytes: 128 * 1024 * 1024, maxCompressionRatio: 100, maxElapsedMs: 5_000 });
  validateOdfPackageManifest(entries);
  const mime = entries.get('mimetype');
  const content = entries.get('content.xml');
  const manifest = entries.get('META-INF/manifest.xml');
  if (!mime || !content || !manifest) throw new Error('Not a valid ODP package.');
  if (decodeUtf8(mime).trim() !== 'application/vnd.oasis.opendocument.presentation') throw new Error('ODP mimetype mismatch.');
  const contentXml = decodeUtf8(content);
  validateXml(contentXml);
  const canonical = parseVgtModel(entries);
  let model: PresentDocumentModel;
  if (canonical) {
    model = { ...canonical, interopPreservedParts: collectPassiveParts(entries) };
  } else {
    const pages = pageSegments(contentXml);
    if (!pages.length) throw new Error('ODP contains no presentation pages.');
    const slides: PresentSlide[] = pages.map((page, index) => {
      const text = textOfPage(page);
      return { id: `odp-slide-${index + 1}`, title: text[0] || `Slide ${index + 1}`, subtitle: text[1] || '', layout: text.length > 2 ? 'bullet-list' : 'blank', bulletPoints: text.slice(2), sceneObjects: [], images: [], speakerNotes: '', transition: { effect: 'none', durationMs: 0 } };
    });
    model = { slides, themeId: 'midnight', aspectRatio: '16:9', interopPreservedParts: collectPassiveParts(entries) };
  }
  const now = Date.now();
  return { schema_version: 1, id: secureRandomId('odp'), title: fileName.replace(/\.odp$/i, '') || 'Imported Presentation', kind: 'Present', created_at: now, modified_at: now, version: 1, theme_id: model.themeId || 'midnight', root_object_ids: [], objects: {}, presentData: model };
}

function textShape(text: string, x: number, y: number, width: number, height: number, styleName: string): string {
  return `<draw:frame draw:style-name="${styleName}" svg:x="${x}cm" svg:y="${y}cm" svg:width="${width}cm" svg:height="${height}cm"><draw:text-box><text:p>${escapeXml(text)}</text:p></draw:text-box></draw:frame>`;
}

function sceneText(object: PresentSceneObject): string {
  if (object.kind === 'text') return object.text;
  if (object.kind === 'code') return object.code;
  if (object.kind === 'widget') return `${object.label}: ${object.value}`;
  if (object.kind === 'chart') return object.chart.title || 'Chart';
  if (object.kind === 'table') return [object.columns.join(' | '), ...object.rows.map((row) => row.join(' | '))].join('\n');
  if (object.kind === 'diagram') return object.items.map((item) => item.subtitle ? `${item.title} — ${item.subtitle}` : item.title).join('\n');
  return '';
}

function slidePageXml(slide: PresentSlide, index: number): string {
  let frames = textShape(slide.title || `Slide ${index + 1}`, 1.5, 1.0, 22.0, 2.0, 'gr-title');
  if (slide.subtitle) frames += textShape(slide.subtitle, 1.5, 3.2, 22.0, 1.5, 'gr-body');
  const body = [...(slide.bulletPoints ?? []), ...(slide.cards ?? []).flatMap((card) => [card.title, card.description]), ...(slide.sceneObjects ?? []).map(sceneText).filter(Boolean)].join('\n');
  if (body) frames += textShape(body, 1.8, 5.0, 21.4, 8.5, 'gr-body');
  return `<draw:page draw:name="${escapeXml(slide.title || `Slide ${index + 1}`)}" draw:style-name="dp1" draw:master-page-name="Default">${frames}<presentation:notes><draw:page-thumbnail draw:page-number="${index + 1}"/><draw:frame svg:x="2cm" svg:y="14cm" svg:width="20cm" svg:height="3cm"><draw:text-box><text:p>${escapeXml(slide.speakerNotes || '')}</text:p></draw:text-box></draw:frame></presentation:notes></draw:page>`;
}


function odpPageSize(aspectRatio: string | undefined): { widthCm: number; heightCm: number } {
  const raw = String(aspectRatio || '16:9').trim();
  if (raw === '16:10') return { widthCm: 33.867, heightCm: 21.167 };
  if (raw === '4:3') return { widthCm: 28, heightCm: 21 };
  if (/^A4$/i.test(raw)) return { widthCm: 29.7, heightCm: 21 };
  if (/^Letter$/i.test(raw)) return { widthCm: 27.94, heightCm: 21.59 };
  const match = /^([0-9]+(?:\.[0-9]+)?)\s*[:x/]\s*([0-9]+(?:\.[0-9]+)?)$/i.exec(raw);
  if (match) {
    const ratio = Math.max(0.25, Math.min(4, Number(match[1]) / Number(match[2])));
    const long = 33.867;
    return ratio >= 1 ? { widthCm: long, heightCm: long / ratio } : { widthCm: long * ratio, heightCm: long };
  }
  return { widthCm: 33.867, heightCm: 19.05 };
}

function baseStylesXml(model: PresentDocumentModel): string {
  const page = odpPageSize(model.aspectRatio);
  return `<?xml version="1.0" encoding="UTF-8"?><office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.3"><office:styles/><office:automatic-styles><style:page-layout style:name="PM1"><style:page-layout-properties fo:margin-top="0cm" fo:margin-bottom="0cm" fo:margin-left="0cm" fo:margin-right="0cm" fo:page-width="${page.widthCm.toFixed(3)}cm" fo:page-height="${page.heightCm.toFixed(3)}cm" style:print-orientation="landscape"/></style:page-layout><style:style style:name="Mdp1" style:family="drawing-page"><style:drawing-page-properties draw:fill="solid" draw:fill-color="#0c1222"/></style:style></office:automatic-styles><office:master-styles><style:master-page style:name="Default" style:page-layout-name="PM1" draw:style-name="Mdp1"/></office:master-styles></office:document-styles>`;
}
function baseContentXml(model: PresentDocumentModel): string {
  return `<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.3"><office:automatic-styles><style:style style:name="dp1" style:family="drawing-page"><style:drawing-page-properties draw:fill="solid" draw:fill-color="#0c1222" presentation:display-header="false" presentation:display-footer="false" presentation:display-page-number="false" presentation:display-date-time="false"/></style:style><style:style style:name="gr-title" style:family="graphic"><style:graphic-properties draw:stroke="none" draw:fill="none"/><style:paragraph-properties fo:text-align="start"/></style:style><style:style style:name="gr-body" style:family="graphic"><style:graphic-properties draw:stroke="none" draw:fill="none"/><style:paragraph-properties fo:text-align="start"/></style:style></office:automatic-styles><office:body><office:presentation>${model.slides.slice(0, MAX_SLIDES).map(slidePageXml).join('')}<presentation:settings presentation:mouse-visible="false"/></office:presentation></office:body></office:document-content>`;
}

export function exportOdp(doc: WorkspaceDocument): Uint8Array {
  if (doc.kind !== 'Present' || !doc.presentData?.slides.length) throw new Error('ODP export requires a non-empty Present document.');
  const model = doc.presentData;
  const entries: ZipEntry[] = [
    { name: 'mimetype', data: utf8('application/vnd.oasis.opendocument.presentation') },
    { name: 'content.xml', data: utf8(baseContentXml(model)) },
    { name: 'styles.xml', data: utf8(baseStylesXml(model)) },
    { name: 'meta.xml', data: utf8(`<?xml version="1.0" encoding="UTF-8"?><office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.3"><office:meta><dc:title>${escapeXml(doc.title)}</dc:title><dc:creator>VGT Workspace</dc:creator></office:meta></office:document-meta>`) },
    { name: 'settings.xml', data: utf8('<?xml version="1.0" encoding="UTF-8"?><office:document-settings xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:version="1.3"><office:settings/></office:document-settings>') },
    { name: 'vgt/present.json', data: utf8(JSON.stringify(model)) },
  ];
  const reserved = new Set(entries.map((entry) => entry.name).concat('META-INF/manifest.xml'));
  let preservedTotal = 0;
  for (const part of model.interopPreservedParts ?? []) {
    if (part.format !== 'odp' || !SAFE_PASSIVE_XML.test(part.path) || reserved.has(part.path) || part.content.length > 512 * 1024 || preservedTotal + part.content.length > MAX_PRESERVED_TOTAL_CHARS) continue;
    validateXml(part.content);
    entries.push({ name: part.path, data: utf8(part.content) });
    reserved.add(part.path);
    preservedTotal += part.content.length;
  }
  const manifestEntries = entries.map((entry) => `<manifest:file-entry manifest:full-path="${escapeXml(entry.name)}" manifest:media-type="${entry.name === 'mimetype' ? 'text/plain' : entry.name.endsWith('.xml') ? 'text/xml' : entry.name.endsWith('.json') ? 'application/json' : ''}"/>`).join('');
  entries.push({ name: 'META-INF/manifest.xml', data: utf8(`<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.presentation"/>${manifestEntries}</manifest:manifest>`) });
  return writeStoredZip(entries);
}
