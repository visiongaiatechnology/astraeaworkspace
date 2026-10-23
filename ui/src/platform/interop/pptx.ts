import { secureRandomId } from '../../shared/crypto/secureRandom';
// STATUS: PLATIN
// Basic OOXML Presentation interoperability: ordered slides and text content.
// Complex media/animations are intentionally not claimed as preserved by this beta adapter.

import type { PresentDocumentModel, PresentSlide, WorkspaceDocument } from '../../shared/contracts/workspace';
import { decodeUtf8, readZip, utf8, writeStoredZip, type ZipEntry } from './zip';
import { escapeXml, extractTextNodes, inspectBoundedForeignXml, readAttribute } from '../../shared/interoperability/xml';
import { stripActiveOfficePackageParts } from './officeHostileIntake';
import { validateOpcPackageGraph } from './officePackageGraph';
import { isValidPresentInteropModel } from '../../apps/present/interoperability/presentModelValidation';

const MAX_XML_CHARS = 32 * 1024 * 1024;
const MAX_SLIDES = 512;
const MAX_PRESERVED_PARTS = 96;
const MAX_PRESERVED_TOTAL_CHARS = 2 * 1024 * 1024;
const VGT_PRESENT_PART = 'ppt/vgt-present.xml';
const SAFE_PASSIVE_XML = /^(?:docProps\/(?:custom|core|app)\.xml|ppt\/(?:presProps|viewProps|tableStyles)\.xml|customXml\/[^/]+\.xml)$/i;

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

