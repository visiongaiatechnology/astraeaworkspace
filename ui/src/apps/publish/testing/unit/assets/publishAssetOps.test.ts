// STATUS: PLATIN — Publish: Bildrahmen wirklich fuellen und aktive Inhalte abweisen
//
// Der Punkt lautet: "Lokales Bild in Rahmen platzieren, crop/fitting korrekt anzeigen". Vorher zeichnete der
// Canvas fuer **jeden** Bildrahmen denselben Platzhalter; `frame.assetId` wurde nirgends gesetzt und
// `ingestPublishAsset` war aus keiner Komponente erreichbar.
import { describe, expect, it } from 'vitest';
import { createPublishProject } from '../../../model/publishDocumentFactory';
import { PublishModelError, addFrameToPublish } from '../../../model/publishDocumentEngine';
import { updatePublishFrame } from '../../../model/publishFrameOps';
import {
  PUBLISH_IMAGE_DROP_TYPES, PUBLISH_PLACE_IMAGE_MAX_BYTES, buildPublishImageSource, checkPublishImageDrop,
  placePublishImage, presentPublishImage,
} from '../../../assets/publishAssetOps';

/** Ein gueltiges 1x1-PNG (67 Bytes). Quelle der Bytes: die kanonischen PNG-Chunks fuer ein transparentes Pixel. */
const PNG_1X1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

const SVG_PASSIVE = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#000"/></svg>');

const codes = async (run: () => Promise<unknown>): Promise<string> => {
  try { await run(); return 'no-error'; } catch (error) { return error instanceof PublishModelError ? error.code : `not-a-model-error:${String(error)}`; }
};

function projectWithImageFrame() {
  const project = createPublishProject({ pages: 1 });
  const model = addFrameToPublish(project, 'image', { name: 'Bild' });
  return { model, frameId: model.selectedFrameId! };
}

describe('checkPublishImageDrop — die Grenzen vor dem Lesen der Bytes', () => {
  it('nimmt die erlaubten Bildtypen unter der Grenze an', () => {
    for (const type of PUBLISH_IMAGE_DROP_TYPES) {
      const check = checkPublishImageDrop({ type: 'image' as const, locked: false }, { type, size: 1024 });
      expect(check.accepted, type).toBe(true);
      expect(check.reason, type).toBe('ok');
    }
  });

  it('nennt jeden Ablehnungsgrund einzeln', () => {
    const cases: Array<[Parameters<typeof checkPublishImageDrop>[0], { type: string; size: number }, string]> = [
      [{ type: 'text', locked: false }, { type: 'image/png', size: 10 }, 'frame-not-image'],
      [{ type: 'image', locked: true }, { type: 'image/png', size: 10 }, 'frame-locked'],
      [{ type: 'image', locked: false }, { type: 'application/pdf', size: 10 }, 'type-not-accepted'],
      [{ type: 'image', locked: false }, { type: 'image/png', size: 0 }, 'file-empty'],
      [{ type: 'image', locked: false }, { type: 'image/png', size: PUBLISH_PLACE_IMAGE_MAX_BYTES + 1 }, 'file-too-large'],
    ];
    for (const [frame, file, reason] of cases) {
      const check = checkPublishImageDrop(frame, file);
      expect(check.accepted, reason).toBe(false);
      expect(check.reason, reason).toBe(reason);
    }
  });

  it('nennt die Grenze in der Antwort, damit die Meldung sie zeigen kann', () => {
    const check = checkPublishImageDrop({ type: 'image', locked: false }, { type: 'image/png', size: 1 });
    expect(check.limitBytes).toBe(PUBLISH_PLACE_IMAGE_MAX_BYTES);
  });

  it('akzeptiert auch einen Grafikrahmen', () => {
    expect(checkPublishImageDrop({ type: 'graphic', locked: false }, { type: 'image/png', size: 10 }).accepted).toBe(true);
  });
});

