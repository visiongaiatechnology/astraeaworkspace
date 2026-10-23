// @vitest-environment happy-dom
// STATUS: PLATIN — PR-009/PR-010 (Present M1): the .vpresent file contract
//
// The native probe P-09 has to save a presentation, close the app, restart it and reopen the
// *file*. The artifact the product produces is a **container** with the `.vpresent` extension
// (`vwcStorage.ts: extensionForDocumentKind('Present')`), and the open handler runs the same
// `assertWorkspaceContainerMagic` boundary as for every workspace file. This witness pins that
// contract from the shipped functions, so a P-09 failure can be attributed to the native
// delivery instead of to a wrong extension or a rejected envelope.
//
// Not proven here (and not claimed): that the WebView2 download actually lands a file, and that
// the Rust core packer produces identical bytes. Both are native probe items.
import { describe, expect, it } from 'vitest';
import type { PresentSlide, WorkspaceDocument } from '../../../shared/contracts/workspace';
import {
  packBrowserDeviceEnvelopeContainer,
  unpackBrowserDeviceEnvelopeContainer,
} from '../../../platform/containers/browserContainerCrypto';
import {
  assertWorkspaceContainerMagic,
  WORKSPACE_CONTAINER_EXTENSIONS,
  WORKSPACE_FILE_PICKER_ACCEPT,
} from '../../../platform/containers/workspaceContainerBoundary';
import { extensionForDocumentKind, WORKSPACE_DOCUMENT_EXTENSIONS } from '../../../platform/containers/vwcStorage';

function presentation(): WorkspaceDocument {
  const slide = {
    id: 'slide-1',
    title: '',
    subtitle: '',
    layout: 'blank',
    cards: [],
    speakerNotes: '',
    sceneObjects: [
      {
        id: 'text-1', kind: 'text',
        xPercent: 12.5, yPercent: 24.25, widthPercent: 34, heightPercent: 18,
        text: 'Frei beweglicher Text', fontSizePt: 28, fontWeight: 'bold', color: '#f8fafc',
        textAlign: 'left', opacity: 1, zIndex: 30,
      },
      {
        id: 'shape-1', kind: 'shape',
        xPercent: 55, yPercent: 40, widthPercent: 25, heightPercent: 20,
        rotation: 15, shape: 'ellipse', fillColor: '#38bdf8', strokeColor: '#0f172a',
        strokeWidth: 3, opacity: 0.9, zIndex: 20,
      },
    ],
  } as PresentSlide;
  return {
    id: 'present-file-contract',
    title: 'M1 Praesentation',
    kind: 'Present',
    created_at: 0,
    modified_at: 0,
    version: 7,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
    presentData: { slides: [slide], theme: 'dark', aspectRatio: '16:9' },
  } as WorkspaceDocument;
}

async function deviceKey(): Promise<CryptoKey> {
  return globalThis.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  ) as Promise<CryptoKey>;
}

function objectsOf(document: WorkspaceDocument): Array<Record<string, unknown>> {
  return ((document.presentData?.slides[0]?.sceneObjects ?? []) as unknown) as Array<Record<string, unknown>>;
}

describe('PR-009 — the .vpresent file contract between save and open', () => {
  it('names a presentation file .vpresent and offers that extension in the picker', () => {
    expect(extensionForDocumentKind('Present')).toBe('vpresent');
    expect(WORKSPACE_DOCUMENT_EXTENSIONS).toContain('vpresent');
    expect(WORKSPACE_CONTAINER_EXTENSIONS).toContain('vpresent');
    expect(WORKSPACE_FILE_PICKER_ACCEPT.split(',')).toContain('.vpresent');
  });

  it('a saved presentation container passes the open boundary and reopens unchanged', async () => {
    const key = await deviceKey();
    const original = presentation();
    const fileName = `${original.title}.${extensionForDocumentKind('Present')}`;
    expect(fileName).toBe('M1 Praesentation.vpresent');

    const bytes = await packBrowserDeviceEnvelopeContainer(original, key);
    expect(bytes.byteLength).toBeGreaterThan(64);
    expect(() => assertWorkspaceContainerMagic(fileName, bytes)).not.toThrow();

    const restored = await unpackBrowserDeviceEnvelopeContainer(bytes, key);
    expect(restored.kind).toBe('Present');
    expect(objectsOf(restored)).toEqual(objectsOf(original));
    expect(restored.presentData?.slides[0]?.id).toBe('slide-1');
    expect(restored.presentData?.aspectRatio).toBe('16:9');
  });

  it('rejects a foreign extension and a broken payload before unpacking', async () => {
    const bytes = await packBrowserDeviceEnvelopeContainer(presentation(), await deviceKey());
    expect(() => assertWorkspaceContainerMagic('Praesentation.vppt', bytes)).toThrow(/extension/u);
    expect(() => assertWorkspaceContainerMagic('Praesentation.vpresent', new Uint8Array([9, 9, 9, 9, 9, 9])))
      .toThrow(/magic mismatch/u);
  });
});
