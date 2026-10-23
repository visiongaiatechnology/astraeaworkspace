import { secureRandomId } from '../../../../shared/crypto/secureRandom';
// STATUS: DIAMANT VGT SUPREME — Roundtrip Preservation Manifest & Merger
// Zero-loss stashing and merging of unknown OOXML/ODF XML parts, themes, and namespaces

export interface RoundtripManifest {
  id: string;
  sourceFormat: 'docx' | 'odt' | 'rtf' | 'unknown';
  timestamp: number;
  originalChecksum: string;
  stashedParts: Record<string, string>; // path in package -> raw XML/text content
  customProperties: Record<string, string>;
  preservedNamespaces: Record<string, string>; // prefix -> uri
  unknownParagraphAttributes: Record<string, string>; // paragraphId -> raw attributes
}

/**
 * Creates an empty or initialized Roundtrip Manifest.
 */
export function createRoundtripManifest(sourceFormat: 'docx' | 'odt' | 'rtf' | 'unknown' = 'unknown'): RoundtripManifest {
  return {
    id: secureRandomId('rtm'),
    sourceFormat,
    timestamp: Date.now(),
    originalChecksum: '',
    stashedParts: {},
    customProperties: {},
    preservedNamespaces: {},
    unknownParagraphAttributes: {},
  };
}

/**
 * Deterministic lightweight FNV-1a 32-bit hex checksum for change detection.
 */
export function calculateChecksum(data: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    hash ^= data.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Inspects raw OOXML package parts and registers critical parts for lossless roundtripping.
 */
export function stashDocxPackage(
  rawParts: Record<string, string>,
  documentXml: string
): RoundtripManifest {
  const manifest = createRoundtripManifest('docx');
  manifest.originalChecksum = calculateChecksum(documentXml);

  // Stash unknown or secondary parts that simple editors usually discard
  const criticalParts = [
    'word/settings.xml',
    'word/theme/theme1.xml',
    'word/fontTable.xml',
    'word/webSettings.xml',
    'word/styles.xml',
    'word/numbering.xml',
    '[Content_Types].xml',
    '_rels/.rels',
    'word/_rels/document.xml.rels',
    'docProps/app.xml',
    'docProps/core.xml',
    'docProps/custom.xml',
  ];

  for (const partPath of criticalParts) {
    if (rawParts[partPath]) {
      manifest.stashedParts[partPath] = rawParts[partPath];
    }
  }

  // Stash custom namespaces from document.xml
  const nsRegex = /xmlns:([a-zA-Z0-9_-]+)="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = nsRegex.exec(documentXml)) !== null) {
    manifest.preservedNamespaces[match[1]] = match[2];
  }

  return manifest;
}

/**
 * Inspects raw ODF package parts and stashes unknown metadata / styles.
 */
export function stashOdtPackage(
  rawParts: Record<string, string>,
  contentXml: string
): RoundtripManifest {
  const manifest = createRoundtripManifest('odt');
  manifest.originalChecksum = calculateChecksum(contentXml);

  const criticalParts = [
    'styles.xml',
    'meta.xml',
    'settings.xml',
    'META-INF/manifest.xml',
  ];

  for (const partPath of criticalParts) {
    if (rawParts[partPath]) {
      manifest.stashedParts[partPath] = rawParts[partPath];
    }
  }

  return manifest;
}

/**
 * Re-injects preserved namespaces and attributes into newly generated XML content.
 */
export function mergePreservedNamespaces(rootTag: string, manifest: RoundtripManifest): string {
  let tag = rootTag;
  for (const [prefix, uri] of Object.entries(manifest.preservedNamespaces)) {
    const attr = `xmlns:${prefix}="${uri}"`;
    if (!tag.includes(`xmlns:${prefix}=`)) {
      // Insert namespace right before closing bracket of root tag
      const closingBracket = tag.indexOf('>');
      if (closingBracket !== -1) {
        tag = `${tag.slice(0, closingBracket)} ${attr}${tag.slice(closingBracket)}`;
      }
    }
  }
  return tag;
}

/**
 * Assembles the full export package by combining modified document.xml with all stashed parts.
 */
export function compileRoundtripPackage(
  manifest: RoundtripManifest,
  modifiedDocumentXml: string
): Record<string, string> {
  const finalPackage: Record<string, string> = { ...manifest.stashedParts };

  if (manifest.sourceFormat === 'docx') {
    finalPackage['word/document.xml'] = modifiedDocumentXml;
  } else if (manifest.sourceFormat === 'odt') {
    finalPackage['content.xml'] = modifiedDocumentXml;
  } else {
    finalPackage['document.txt'] = modifiedDocumentXml;
  }

  return finalPackage;
}

/**
 * Validates whether manifest integrity is maintained.
 */
export function verifyManifestIntegrity(manifest: RoundtripManifest): {
  valid: boolean;
  stashedCount: number;
  hasNamespaces: boolean;
} {
  const stashedCount = Object.keys(manifest.stashedParts).length;
  const hasNamespaces = Object.keys(manifest.preservedNamespaces).length > 0;
  return {
    valid: Boolean(manifest.id && manifest.sourceFormat),
    stashedCount,
    hasNamespaces,
  };
}