describe('placePublishImage', () => {
  it('betten ein und setzt assetId und Alternativtext', async () => {
    const { model, frameId } = projectWithImageFrame();
    const next = await placePublishImage(model, frameId, { name: 'pixel.png', bytes: PNG_1X1, embed: true, modifiedAt: 1 });
    const frame = next.frames.find(candidate => candidate.id === frameId)!;
    expect(frame.assetId).toBeDefined();
    expect(frame.altText).toBe('pixel.png');
    const asset = next.assets.find(candidate => candidate.id === frame.assetId)!;
    expect(asset.storage).toBe('embedded');
    expect(asset.mimeType).toBe('image/png');
    expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(asset.embeddedBytesBase64).toBeTruthy();
  });

  it('nimmt dasselbe Bild nicht zweimal in die Assetliste auf', async () => {
    const { model, frameId } = projectWithImageFrame();
    const once = await placePublishImage(model, frameId, { name: 'pixel.png', bytes: PNG_1X1, embed: true, modifiedAt: 1 });
    const twice = await placePublishImage(once, frameId, { name: 'pixel.png', bytes: PNG_1X1, embed: true, modifiedAt: 1 });
    expect(twice.assets).toHaveLength(1);
  });

  it('lehnt einen Textrahmen ab', async () => {
    const project = createPublishProject({ pages: 1 });
    const model = addFrameToPublish(project, 'text', { content: '', name: 'Text' });
    expect(await codes(() => placePublishImage(model, model.selectedFrameId!, { name: 'a.png', bytes: PNG_1X1, embed: true }))).toBe('asset-frame-type-invalid');
  });

  it('lehnt leere Bytes ab', async () => {
    const { model, frameId } = projectWithImageFrame();
    expect(await codes(() => placePublishImage(model, frameId, { name: 'a.png', bytes: new Uint8Array(0), embed: true }))).toBe('asset-bytes-empty');
  });

  it('lehnt ein zu grosses eingebettetes Bild ab und nennt die Grenze', async () => {
    const { model, frameId } = projectWithImageFrame();
    const huge = new Uint8Array(PUBLISH_PLACE_IMAGE_MAX_BYTES + 1);
    const code = await codes(() => placePublishImage(model, frameId, { name: 'huge.png', bytes: huge, embed: true }));
    expect(code).toBe(`asset-embedded-size-boundary:${PUBLISH_PLACE_IMAGE_MAX_BYTES + 1}>${PUBLISH_PLACE_IMAGE_MAX_BYTES}`);
  });

  it('verlangt eine Quelle, wenn nicht eingebettet wird', async () => {
    const { model, frameId } = projectWithImageFrame();
    expect(await codes(() => placePublishImage(model, frameId, { name: 'a.png', bytes: PNG_1X1, embed: false }))).toBe('asset-canonical-uri-required');
  });

  it('lehnt ein Format ab, das die Medienpruefung nicht kennt', async () => {
    const { model, frameId } = projectWithImageFrame();
    const notAnImage = new TextEncoder().encode('das ist kein Bild, nur Text');
    expect(await codes(() => placePublishImage(model, frameId, { name: 'a.txt', bytes: notAnImage, embed: true }))).toBe('asset-format-unsupported');
  });

  it('betten ein passives SVG ein', async () => {
    const { model, frameId } = projectWithImageFrame();
    const next = await placePublishImage(model, frameId, { name: 'form.svg', bytes: SVG_PASSIVE, embed: true });
    const asset = next.assets[0]!;
    expect(asset.kind).toBe('svg');
    expect(asset.mimeType).toBe('image/svg+xml');
  });
});

