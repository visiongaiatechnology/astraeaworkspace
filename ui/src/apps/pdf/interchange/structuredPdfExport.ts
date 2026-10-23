import type { PdfBase14Font, PdfDocumentModel, PdfFormField, PdfFormFieldValue, PdfLinkObject } from '../../../shared/contracts/workspace';
import { normalizePdfFormFields, recalculatePdfForm, validatePdfForm } from '../forms/model/pdfAcroFormModel';
import { getPdfSrgbIccProfile } from '../../../shared/pdf/output-intents/pdfSrgbIccProfile';
import { buildPdfLinkAnnotationBody, directEditFontResourceName, renderDirectEditObjects, type PdfStructureSpec } from '../editing/structuredPdfEditRendering';
import { appendStructuredPdfOutlines } from '../navigation/pdfStructuredNavigation';
import { addStructuredPdfFontResources } from './structuredPdfFontResources';
import { pdfByteStringLiteral, pdfUnicodeTextString, pdfWinAnsiLiteral } from '../../../platform/interop/pdf/pdfTextStrings';
import { buildStructuredPdfPageLayout } from '../layout/pdfStructuredLayout';
import { renderStructuredPdfOcrLayer } from './ocr/structuredPdfOcr';
import { assertPdfActiveContentEliminated } from './security/pdfActiveContentElimination';
import { deliverExportBytes, type ExportDeliveryResult } from '../../../shared/interchange/exportDelivery';
import { assertPdfExportArtifact } from '../../../platform/rendering/documentPdfExport';
export interface StructuredPdfExportOptions {
  /** Emit an ISO 32000 logical structure tree with deterministic reading order. */
  taggedStructure?: boolean;
  /** Embed the audited sRGB ICC profile as an OutputIntent. */
  includeSrgbOutputIntent?: boolean;
  /** BCP-47-ish document language written into the Catalog when tagged output is enabled. */
  language?: string;
  /** Reuse byte-identical resource objects such as form appearance XObjects. */
  deduplicateResources?: boolean;
  /**
   * Draw every form field into the page content and omit the interactive structures (`/AcroForm`, widgets).
   *
   * This is the irreversible flatten: the values become page content, so a reader can no longer change them
   * and no field structure remains. The UI must warn before using it — the visible gate is
   * `forms/model/pdfFormDestructiveGuard.ts`, which the form filler calls before it touches the model — which
   * is why the outcome below reports how many fields were flattened.
   */
  flattenFormFields?: boolean;
}

/** What an export produced, beyond the bytes: the caller needs real numbers to report, not a claim. */
export interface StructuredPdfExportOutcome {
  readonly bytes: Uint8Array;
  /** Fields whose appearance was drawn into the page content because `flattenFormFields` was set. */
  readonly flattenedFormFields: number;
  /** Fields that remain interactive widget annotations in the output. */
  readonly interactiveFormFields: number;
}
const pdfRgb = (hex: string | undefined): [number, number, number] | null => {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
};
const boxArray = (box: { x: number; y: number; width: number; height: number }): string =>
  `[${box.x.toFixed(2)} ${box.y.toFixed(2)} ${(box.x + box.width).toFixed(2)} ${(box.y + box.height).toFixed(2)}]`;