function base64ToUtf8(value: string): string {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function parseVgtPresentPart(entries: Map<string, Uint8Array>): PresentDocumentModel | null {
  const bytes = entries.get(VGT_PRESENT_PART);
  if (!bytes || bytes.byteLength > 8 * 1024 * 1024) return null;
  const xml = decodeUtf8(bytes);
  validateXml(xml);
  const match = /<vgt:present\b[^>]*>([A-Za-z0-9+/=]+)<\/vgt:present>/.exec(xml);
  if (!match) return null;
  try {
    const parsed: unknown = JSON.parse(base64ToUtf8(match[1]));
    return isValidPresentInteropModel(parsed) ? parsed : null;
  } catch { return null; }
}

function collectPassiveParts(entries: Map<string, Uint8Array>): NonNullable<PresentDocumentModel['interopPreservedParts']> {
  const parts: NonNullable<PresentDocumentModel['interopPreservedParts']> = [];
  let total = 0;
  for (const [path, bytes] of entries) {
    if (!SAFE_PASSIVE_XML.test(path) || path === 'docProps/core.xml' || path === 'docProps/app.xml') continue;
    if (bytes.byteLength > 512 * 1024 || parts.length >= MAX_PRESERVED_PARTS) continue;
    const content = decodeUtf8(bytes);
    validateXml(content);
    if (total + content.length > MAX_PRESERVED_TOTAL_CHARS) break;
    parts.push({ format: 'pptx', path, content });
    total += content.length;
  }
  return parts;
}

function validateXml(xml: string): void {
  if (xml.length > MAX_XML_CHARS) throw new Error('PPTX XML exceeds beta importer limit');
  inspectBoundedForeignXml(xml);
}

function startTags(xml: string, localName: string): string[] {
  const pattern = new RegExp(`<(?:(?:[A-Za-z_][\\w.-]*):)?${localName}(?:\\s[^>]*)?\\s*/?>`, 'g');
  return xml.match(pattern) ?? [];
}

function normalizeTarget(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/');
  parts.pop();
  for (const segment of target.replace(/\\/g, '/').split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  return parts.join('/');
}

function parseRelationships(xml: string, base: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const tag of startTags(xml, 'Relationship')) {
    const id = readAttribute(tag, 'Id');
    const target = readAttribute(tag, 'Target');
    const type = readAttribute(tag, 'Type') ?? '';
    const targetMode = readAttribute(tag, 'TargetMode');
    if (id && target && targetMode !== 'External' && type.includes('/slide')) {
      out.set(id, normalizeTarget(base, target));
    }
  }
  return out;
}

export async function importPptx(bytes: Uint8Array, fileName: string): Promise<WorkspaceDocument> {
  const { entries } = stripActiveOfficePackageParts(await readZip(bytes, { maxEntries: 4096, maxEntryBytes: 64 * 1024 * 1024, maxTotalUncompressedBytes: 128 * 1024 * 1024, maxCompressionRatio: 100, maxElapsedMs: 5_000 }));
  validateOpcPackageGraph(entries, 'ppt/presentation.xml', 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml');
  const canonical = parseVgtPresentPart(entries);
  if (canonical) {
    const now = Date.now();
    return { schema_version: 1, id: secureRandomId('pptx'), title: fileName.replace(/\.pptx$/i, '') || 'Imported Presentation', kind: 'Present', created_at: now, modified_at: now, version: 1, theme_id: canonical.themeId || 'midnight', root_object_ids: [], objects: {}, presentData: { ...canonical, interopPreservedParts: collectPassiveParts(entries) } };
  }
  const presentationBytes = entries.get('ppt/presentation.xml');
  const relBytes = entries.get('ppt/_rels/presentation.xml.rels');
  if (!presentationBytes || !relBytes || !entries.has('[Content_Types].xml')) throw new Error('Not a valid PPTX package');
  const presentationXml = decodeUtf8(presentationBytes);
  const relXml = decodeUtf8(relBytes);
  validateXml(presentationXml);
  validateXml(relXml);
  const rels = parseRelationships(relXml, 'ppt/presentation.xml');
  const slideTags = startTags(presentationXml, 'sldId');
  if (!slideTags.length) throw new Error('PPTX contains no slides');
  if (slideTags.length > MAX_SLIDES) throw new Error('PPTX slide count exceeds beta importer limit');

  const slides: PresentSlide[] = [];
  for (let index = 0; index < slideTags.length; index++) {
    const relId = slideTags[index].match(/\br:id\s*=\s*[\"']([^\"']+)[\"']/)?.[1] ?? null;
    const path = relId ? rels.get(relId) : undefined;
    if (!path) continue;
    const slideBytes = entries.get(path);
    if (!slideBytes) continue;
    const xml = decodeUtf8(slideBytes);
    validateXml(xml);
    const texts = extractTextNodes(xml, 't').map((text) => text.trim()).filter(Boolean);
    const title = texts[0] || `Slide ${index + 1}`;
    const rest = texts.slice(1);
    slides.push({
      id: `pptx-slide-${index + 1}`,
      title,
      subtitle: rest[0] ?? '',
      layout: rest.length > 1 ? 'bullet-list' : 'blank',
      bulletPoints: rest.length > 1 ? rest.slice(1) : [],
      speakerNotes: '',
      sceneObjects: [],
      images: [],
      animations: [],
      transition: { effect: 'none', durationMs: 0 },
    });
  }
  if (!slides.length) throw new Error('PPTX contains no readable slides');
  const now = Date.now();
  return {
    schema_version: 1,
    id: secureRandomId('pptx'),
    title: fileName.replace(/\.pptx$/i, '') || 'Imported Presentation',
    kind: 'Present',
    created_at: now,
    modified_at: now,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
    presentData: {
      slides,
      theme: 'dark',
      themeId: 'midnight',
      aspectRatio: '16:9',
      interopPreservedParts: collectPassiveParts(entries),
    },
  };
}

function textParagraph(text: string, level = 0): string {
  return `<a:p>${level > 0 ? `<a:pPr lvl="${Math.min(8, level)}"/>` : ''}<a:r><a:rPr lang="en-US" dirty="0"/><a:t>${escapeXml(text)}</a:t></a:r><a:endParaRPr lang="en-US"/></a:p>`;
}

function shapeXml(id: number, name: string, text: string, x: number, y: number, cx: number, cy: number, fontSize: number, bold: boolean): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" rtlCol="0"/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="${fontSize}" b="${bold ? 1 : 0}" dirty="0"/><a:t>${escapeXml(text)}</a:t></a:r><a:endParaRPr lang="en-US" sz="${fontSize}"/></a:p></p:txBody></p:sp>`;
}

function bodyShapeXml(id: number, slide: PresentSlide): string {
  const lines: string[] = [];
  if (slide.subtitle?.trim()) lines.push(textParagraph(slide.subtitle.trim()));
  for (const bullet of slide.bulletPoints ?? []) if (bullet.trim()) lines.push(textParagraph(bullet.trim(), 1));
  for (const card of slide.cards ?? []) {
    if (card.title.trim()) lines.push(textParagraph(card.title.trim(), 1));
    if (card.description.trim()) lines.push(textParagraph(card.description.trim(), 2));
  }
  if (!lines.length) return '';
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Content"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="1920000"/><a:ext cx="10363200" cy="3900000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" rtlCol="0"/><a:lstStyle/>${lines.join('')}</p:txBody></p:sp>`;
}

function slideXml(slide: PresentSlide): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapeXml(2, 'Title', slide.title || 'Untitled Slide', 685800, 457200, 10820400, 1100000, 2800, true)}${bodyShapeXml(3, slide)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function slideMasterXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="VGT Master"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`;
}

function slideLayoutXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
}

function themeXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="VGT Workspace"><a:themeElements><a:clrScheme name="VGT"><a:dk1><a:sysClr val="windowText" lastClr="111827"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1E293B"/></a:dk2><a:lt2><a:srgbClr val="F8FAFC"/></a:lt2><a:accent1><a:srgbClr val="2563EB"/></a:accent1><a:accent2><a:srgbClr val="10B981"/></a:accent2><a:accent3><a:srgbClr val="7C3AED"/></a:accent3><a:accent4><a:srgbClr val="F59E0B"/></a:accent4><a:accent5><a:srgbClr val="EC4899"/></a:accent5><a:accent6><a:srgbClr val="06B6D4"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="VGT"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme><a:fmtScheme name="VGT"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
}


function pptxSlideSize(aspectRatio: string | undefined): { cx: number; cy: number; type: string } {
  const raw = String(aspectRatio || '16:9').trim();
  if (raw === '16:10') return { cx: 12192000, cy: 7620000, type: 'screen16x10' };
  if (raw === '4:3') return { cx: 9144000, cy: 6858000, type: 'screen4x3' };
  if (/^A4$/i.test(raw)) return { cx: 10692000, cy: 7560000, type: 'custom' };
  if (/^Letter$/i.test(raw)) return { cx: 10058400, cy: 7772400, type: 'custom' };
  const match = /^([0-9]+(?:\.[0-9]+)?)\s*[:x/]\s*([0-9]+(?:\.[0-9]+)?)$/i.exec(raw);
  if (match) {
    const ratio = Math.max(0.25, Math.min(4, Number(match[1]) / Number(match[2])));
    const long = 12192000;
    return ratio >= 1 ? { cx: long, cy: Math.round(long / ratio), type: 'custom' } : { cx: Math.round(long * ratio), cy: long, type: 'custom' };
  }
  return { cx: 12192000, cy: 6858000, type: 'screen16x9' };
}
export function exportPptx(doc: WorkspaceDocument): Uint8Array {
  if (doc.kind !== 'Present') throw new Error('PPTX export requires a Present document');
  const presentData = doc.presentData;
  const slides = (presentData?.slides ?? []).slice(0, MAX_SLIDES);
  if (!presentData || !slides.length) throw new Error('Presentation contains no slides');

  const slideSize = pptxSlideSize(presentData.aspectRatio);
  const slideOverrides = slides.map((_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('');
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slideOverrides}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
  const presentationRels = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slides.map((_, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`).join('')}</Relationships>`;
  const presentation = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${slideSize.cx}" cy="${slideSize.cy}" type="${slideSize.type}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;

  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: utf8(contentTypes) },
    { name: '_rels/.rels', data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`) },
    { name: 'ppt/presentation.xml', data: utf8(presentation) },
    { name: 'ppt/_rels/presentation.xml.rels', data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${presentationRels}`) },
    { name: 'ppt/slideMasters/slideMaster1.xml', data: utf8(slideMasterXml()) },
    { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`) },
    { name: 'ppt/slideLayouts/slideLayout1.xml', data: utf8(slideLayoutXml()) },
    { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`) },
    { name: 'ppt/theme/theme1.xml', data: utf8(themeXml()) },
    { name: 'docProps/core.xml', data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXml(doc.title)}</dc:title><dc:creator>VGT Workspace</dc:creator></cp:coreProperties>`) },
    { name: 'docProps/app.xml', data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>VGT Workspace</Application><Slides>${slides.length}</Slides></Properties>`) },
    { name: VGT_PRESENT_PART, data: utf8(`<?xml version="1.0" encoding="UTF-8"?><vgt:present xmlns:vgt="urn:visiongaia:astraea:present:1">${utf8ToBase64(JSON.stringify(presentData))}</vgt:present>`) },
  ];
  slides.forEach((slide, index) => {
    entries.push({ name: `ppt/slides/slide${index + 1}.xml`, data: utf8(slideXml(slide)) });
    entries.push({ name: `ppt/slides/_rels/slide${index + 1}.xml.rels`, data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`) });
  });
  const reserved = new Set(entries.map((entry) => entry.name));
  let preservedTotal = 0;
  for (const part of presentData.interopPreservedParts ?? []) {
    if (part.format !== 'pptx' || !SAFE_PASSIVE_XML.test(part.path) || reserved.has(part.path) || part.content.length > 512 * 1024 || preservedTotal + part.content.length > MAX_PRESERVED_TOTAL_CHARS) continue;
    validateXml(part.content);
    entries.push({ name: part.path, data: utf8(part.content) });
    reserved.add(part.path);
    preservedTotal += part.content.length;
  }
  return writeStoredZip(entries);
}
