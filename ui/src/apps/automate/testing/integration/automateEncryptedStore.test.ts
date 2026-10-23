// STATUS: PLATIN — ASR-2035 und ASR-2033 fuer Astraea Automate: der verschluesselte .vautomate-Container.
//
// DIE ANFORDERUNGEN, WOERTLICH:
//   `docs/plans/2700PLAN.md:2145` — „**ASR-2035** Automate: Import-/Export-Test ablegen, sofern die App
//   Import/Export besitzt."
//   `docs/plans/2700PLAN.md:2143` — „**ASR-2033** Automate: Error-/Edge-Path-Test ablegen."
// Beide standen bis hierher als `**KEIN BELEG**` (`testing/ASR_BELEGZUORDNUNG.md:48` und `:50`); fuer
// `ASR-2035` waren nur ein Import-Tiefen-Vertrag und ein Quelltext-Vertrag eingetragen — kein Test, der
// den Container je gebaut oder geoeffnet haette.
//
// WARUM DAS DER WICHTIGERE WEG IST ALS DER SICHTBARE: `integrations/automateEncryptedStore.ts` ist der
// EINZIGE Ort, an dem Automate Daten verschluesselt ablegt. Eine Suche nach `packVAutomate`,
// `unpackVAutomate` und `AutomateStoreError` ueber `ui/src` fand **ausschliesslich die Datei selbst** —
// kein Test hat diese Funktionen je aufgerufen. Geprueft wird hier deshalb der echte Vertrag end-to-end:
// bauen -> oeffnen -> vergleichen, und jede benannte Ablehnung einzeln.
//
// GEMESSEN UND NICHT ANGENOMMEN (Lektuere vor dem Test, damit der Test nicht das Falsche belegt):
//   * Zufall: `crypto.getRandomValues` (`:8`) — kein `Math.random`, Salt und IV sind echt zufaellig.
//   * Ableitung: PBKDF2-SHA-256, 210 000 Runden, 256-Bit-AES-GCM (`:7`).
//   * Layout: `[MAGIC 4][Salt 16][IV 12][Ciphertext+Tag]`, `MAGIC = 'VGT3'` (`:4`, `:9`).
//   * Jeder Fehler ist BENANNT (`AutomateStoreError` mit `code`).
//
// DER BEFUND, DEN DIESE DATEI TRAGEN SOLL: die Magic-Pruefung in `unpackVAutomate` (`:10`) laeuft
// AUSSERHALB des `try` und benutzt den `fatal`-Decoder (`:4`). Ein Container, dessen erste vier Bytes
// kein gueltiges UTF-8 sind, laesst damit einen UNBENANNTEN `TypeError` entweichen, statt die benannte
// `vautomate-container-invalid` zu liefern. Ein Aufrufer, der nur `AutomateStoreError` faengt, sieht
// dann gar nichts.
import { describe, expect, it } from 'vitest';
import type { AutomateEncryptedStore } from '../../integrations/automateEncryptedStore';
import { AutomateStoreError, packVAutomate, unpackVAutomate } from '../../integrations/automateEncryptedStore';
import { DEFAULT_AUTOMATE_MODEL } from '../../model/types';

const PASSWORT = 'ein-langes-passwort';

/** Der Bestand, wie ihn die App ablegt — je Test frisch, damit kein Test den anderen speist. */
function bestand(): AutomateEncryptedStore {
  return {
    schema: 'vgt.automate.store/1',
    model: structuredClone(DEFAULT_AUTOMATE_MODEL),
    runs: [],
    savedAt: 1_700_000_000_000,
  };
}

/** Ruft `unpackVAutomate` und gibt den benannten Fehlercode zurueck — oder `null`, wenn es ging. */
async function ablehnungsCode(bytes: Uint8Array, password = PASSWORT): Promise<string | null> {
  try {
    await unpackVAutomate(bytes, password);
    return null;
  } catch (error) {
    if (error instanceof AutomateStoreError) return error.code;
    throw new Error(`Unbenannter Fehler statt AutomateStoreError: ${(error as Error).name}: ${(error as Error).message}`);
  }
}