const bytesToHex = (bytes: Uint8Array): string => {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0').toUpperCase();
  return out;
};
const MAX_STRUCTURED_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_STRUCTURED_IMAGES_PER_PAGE = 64;
interface JpegInspection {
  width: number;
  height: number;
  components: 1 | 3 | 4;
}
const inspectJpeg = (bytes: Uint8Array): JpegInspection => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Structured PDF image is not a valid JPEG stream.');
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) throw new Error('Structured PDF JPEG contains an invalid segment length.');
    const isSof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (isSof) {
      if (segmentLength < 8) throw new Error('Structured PDF JPEG SOF segment is truncated.');
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const components = bytes[offset + 7];
      if (width < 1 || height < 1 || width > 32_768 || height > 32_768) throw new Error('Structured PDF JPEG dimensions exceed policy.');
      if (components !== 1 && components !== 3 && components !== 4) throw new Error('Structured PDF JPEG component count is unsupported.');
      return { width, height, components };
    }
    offset += segmentLength;
  }
  throw new Error('Structured PDF JPEG does not contain a supported SOF marker.');
};
const jpegBytesFromDataUrl = (dataUrl: string): Uint8Array => {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/u.exec(dataUrl);
  if (!match) throw new Error('Structured PDF images must be normalized local JPEG data URLs.');
  if (match[1].length > Math.ceil(MAX_STRUCTURED_IMAGE_BYTES * 4 / 3) + 8) throw new Error('Structured PDF JPEG exceeds the encoded-size policy.');
  const decoded = atob(match[1]);
  if (decoded.length < 1 || decoded.length > MAX_STRUCTURED_IMAGE_BYTES) throw new Error('Structured PDF JPEG exceeds the byte-size policy.');
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
};
const normalizePdfLanguage = (value: string | undefined): string => {
  const language = (value ?? '').trim();
  if (!language) return 'en-US';
  if (language.length > 64 || !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(language)) {
    throw new Error('PDF document language must be a bounded BCP-47 language tag.');
  }
  return language;
};

const pdfValueText = (value: PdfFormFieldValue): string => {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'Off';
  return value;
};

const pdfOptionArray = (options: readonly string[] | undefined): string =>
  `[${(options ?? []).map((option) => pdfUnicodeTextString(option)).join(' ')}]`;

const fieldFlags = (field: PdfFormField): number => {
  let flags = 0;
  if (field.readOnly || field.calculation) flags |= 1;
  if (field.required) flags |= 2;
  if (field.type === 'radio') flags |= 32768;
  if (field.type === 'button') flags |= 65536;
  if (field.type === 'dropdown') flags |= 131072;
  if (field.type === 'list' && Array.isArray(field.value)) flags |= 2097152;
  return flags;
};

const formFieldDictionary = (field: PdfFormField, pageObjectId: number, appearanceEntry: string): string => {
  const flags = fieldFlags(field);
  const base = [
    '/Type /Annot',
    '/Subtype /Widget',
    `/Rect ${boxArray(field.bounds)}`,
    `/P ${pageObjectId} 0 R`,
    `/T ${pdfUnicodeTextString(field.name)}`,
    field.tooltip ? `/TU ${pdfUnicodeTextString(field.tooltip)}` : '',
    flags ? `/Ff ${flags}` : '',
    appearanceEntry,
  ].filter(Boolean);
  const value = pdfValueText(field.value);
  const defaultValue = field.defaultValue === undefined ? undefined : pdfValueText(field.defaultValue);
  switch (field.type) {
    case 'text':
      base.push('/FT /Tx', `/V ${pdfUnicodeTextString(value)}`, defaultValue !== undefined ? `/DV ${pdfUnicodeTextString(defaultValue)}` : '', '/DA (/F1 10 Tf 0 g)');
      if (field.validation?.maxLength !== undefined) base.push(`/MaxLen ${Math.max(0, Math.trunc(field.validation.maxLength))}`);
      break;
    case 'checkbox': {
      const state = field.value ? 'Yes' : 'Off';
      const defaultState = field.defaultValue ? 'Yes' : 'Off';
      base.push('/FT /Btn', `/V /${state}`, `/AS /${state}`, `/DV /${defaultState}`);
      break;
    }
    case 'radio': {
      // A name object, not a string: only ASCII letters, digits, `_`, `.` and `-` are legal there.
  const radioState = value ? value.replace(/[^A-Za-z0-9_.-]/g, '_') : 'Off';
      base.push('/FT /Btn', `/V /${radioState}`, `/AS /${radioState}`, field.options?.length ? `/Opt ${pdfOptionArray(field.options)}` : '');
      break;
    }
    case 'dropdown':
    case 'list':
      base.push('/FT /Ch', `/Opt ${pdfOptionArray(field.options)}`, Array.isArray(field.value) ? `/V ${pdfOptionArray(field.value)}` : `/V ${pdfUnicodeTextString(value)}`, defaultValue !== undefined ? `/DV ${pdfUnicodeTextString(defaultValue)}` : '', '/DA (/F1 10 Tf 0 g)');
      break;
    case 'button':
      base.push('/FT /Btn', field.label ? `/MK << /CA ${pdfUnicodeTextString(field.label)} >>` : '');
      break;
    case 'signature':
      base.push('/FT /Sig');
      break;
  }
  return `<< ${base.filter(Boolean).join(' ')} >>`;
};


