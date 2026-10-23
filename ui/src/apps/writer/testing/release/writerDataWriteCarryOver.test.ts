// STATUS: PLATIN — Release 0.1: der Writer-Schreibpfad verliert kein Patch-Feld mehr.
//
// Vorher baute `useWriterPersistence` das zu schreibende `writerData` aus einer festen
// Feldliste. Ein Patch-Schlüssel außerhalb dieser Liste (heute `endnotes`, morgen ein
// additives Modellfeld) wurde still verworfen: kein Fehler, kein Hinweis, das Dokument
// behielt einfach den alten Wert. Diese Datei prüft die eine Regel, die das verhindert.
import { describe, expect, it } from 'vitest';
import type { WriterFootnote } from '../../../../shared/contracts/workspace';
import { carryOverWriterDataPatchFields } from '../../persistence/writerDataWriteCarryOver';
import type { ImageBlockData, WriterDocumentData } from '../../types';

const base: WriterDocumentData = {
  pageSetup: {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: 'normal',
    paperColor: 'white',
    showPageNumbers: true,
    headerText: '',
    footerText: '',
  },
  tables: [],
};

describe('Release 0.1 — carry-over des Writer-Datenpatches', () => {
  it('übernimmt ein Vertragsfeld, das der explizite Aufbau nicht kennt (endnotes)', () => {
    const endnotes: WriterFootnote[] = [{
      id: 'endnote-1',
      note: { id: 'note-1', type: 'endnote', number: 1, displayNumber: 'i', text: 'Anmerkung' },
      paragraphId: 'p1',
    } as unknown as WriterFootnote];

    const merged = carryOverWriterDataPatchFields(base, { endnotes });

    expect(merged.endnotes).toEqual(endnotes);
    // Der bereits aufgebaute Teil bleibt unangetastet.
    expect(merged.pageSetup).toBe(base.pageSetup);
    expect(merged.tables).toBe(base.tables);
  });

  it('übernimmt auch ein Feld, das der Writer-Code heute noch nicht schreibt (Zukunftssicherung)', () => {
    const patch = { futureModelField: { schemaVersion: 2 } } as unknown as Partial<WriterDocumentData>;
    const merged = carryOverWriterDataPatchFields(base, patch);
    expect((merged as Record<string, unknown>).futureModelField).toEqual({ schemaVersion: 2 });
  });

  it('undefined löscht nichts: ein nicht gesetzter Patch-Schlüssel bleibt beim alten Wert', () => {
    const withEndnotes: WriterDocumentData = { ...base, endnotes: [] };
    const merged = carryOverWriterDataPatchFields(withEndnotes, { endnotes: undefined });
    expect(merged).toBe(withEndnotes);
    expect(merged.endnotes).toEqual([]);
  });

  it('lässt die Felder unangetastet, die der Schreibpfad selbst auflöst (images, workspaceEmbeds)', () => {
    const normalizedImages: ImageBlockData[] = [{
      id: 'img-1',
      name: 'bild.png',
      dataUrl: 'data:image/png;base64,AA==',
      intrinsicWidth: 1,
      intrinsicHeight: 1,
      widthPercent: 70,
      alignment: 'center',
      altText: 'bild.png',
      wrapMode: 'inline',
    }];
    const rawImages: ImageBlockData[] = [{ ...normalizedImages[0]!, wrapMode: undefined }];
    const merged = carryOverWriterDataPatchFields(
      { ...base, images: normalizedImages, workspaceEmbeds: [{ id: 'embed-1' } as never] },
      { images: rawImages, workspaceEmbeds: [{ id: 'embed-raw' } as never] },
    );

    // Die normalisierte Form (hier: gesetzter wrapMode) gewinnt, nicht der rohe Patch.
    expect(merged.images).toBe(normalizedImages);
    expect(merged.workspaceEmbeds).toEqual([{ id: 'embed-1' }]);
  });

  it('gibt ohne zu ergänzende Felder dasselbe Objekt zurück (keine neue Identität)', () => {
    const merged = carryOverWriterDataPatchFields(base, { endnotes: undefined });
    expect(merged).toBe(base);
  });
});