describe('presentPublishImage — der Zustand, den der Canvas zeichnet', () => {
  it('unterscheidet Platzhalter, eingebettet, fehlend und nicht-Bild', async () => {
    const { model, frameId } = projectWithImageFrame();
    const frame = model.frames[0]!;
    expect(presentPublishImage(model, frame).state).toBe('placeholder');
    const placed = await placePublishImage(model, frameId, { name: 'pixel.png', bytes: PNG_1X1, embed: true });
    const placedFrame = placed.frames[0]!;
    expect(presentPublishImage(placed, placedFrame).state).toBe('embedded');
    expect(presentPublishImage(placed, placedFrame).source?.startsWith('data:image/png;base64,')).toBe(true);
    // Ein Verweis auf ein Asset, das es nicht mehr gibt, ist "fehlend" — nicht "Platzhalter".
    const broken = { ...placed, assets: [] };
    expect(presentPublishImage(broken, placedFrame).state).toBe('missing');
    const textFrame = addFrameToPublish(placed, 'text', { content: '', name: 'T' }).frames.find(candidate => candidate.type === 'text')!;
    expect(presentPublishImage(placed, textFrame).state).toBe('not-an-image');
  });

  it('meldet eine fehlende Verknuepfung als fehlend', async () => {
    const { model, frameId } = projectWithImageFrame();
    const placed = await placePublishImage(model, frameId, { name: 'pixel.png', bytes: PNG_1X1, embed: true });
    const missing = { ...placed, assets: placed.assets.map(asset => ({ ...asset, status: 'missing' as const })) };
    expect(presentPublishImage(missing, missing.frames[0]!).state).toBe('missing');
  });

  it('meldet einen blockierten Fernbezug als remote-blocked', async () => {
    const { model, frameId } = projectWithImageFrame();
    const placed = await placePublishImage(model, frameId, { name: 'pixel.png', bytes: PNG_1X1, embed: true });
    const blocked = { ...placed, assets: placed.assets.map(asset => ({ ...asset, storage: 'remote-capability' as const, status: 'remote-blocked' as const })) };
    expect(presentPublishImage(blocked, blocked.frames[0]!).state).toBe('remote-blocked');
  });
});

describe('buildPublishImageSource — aktive Inhalte werden auch beim Anzeigen abgewiesen', () => {
  it('liefert fuer ein eingebettetes PNG eine data-URL', () => {
    const source = buildPublishImageSource({ storage: 'embedded', embeddedBytesBase64: 'AAAA', mimeType: 'image/png' } as never);
    expect(source).toBe('data:image/png;base64,AAAA');
  });

  it('gibt ohne Bytes null zurueck, statt eine kaputte Quelle zu bauen', () => {
    expect(buildPublishImageSource({ storage: 'embedded', mimeType: 'image/png' } as never)).toBeNull();
    expect(buildPublishImageSource({ storage: 'local-link', canonicalUri: '' } as never)).toBeNull();
  });

  it('weist ein SVG mit Skript ab', () => {
    // Base64 von Hand, ohne `Buffer`: dieser Code laeuft im Browser-Bundle.
    const payload = '<svg onload="alert(1)"/>';
    const base64 = btoa(payload);
    expect(() => buildPublishImageSource({ storage: 'embedded', embeddedBytesBase64: base64, mimeType: 'image/svg+xml' } as never)).toThrow(PublishModelError);
  });

  it('weist ein prozent-kodiertes SVG mit Skript ab', () => {
    const uri = `data:image/svg+xml,${encodeURIComponent('<svg><script>alert(1)</script></svg>')}`;
    expect(uri.startsWith('data:')).toBe(true);
    expect(() => buildPublishImageSource({ storage: 'linked', canonicalUri: uri, mimeType: 'image/svg+xml' } as never)).toThrow(PublishModelError);
  });

  it('weist ein base64-data-Ziel mit javascript: ab', () => {
    const base64 = btoa('<img src="javascript:alert(1)">');
    expect(() => buildPublishImageSource({ storage: 'embedded', embeddedBytesBase64: base64, mimeType: 'text/html' } as never)).toThrow(PublishModelError);
  });
});

describe('updatePublishFrame haelt die Assetzuordnung konsistent', () => {
  it('setzt assetId nur ueber die kanonische Funktion', async () => {
    const { model, frameId } = projectWithImageFrame();
    const placed = await placePublishImage(model, frameId, { name: 'pixel.png', bytes: PNG_1X1, embed: true });
    const assetId = placed.frames[0]!.assetId!;
    // Ein Patch kann die Zuordnung entfernen, aber keine erfundene ID setzen, ohne dass das Modell sie kennt.
    const patched = updatePublishFrame(placed, frameId, { assetId: undefined });
    expect(patched.frames[0]!.assetId).toBeUndefined();
    expect(placed.assets.some(asset => asset.id === assetId)).toBe(true);
  });
});