const appearanceTextForField = (field: PdfFormField, checked = Boolean(field.value)): string => {
  if (field.type === 'checkbox') return checked ? 'X' : '';
  if (field.type === 'radio') return checked ? '(*)' : '( )';
  if (field.type === 'button') return field.label || field.name;
  if (field.type === 'signature') return pdfValueText(field.value) || '[Unsigned]';
  const value = pdfValueText(field.value);
  return value || (field.label ? `[${field.label}]` : '');
};

/**
 * The drawing commands of a field's appearance, in the field's own local space (0,0 → width,height).
 *
 * Extracted so that the **same** commands serve two callers: the appearance XObject of a live widget, and —
 * with flattening enabled — the page content stream itself. A second set of drawing commands for the flattened
 * case would be a second truth about how a field looks.
 */
const appearanceCommands = (field: PdfFormField, text: string): string[] => {
  const width = Math.max(1, field.bounds.width);
  const height = Math.max(1, field.bounds.height);
  const baseline = Math.max(3, Math.min(height - 3, height * 0.5 - 3));
  const fontSize = Math.max(6, Math.min(11, height * 0.45));
  return [
    'q',
    '1 1 1 rg',
    `0 0 ${width.toFixed(2)} ${height.toFixed(2)} re f`,
    '0.65 0.68 0.72 RG',
    `0.5 0.5 ${Math.max(0, width - 1).toFixed(2)} ${Math.max(0, height - 1).toFixed(2)} re S`,
    'BT',
    `/F1 ${fontSize.toFixed(1)} Tf`,
    '0 0 0 rg',
    `1 0 0 1 3 ${baseline.toFixed(2)} Tm`,
    `(${pdfWinAnsiLiteral(text).slice(0, 512)}) Tj`,
    'ET',
    'Q',
  ];
};

const buildAppearanceStream = (field: PdfFormField, fontObjectId: number, text: string): string => {
  const width = Math.max(1, field.bounds.width);
  const height = Math.max(1, field.bounds.height);
  const stream = appearanceCommands(field, text).join('\n');
  const length = new TextEncoder().encode(stream).length;
  return `<< /Type /XObject /Subtype /Form /BBox [0 0 ${width.toFixed(2)} ${height.toFixed(2)}] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Length ${length} >>\nstream\n${stream}\nendstream`;
};

/**
 * Places a field's appearance directly on the page: the same commands, translated to the field's rectangle.
 *
 * This is what makes "flatten" real rather than a label: the value becomes page content and the interactive
 * widget disappears, so no reader can change it back and no `/AcroForm` remains.
 */
const flattenedFieldCommands = (field: PdfFormField): string[] => {
  const text = appearanceTextForField(field);
  return [
    'q',
    `1 0 0 1 ${field.bounds.x.toFixed(2)} ${field.bounds.y.toFixed(2)} cm`,
    ...appearanceCommands(field, text),
    'Q',
  ];
};

export function buildStructuredPdfBytes(
  title: string,
  inputModel: PdfDocumentModel,
  options: StructuredPdfExportOptions = {},
): Uint8Array {
  return buildStructuredPdfBytesDetailed(title, inputModel, options).bytes;
}

/**
 * The one exporter. `buildStructuredPdfBytes` is a thin view of it, so there is no second writer and the
 * flatten outcome cannot drift from the bytes it describes.
 */