describe('Astraea Automate — der verschluesselte .vautomate-Container (ASR-2035, ASR-2033)', () => {
  it('bauen -> oeffnen -> vergleichen: der Bestand kommt Feld fuer Feld zurueck', async () => {
    const quelle = bestand();
    const gepackt = await packVAutomate(quelle, PASSWORT);
    const geoeffnet = await unpackVAutomate(gepackt, PASSWORT);
    // Nicht nur die Wurzel: der ganze Bestand, damit ein verlorenes Feld auffaellt.
    expect(geoeffnet).toEqual(quelle);
    expect(geoeffnet.model.flowId).toBe(quelle.model.flowId);
    expect(geoeffnet.runs).toEqual([]);
    expect(geoeffnet.savedAt).toBe(quelle.savedAt);
  });

  it('das Layout ist [MAGIC 4][Salt 16][IV 12][Ciphertext+Tag] — und Salt/IV sind NICHT fest', async () => {
    const quelle = bestand();
    const erste = await packVAutomate(quelle, PASSWORT);
    const zweite = await packVAutomate(quelle, PASSWORT);
    const klar = new TextEncoder().encode(JSON.stringify(quelle)).byteLength;

    expect(erste.byteLength).toBe(32 + klar + 16);
    expect(Array.from(erste.subarray(0, 4))).toEqual([0x56, 0x47, 0x54, 0x33]); // 'VGT3'
    // Der eigentliche Punkt: zwei Bauten desselben Bestands duerfen sich NICHT gleichen. Waere der Salt
    // fest oder der IV wiederverwendet, waeren die Bytes gleich — und wiederverwendete IVs brechen
    // AES-GCM. Diese Zusicherung ist der Grund, warum hier zweimal gebaut wird.
    expect(Array.from(erste.subarray(4, 20))).not.toEqual(Array.from(zweite.subarray(4, 20)));
    expect(Array.from(erste.subarray(20, 32))).not.toEqual(Array.from(zweite.subarray(20, 32)));
    // Und beide oeffnen sich zum selben Bestand.
    expect(await unpackVAutomate(zweite, PASSWORT)).toEqual(quelle);
  });

  it('ein falsches Passwort wird BENANNT abgelehnt', async () => {
    const gepackt = await packVAutomate(bestand(), PASSWORT);
    expect(await ablehnungsCode(gepackt, 'ein-anderes-langes-passwort')).toBe('vautomate-authentication-failed');
  });

  it('ein gekipptes Byte im Ciphertext wird BENANNT abgelehnt (Authentizitaet)', async () => {
    const gepackt = await packVAutomate(bestand(), PASSWORT);
    const manipuliert = Uint8Array.from(gepackt);
    manipuliert[manipuliert.byteLength - 1] = (manipuliert[manipuliert.byteLength - 1] ?? 0) ^ 0x01;
    expect(manipuliert.byteLength).toBe(gepackt.byteLength);
    expect(await ablehnungsCode(manipuliert)).toBe('vautomate-authentication-failed');
  });

  it('ein gekipptes Byte im SALT wird BENANNT abgelehnt', async () => {
    const gepackt = await packVAutomate(bestand(), PASSWORT);
    const manipuliert = Uint8Array.from(gepackt);
    manipuliert[5] = (manipuliert[5] ?? 0) ^ 0x01;
    expect(await ablehnungsCode(manipuliert)).toBe('vautomate-authentication-failed');
  });

  it('ein falsches MAGIC wird BENANNT abgelehnt', async () => {
    const gepackt = await packVAutomate(bestand(), PASSWORT);
    const manipuliert = Uint8Array.from(gepackt);
    manipuliert.set([0x58, 0x58, 0x58, 0x58], 0); // 'XXXX' — gueltiges UTF-8, falsche Kennung
    expect(await ablehnungsCode(manipuliert)).toBe('vautomate-container-invalid');
  });

  it('ein MAGIC, das KEIN gueltiges UTF-8 ist, wird ebenfalls BENANNT abgelehnt', async () => {
    /*
     * **Das ist der Fehlerpfad, der die Lektuere ausgeloest hat.** `unpackVAutomate` prueft die Kennung
     * mit `D.decode(bytes.subarray(0,4)) !== 'VGT3'`, und `D` ist ein `TextDecoder` mit `fatal: true`
     * (`automateEncryptedStore.ts:4`). Bei `0xFF` wirft der Decoder einen `TypeError` — und diese
     * Pruefung steht AUSSERHALB des `try`, das auf `vautomate-authentication-failed` abbildet. Ein
     * Aufrufer, der nur `AutomateStoreError` faengt, sieht damit einen unbenannten Fehler.
     *
     * Der Container ist hier lang genug und sonst wohlgeformt; nur die ersten vier Bytes sind ungueltig.
     * Erwartet wird die BENANNTE Ablehnung — dieselbe wie bei jedem anderen falschen MAGIC.
     */
    const gepackt = await packVAutomate(bestand(), PASSWORT);
    const manipuliert = Uint8Array.from(gepackt);
    manipuliert.set([0xff, 0xfe, 0xfd, 0xfc], 0);
    expect(await ablehnungsCode(manipuliert)).toBe('vautomate-container-invalid');
  });

  it('ein zu kurzer Container wird BENANNT abgelehnt', async () => {
    expect(await ablehnungsCode(new Uint8Array(47))).toBe('vautomate-container-invalid');
    expect(await ablehnungsCode(new Uint8Array(0))).toBe('vautomate-container-invalid');
  });

  it('die Passwortgrenze wird BENANNT durchgesetzt (7 und 129 Zeichen)', async () => {
    const gepackt = await packVAutomate(bestand(), PASSWORT);
    expect(await ablehnungsCode(gepackt, 'a'.repeat(7))).toBe('vautomate-password-boundary');
    expect(await ablehnungsCode(gepackt, 'a'.repeat(129))).toBe('vautomate-password-boundary');
    // Und die Grenzen selbst sind zulaessig — sonst waere die Pruefung nur nach einer Seite belegt.
    const acht = 'a'.repeat(8);
    const grenzfaellig = await packVAutomate(bestand(), acht);
    expect((await unpackVAutomate(grenzfaellig, acht)).schema).toBe('vgt.automate.store/1');
  });

  it('ein Bestand mit falschem Schema wird beim BAUEN BENANNT abgelehnt', async () => {
    const falsch = { ...bestand(), schema: 'vgt.etwas.anderes/9' } as unknown as AutomateEncryptedStore;
    await expect(packVAutomate(falsch, PASSWORT)).rejects.toMatchObject({ code: 'vautomate-store-invalid' });
  });

  it('ein Bestand mit mehr als 5000 Laeufen wird beim BAUEN BENANNT abgelehnt', async () => {
    const zuViele = { ...bestand(), runs: new Array(5001).fill(null) } as unknown as AutomateEncryptedStore;
    await expect(packVAutomate(zuViele, PASSWORT)).rejects.toMatchObject({ code: 'vautomate-store-invalid' });
  });
});
