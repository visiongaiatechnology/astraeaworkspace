// STATUS: DIAMANT VGT SUPREME — extension-independent Workspace container magic boundary.
import { VWC_MAX_CONTAINER_BYTES, WORKSPACE_DOCUMENT_EXTENSIONS } from './vwcStorage';

export const WORKSPACE_CONTAINER_EXTENSIONS: readonly string[] = Object.freeze([
  'vwc',
  ...WORKSPACE_DOCUMENT_EXTENSIONS,
]);

const WORKSPACE_CONTAINER_EXTENSION_SET = new Set(WORKSPACE_CONTAINER_EXTENSIONS);
export const WORKSPACE_FILE_PICKER_ACCEPT = [
  ...WORKSPACE_CONTAINER_EXTENSIONS.map((extension) => `.${extension}`),
  '.pdf', '.docx', '.xlsx', '.pptx',
].join(',');

function startsAscii(bytes: Uint8Array, value: string): boolean {
  if (bytes.byteLength < value.length) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (bytes[index] !== value.charCodeAt(index)) return false;
  }
  return true;
}

export function assertWorkspaceContainerMagic(fileName: string, bytes: Uint8Array): void {
  const normalized = fileName.normalize('NFC').trim();
  if (!normalized || normalized.length > 512 || /[\u0000-\u001f]/u.test(normalized)) {
    throw new Error('Workspace container name boundary violation');
  }
  const dot = normalized.lastIndexOf('.');
  const extension = dot >= 0 ? normalized.slice(dot + 1).toLocaleLowerCase('en-US') : '';
  if (!WORKSPACE_CONTAINER_EXTENSION_SET.has(extension)) throw new Error('Workspace container extension is not supported');
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 4 || bytes.byteLength > VWC_MAX_CONTAINER_BYTES) {
    throw new Error('Workspace container size boundary violation');
  }

  const browserMagic = startsAscii(bytes, 'VGT0') || startsAscii(bytes, 'VGT1') || startsAscii(bytes, 'VGT2')
    || startsAscii(bytes, 'VGT3') || startsAscii(bytes, 'VGT4') || startsAscii(bytes, 'VGT5');
  const nativeVwc = startsAscii(bytes, 'VWC1');
  const topSecret = startsAscii(bytes, 'VGATS001');
  const standaloneInfinity = startsAscii(bytes, 'VGTINF02');
  if (!browserMagic && !nativeVwc && !topSecret && !standaloneInfinity) {
    throw new Error('Workspace container magic mismatch');
  }
}