export function buildStructuredPdfBytesDetailed(
  title: string,
  inputModel: PdfDocumentModel,
  options: StructuredPdfExportOptions = {},
): StructuredPdfExportOutcome {
  const model = recalculatePdfForm(inputModel);
  const formIssues = validatePdfForm(model);
  if (formIssues.length) throw new Error(`PDF form validation failed: ${formIssues[0].fieldName || 'form'} ${formIssues[0].message}`);
  const formFields = normalizePdfFormFields(model);
  const flattenFormFields = options.flattenFormFields === true;
  let flattenedFormFields = 0;
  const width = 595.28;
  const height = 841.89;
  const objects: string[] = [];
  const add = (body: string) => { objects.push(body); return objects.length; };
  const sharedResourceObjects = new Map<string, number>();
  const addSharedResource = (body: string): number => {
    if (!options.deduplicateResources) return add(body);
    const existing = sharedResourceObjects.get(body);
    if (existing) return existing;
    const id = add(body);
    sharedResourceObjects.set(body, id);
    return id;
  };
  add('<< /Type /Catalog /Pages 2 0 R >>');
  const pagesId = add('');
  const sourcePages = model.pages.length ? model.pages : [{ pageNumber: 1, title, sections: [] }];
  const { fontRegular, dictionary: fontResourceDictionary } = addStructuredPdfFontResources(sourcePages, add);
  const taggedStructure = options.taggedStructure === true;
  const structTreeRootId = taggedStructure ? add('') : 0;
  const pageIds: number[] = [];
  const formWidgetIds: number[] = [];
  const pageLabelEntries: string[] = [];
  const pageStructureSpecs: PdfStructureSpec[][] = [];
  const pendingLinkAnnotations: Array<{ objectId: number; pageId: number; link: PdfLinkObject }> = [];

  sourcePages.forEach((page, pageIndex) => {
    const mediaBox = page.mediaBox ?? { x: 0, y: 0, width, height };
    const pageWidth = mediaBox.width;
    const pageHeight = mediaBox.height;
    const commands: string[] = [];
    const structureSpecs: PdfStructureSpec[] = [];
    let nextMcid = 0;
    const pageImages = page.images ?? [];
    if (pageImages.length > MAX_STRUCTURED_IMAGES_PER_PAGE) throw new Error(`Page ${page.pageNumber} exceeds the structured image-count policy.`);
    const imageResources = pageImages.map((image, imageIndex) => {
      const bytes = jpegBytesFromDataUrl(image.dataUrl);
      const inspected = inspectJpeg(bytes);
      if (inspected.width !== image.widthPx || inspected.height !== image.heightPx) throw new Error(`Page ${page.pageNumber} image ${image.id} dimensions do not match its JPEG payload.`);
      const colorSpace = inspected.components === 1 ? '/DeviceGray' : inspected.components === 4 ? '/DeviceCMYK' : '/DeviceRGB';
      const hex = `${bytesToHex(bytes)}>`;
      const objectId = add(`<< /Type /XObject /Subtype /Image /Width ${inspected.width} /Height ${inspected.height} /ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${hex.length} >>\nstream\n${hex}\nendstream`);
      return { image, objectId, resourceName: `Im${imageIndex + 1}` };
    });
    const background = pdfRgb(page.decorations?.backgroundColor);
    if (background) {
      if (taggedStructure) commands.push('/Artifact BMC');
      commands.push(`${background[0].toFixed(4)} ${background[1].toFixed(4)} ${background[2].toFixed(4)} rg`);
      commands.push(`${mediaBox.x.toFixed(2)} ${mediaBox.y.toFixed(2)} ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)} re f`);
      commands.push('0 0 0 rg');
      if (taggedStructure) commands.push('EMC');
    }
    const directEdit = renderDirectEditObjects(page, imageResources, taggedStructure, nextMcid);
    commands.push(...directEdit.commands);
    structureSpecs.push(...directEdit.structureSpecs);
    nextMcid = directEdit.nextMcid;
    const screenPrintLayout = buildStructuredPdfPageLayout(page, pageIndex, sourcePages.length, model.annotations);
    commands.push('BT');
    const writeLayoutLine = (text: string, x: number, baseline: number, size: number, font: PdfBase14Font, color?: string) => {
      const rgb = pdfRgb(color);
      commands.push(`/${directEditFontResourceName(font)} ${size.toFixed(1)} Tf`);
      if (rgb) commands.push(`${rgb[0].toFixed(4)} ${rgb[1].toFixed(4)} ${rgb[2].toFixed(4)} rg`);
      commands.push(`1 0 0 1 ${x.toFixed(2)} ${baseline.toFixed(2)} Tm`);
      commands.push(`(${pdfWinAnsiLiteral(text)}) Tj`);
      if (rgb) commands.push('0 0 0 rg');
    };

    for (const block of screenPrintLayout.flowBlocks) {
      if (block.artifact) {
        if (taggedStructure) commands.push('/Artifact BMC');
      } else if (taggedStructure) {
        const mcid = nextMcid++;
        const contentRole = block.role === 'Table' ? 'TD' : block.role;
        commands.push(`/${contentRole} <</MCID ${mcid}>> BDC`);
        if (block.role === 'Table') structureSpecs.push({ role: 'Table', children: [{ role: 'TR', children: [{ role: 'TD', mcid }] }] });
        else structureSpecs.push({ role: block.role, mcid });
      }
      block.lines.forEach((line, lineIndex) => writeLayoutLine(line, block.x, block.baselines[lineIndex], block.fontSize, block.font, block.color));
      if (taggedStructure) commands.push('EMC');
    }

    for (const item of screenPrintLayout.fixedText) {
      if (taggedStructure) commands.push('/Artifact BMC');
      writeLayoutLine(item.text, item.x, item.baseline, item.fontSize, item.font, item.color);
      if (taggedStructure) commands.push('EMC');
    }
    const ocrRender = renderStructuredPdfOcrLayer(page.ocrLayer, taggedStructure, nextMcid);
    commands.push(...ocrRender.commands);
    structureSpecs.push(...ocrRender.structureSpecs);
    nextMcid = ocrRender.nextMcid;
    commands.push('ET');
    const pageFormFields = formFields.filter((field) => field.page === page.pageNumber).sort((a, b) => (a.tabOrder ?? 0) - (b.tabOrder ?? 0) || a.name.localeCompare(b.name));
    // Flatten: the appearance is drawn into the page content **before** the stream is closed, and no widget
    // object is created for it. The values therefore become page content — irreversible by construction,
    // because there is nothing left to edit.
    if (flattenFormFields && pageFormFields.length > 0) {
      for (const field of pageFormFields) {
        commands.push(...flattenedFieldCommands(field));
        flattenedFormFields += 1;
      }
    }
    const stream = commands.join('\n');
    const length = new TextEncoder().encode(stream).length;
    const contentId = add(`<< /Length ${length} >>\nstream\n${stream}\nendstream`);
    const pageId = add('');
    const widgetIds = flattenFormFields ? [] : pageFormFields.map((field) => {
      let appearanceEntry = '';
      if (field.type === 'checkbox') {
        const yesId = addSharedResource(buildAppearanceStream(field, fontRegular, appearanceTextForField(field, true)));
        const offId = addSharedResource(buildAppearanceStream(field, fontRegular, appearanceTextForField(field, false)));
        appearanceEntry = `/AP << /N << /Yes ${yesId} 0 R /Off ${offId} 0 R >> >>`;
      } else if (field.type === 'radio') {
        const rawState = pdfValueText(field.value) || 'Off';
        const state = rawState.replace(/[^A-Za-z0-9_.-]/g, '_');
        const onId = addSharedResource(buildAppearanceStream(field, fontRegular, appearanceTextForField(field, true)));
        const offId = addSharedResource(buildAppearanceStream(field, fontRegular, appearanceTextForField(field, false)));
        appearanceEntry = `/AP << /N << /${state} ${onId} 0 R /Off ${offId} 0 R >> >>`;
      } else {
        const normalId = addSharedResource(buildAppearanceStream(field, fontRegular, appearanceTextForField(field)));
        appearanceEntry = `/AP << /N ${normalId} 0 R >>`;
      }
      return add(formFieldDictionary(field, pageId, appearanceEntry));
    });
    formWidgetIds.push(...widgetIds);
    const rotation = page.rotation ?? 0;
    const rotateEntry = rotation ? ` /Rotate ${rotation}` : '';
    const cropEntry = page.cropBox ? ` /CropBox ${boxArray(page.cropBox)}` : '';
    const trimEntry = page.trimBox ? ` /TrimBox ${boxArray(page.trimBox)}` : '';
    const bleedEntry = page.bleedBox ? ` /BleedBox ${boxArray(page.bleedBox)}` : '';
    const artEntry = page.artBox ? ` /ArtBox ${boxArray(page.artBox)}` : '';
    const linkIds = (page.links ?? []).map((link) => {
      const objectId = add('');
      pendingLinkAnnotations.push({ objectId, pageId, link });
      return objectId;
    });
    const allAnnotationIds = [...widgetIds, ...linkIds];
    const annotsEntry = allAnnotationIds.length ? ` /Annots [${allAnnotationIds.map((id) => `${id} 0 R`).join(' ')}] /Tabs /A` : '';
    const structParentsEntry = taggedStructure ? ` /StructParents ${pageIndex}` : '';
    const imageResourceEntry = imageResources.length ? ` /XObject << ${imageResources.map((resource) => `/${resource.resourceName} ${resource.objectId} 0 R`).join(' ')} >>` : '';
    objects[pageId - 1] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox ${boxArray(mediaBox)}${cropEntry}${trimEntry}${bleedEntry}${artEntry}${rotateEntry}${annotsEntry}${structParentsEntry} /Resources << /Font << ${fontResourceDictionary} >>${imageResourceEntry} >> /Contents ${contentId} 0 R >>`;
    pageIds.push(pageId);
    pageStructureSpecs.push(structureSpecs);
    if (page.pageLabel) pageLabelEntries.push(`${pageIndex} << /P ${pdfUnicodeTextString(page.pageLabel)} >>`);
  });

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  for (const pending of pendingLinkAnnotations) {
    const targetPageId = pending.link.target.kind === 'page' ? pageIds[pending.link.target.pageNumber - 1] : undefined;
    objects[pending.objectId - 1] = buildPdfLinkAnnotationBody(pending.link, pending.pageId, targetPageId);
  }

  if (taggedStructure) {
    const rootKids: number[] = [];
    const parentTreeEntries: string[] = [];
    const documentStructId = add('');
    const buildStructElem = (spec: PdfStructureSpec, pageId: number, parentId: number, leafByMcid: Map<number, number>): number => {
      const id = add('');
      const childIds = (spec.children ?? []).map((child) => buildStructElem(child, pageId, id, leafByMcid));
      const k = spec.mcid !== undefined ? String(spec.mcid) : `[${childIds.map((childId) => `${childId} 0 R`).join(' ')}]`;
      const altEntry = spec.alt ? ` /Alt ${pdfUnicodeTextString(spec.alt)}` : '';
      objects[id - 1] = `<< /Type /StructElem /S /${spec.role} /P ${parentId} 0 R /Pg ${pageId} 0 R /K ${k}${altEntry} >>`;
      if (spec.mcid !== undefined) leafByMcid.set(spec.mcid, id);
      return id;
    };
    pageStructureSpecs.forEach((specs, pageIndex) => {
      const leafByMcid = new Map<number, number>();
      const pageKids = specs.map((spec) => buildStructElem(spec, pageIds[pageIndex], documentStructId, leafByMcid));
      rootKids.push(...pageKids);
      const maxMcid = leafByMcid.size ? Math.max(...leafByMcid.keys()) : -1;
      const parents: string[] = [];
      for (let mcid = 0; mcid <= maxMcid; mcid += 1) {
        const leaf = leafByMcid.get(mcid);
        if (!leaf) throw new Error(`Tagged PDF structure is missing MCID ${mcid} on page ${pageIndex + 1}.`);
        parents.push(`${leaf} 0 R`);
      }
      parentTreeEntries.push(`${pageIndex} [${parents.join(' ')}]`);
    });
    const parentTreeId = add(`<< /Nums [${parentTreeEntries.join(' ')}] >>`);
    objects[documentStructId - 1] = `<< /Type /StructElem /S /Document /P ${structTreeRootId} 0 R /K [${rootKids.map((id) => `${id} 0 R`).join(' ')}] >>`;
    objects[structTreeRootId - 1] = `<< /Type /StructTreeRoot /K ${documentStructId} 0 R /ParentTree ${parentTreeId} 0 R /ParentTreeNextKey ${pageIds.length} >>`;
  }

  const outlinesId = appendStructuredPdfOutlines(model, sourcePages, pageIds, add, objects);

  let outputIntentId = 0;
  if (options.includeSrgbOutputIntent) {
    const profile = getPdfSrgbIccProfile();
    const hex = `${bytesToHex(profile)}>`;
    const profileId = add(`<< /N 3 /Alternate /DeviceRGB /Length ${hex.length} /Filter /ASCIIHexDecode >>\nstream\n${hex}\nendstream`);
    outputIntentId = add(`<< /Type /OutputIntent /S /GTS_PDFA1 /OutputConditionIdentifier (sRGB) /Info (sRGB IEC61966-2.1 compatible) /DestOutputProfile ${profileId} 0 R >>`);
  }

  const structureCatalog = taggedStructure
    ? ` /StructTreeRoot ${structTreeRootId} 0 R /MarkInfo << /Marked true >> /Lang (${pdfByteStringLiteral(normalizePdfLanguage(options.language))})`
    : '';
  const outputIntentCatalog = outputIntentId ? ` /OutputIntents [${outputIntentId} 0 R]` : '';
  objects[0] = `<< /Type /Catalog /Pages ${pagesId} 0 R${pageLabelEntries.length ? ` /PageLabels << /Nums [${pageLabelEntries.join(' ')}] >>` : ''}${formWidgetIds.length ? ` /AcroForm << /Fields [${formWidgetIds.map((id) => `${id} 0 R`).join(' ')}] /DR << /Font << /F1 ${fontRegular} 0 R >> >> /DA (/F1 10 Tf 0 g) >>` : ''}${structureCatalog}${outputIntentCatalog}${outlinesId ? ` /Outlines ${outlinesId} 0 R /PageMode /UseOutlines` : ''} >>`;
  const infoId = model.metadataSanitized
    ? add('<< /Producer (VGT Workspace) >>')
    : add(`<< /Title ${pdfUnicodeTextString(title)} /Producer (VGT Workspace PDF Studio Structured Export) >>`);
  let pdf = '%PDF-1.4\n%VGTPDF\n';
  const offsets: number[] = [0];
  const enc = new TextEncoder();
  objects.forEach((obj, idx) => {
    offsets.push(enc.encode(pdf).length);
    pdf += `${idx + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = enc.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = enc.encode(pdf);
  assertPdfActiveContentEliminated(bytes);
  return {
    bytes,
    flattenedFormFields,
    interactiveFormFields: formWidgetIds.length,
  };
}

/**
 * Delivers the edited PDF. Release Beta 0.1: on the desktop the bytes are written through the native
 * save dialog + atomic export (`mode:'file'`, name confirmed); the browser fallback is a download.
 */
export async function downloadStructuredPdf(title: string, model: PdfDocumentModel): Promise<ExportDeliveryResult> {
  const bytes = buildStructuredPdfBytes(title, model);
  const safe = (title || 'document').replace(/\.pdf$/i, '').replace(/[^a-z0-9._-]+/gi, '_');
  return deliverExportBytes(bytes, {
    suggestedName: `${safe}_edited.pdf`,
    extensions: ['pdf'],
    mimeType: 'application/pdf',
    assertArtifact: assertPdfExportArtifact,
  });
}
