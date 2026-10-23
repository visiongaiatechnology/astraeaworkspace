// STATUS: DIAMANT VGT SUPREME — Der Dateiname des PDF-Exports ist eine Vertrauensgrenze
//
// Der Dokumenttitel ist Nutzereingabe und landet in einem Dateinamen. Die Regeln sind bewusst einzeln
// geprüft, weil hier zwei Fehlerklassen zusammenfallen: Sicherheit (kein Pfad, keine Steuerzeichen) und
// Benutzbarkeit (kein leerer Name, kein zerteiltes Zeichen, genau eine Endung).
import { describe, expect, it } from 'vitest';
import { MAX_PUBLISH_FILE_NAME_BYTES, publishExportFileName } from '../../../interop/publishPdfDelivery';

describe('ein Titel wird zu einem sicheren Dateinamen', () => {
  it('nimmt einen gewöhnlichen Titel unverändert auf', () => {
    expect(publishExportFileName('Quartalsbericht')).toBe('Quartalsbericht.pdf');
  });

  it('behält Umlaute — sie sind ein gültiger Dateiname, kein Sonderfall', () => {
    // Die frühere Lehre des Projekts (W-302): `?` statt echter Zeichen ist eine stille Verfälschung.
    expect(publishExportFileName('Größe und Maße')).toBe('Größe-und-Maße.pdf');
  });

  it('lässt keinen Pfad entstehen', () => {
    // Pfadtrenner und Windows-Sonderzeichen werden ersetzt, `..` kann so nicht entstehen.
    expect(publishExportFileName('../../etc/passwd')).toBe('etc-passwd.pdf');
    expect(publishExportFileName('C:\\Windows\\System32\\config')).toBe('C-Windows-System32-config.pdf');
    expect(publishExportFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j.pdf');
    expect(publishExportFileName('..')).toBe('publish-dokument.pdf');
  });

  it('entfernt Steuerzeichen, die Dateinamen und Protokolle zerlegen', () => {
    expect(publishExportFileName('Be\u0000ri\u001fcht\u007f')).toBe('Bericht.pdf');
  });

  it('setzt genau eine Endung, auch wenn der Titel schon eine trägt', () => {
    expect(publishExportFileName('Bericht.pdf')).toBe('Bericht.pdf');
    expect(publishExportFileName('Bericht.PDF')).toBe('Bericht.pdf');
    expect(publishExportFileName('Archiv.zip')).toBe('Archiv.pdf');
  });

  it('beginnt nie mit einem Punkt oder Bindestrich und endet nicht damit', () => {
    // Ein führender Punkt ist unter Windows unzulässig; „-bericht.pdf" sieht nach einem Fehler aus.
    expect(publishExportFileName('.versteckt')).toBe('versteckt.pdf');
    expect(publishExportFileName('--bericht--')).toBe('bericht.pdf');
  });

  it('benennt einen leeren oder nur aus Sonderzeichen bestehenden Titel verständlich', () => {
    for (const title of ['', '   ', '...', '///', '\u0000']) {
      expect(publishExportFileName(title), JSON.stringify(title)).toBe('publish-dokument.pdf');
    }
  });

  it('begrenzt die Länge in Bytes und zerteilt dabei kein Zeichen', () => {
    // Ein Umlaut belegt in UTF-8 zwei Bytes: die Grenze muss in Bytes gelten, der Schnitt auf Codepunkten.
    const long = 'Ü'.repeat(200);
    const name = publishExportFileName(long);
    expect(new TextEncoder().encode(name).byteLength).toBeLessThanOrEqual(MAX_PUBLISH_FILE_NAME_BYTES);
    expect(name.endsWith('.pdf')).toBe(true);
    // Kein halbes Zeichen: der Rumpf besteht ausschließlich aus vollständigen „Ü".
    expect(/^Ü+\.pdf$/u.test(name)).toBe(true);
  });

  it('zählt Ersatzpaare als eine Einheit', () => {
    // Ein Emoji ist zwei Codeeinheiten; ein Schnitt mitten hinein ergäbe ein Ersatzzeichen im Namen.
    const name = publishExportFileName('🎯'.repeat(100));
    expect(name.endsWith('.pdf')).toBe(true);
    expect(name.includes('\uFFFD')).toBe(false);
    expect(/^🎯+\.pdf$/u.test(name)).toBe(true);
  });

  it('hängt eine Endungsvariante an, ohne den Rumpf zu beschädigen', () => {
    expect(publishExportFileName('Bericht', 'PDF/X-4')).toBe('Bericht-PDF-X-4.pdf');
    const name = publishExportFileName('Ü'.repeat(200), 'PDF/X-4');
    expect(new TextEncoder().encode(name).byteLength).toBeLessThanOrEqual(MAX_PUBLISH_FILE_NAME_BYTES);
    expect(name.endsWith('-PDF-X-4.pdf')).toBe(true);
  });

  it('ist für denselben Titel immer gleich', () => {
    // Determinismus: derselbe Titel darf nicht je nach Lauf verschiedene Dateien erzeugen.
    expect(publishExportFileName('Größe')).toBe(publishExportFileName('Größe'));
  });
});
