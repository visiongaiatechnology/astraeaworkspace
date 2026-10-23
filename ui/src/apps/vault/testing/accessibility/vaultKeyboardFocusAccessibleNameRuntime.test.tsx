// @vitest-environment happy-dom
// STATUS: DIAMANT VGT SUPREME — VERHALTENSNACHWEIS fuer M12-Z2422 / ASR-1706 (Modul 12, Astraea Vault).
//
// WARUM DIESE DATEI EXISTIERT
// M12-Z2422 verlangt: "Tastaturbedienung, Screenreader-Semantik, High-Contrast, Fokusfuehrung und
// skalierbare UI gehoeren zum Definition-of-Done." Der Vault hatte dafuer bis hierher KEINEN ausgefuehrten
// Nachweis:
//   - `testing/ASR_BELEGZUORDNUNG.md:71` fuehrt die Zeile `ASR-1706 | Keyboard-/Focus-/Accessible-Name-Smoke
//     ausfuehren. | KEIN BELEG` — die Luecke ist dort selbst benannt.
//   - `testing/files/vaultFolderMoveKeyboard.test.tsx` prueft MARKUP als Zeichenkette
//     (`renderToStaticMarkup` + `toContain('aria-label="Move gehalt.pdf to folder"')`). Ein `<select>`, das
//     nie ein `change`-Ereignis verarbeitet, besteht diesen Vertrag genauso.
//   - `testing/security/vaultLockRevocation.render.test.tsx` prueft ebenfalls Markup, nicht Bedienung.
//
// DIESE DATEI rendert den echten Einstiegspunkt des Moduls (`VaultFreeRuntime`) in ein DOM, setzt und liest
// `document.activeElement`, loest echte `change`-, `input`-, `click`- und `keydown`-Ereignisse aus und misst
// den zugaenglichen Namen am gerenderten Element. Sie fordert ihre Umgebung in Zeile 1 selbst an
// (`@vitest-environment happy-dom`), weil `ui/vite.config.ts` bewusst KEIN globales `environment` setzt.
//
// DIE SICHERHEITSGRENZE DIESES MODULS
// Vault ist das verschluesselte Modul. Der Sperrzustand kommt aus dem Dokument
// (`readVaultLockRecord` -> `deriveVaultLockState`) und ist hier der interessante Teil: der Test prueft,
// dass die Sperre fail-closed ist (kein Dateiname, kein Tag, kein Digest, keine Nutzlast, keine Dialoge im
// DOM), dass der Fokus im gesperrten Zustand NICHT in das Ausweisfeld springt, und dass ein ausdruecklich
// FALSCHER Ausweis den Vault nicht oeffnet. Es gibt hier keinen Schluessel und kein Passwort im Quelltext:
// der eingegebene Wert ist als ungueltig benannt, und der Vault hat in diesem Dokument ueberhaupt keinen
// aktiven Ausweis (`activeDocumentPassword={undefined}`) — die Ablehnung ist deshalb nicht umgehbar.
//
// GEMESSENE LUECKE, die dieser Test NICHT behauptet (bewusst keine Zusicherung, sonst waere die Datei bei
// einer Behebung rot): das Ausweisfeld des gesperrten Vaults
// (`VaultKeyPolicyPanel.tsx:203-204`) hat KEINEN programmatischen zugaenglichen Namen — das `<label>` ist
// ein Geschwisterelement ohne `htmlFor`/`id`, und `aria-label`/`placeholder` fehlen. Gemessen (aria-label
// `null`, placeholder leer). Der Fokusnachweis unten ist davon unabhaengig.
//
// WAS HIER NICHT GEPRUEFT WIRD (offen, nicht stillschweigend mitbehauptet): High-Contrast (das ist
// `ASR-1707` und bleibt in der Belegzuordnung unberuehrt) und die "skalierbare UI" (sie wird laut
// Vorbeleg ueber die Plattform-Skalierung geerbt, nicht vom Vault selbst gerendert). Und die native
// Tastenaktivierung eines `<button>` (Enter/Leertaste) bildet happy-dom nicht nach — Tastatur wird
// deshalb dort gemessen, wo der Vault selbst auf Tasten reagiert (Escape im Dialog).
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { KeyVaultStatus, VaultFile, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { VaultFreeRuntime } from '../../../../edition/open-core/apps/vault/VaultFreeRuntime';
import { persistVaultLockRecord } from '../../../../shared/vault/persistence/vaultPersistenceEngine';
import { vaultLockRecord } from '../../../../shared/vault/security/vaultSessionLock';
import { normalizeVaultKeyPolicy } from '../../../../shared/vault/security/vaultKeyPolicyEngine';

// Ohne dieses Kennzeichen warnt React bei jedem `act` ("not configured to support act"), weil Vitest hier
// keinen eigenen Test-Setup-Loader hat. Kein `any`, kein Cast: die Deklaration des globalen Kennzeichens
// steht direkt darunter.
declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** Ein Provider, der NICHT verbunden ist: der Geraetemodus-Riegel kann damit nicht greifen. */
const KEYVAULT_STATUS: KeyVaultStatus = {
  isLocked: true,
  hasPin: false,
  platform: 'test-provider',
  privacyMode: false,
  coreConnected: false,
};

/**
 * Ein Eintrag mit Klartext-Metadaten, die im gesperrten Zustand nicht mehr im DOM stehen duerfen:
 * Name, Tag, Digest und eine Nutzlast. `text/plain` ist noetig, damit `vaultOpenTargets` den
 * Klartext-Export ("Download original") ueberhaupt anbietet — sonst haette die Exportpforte unten
 * kein Ziel und der Test waere gruen, ohne den Pfad zu beruehren.
 */
const GEHEIME_DATEI: VaultFile = {
  id: 'vf-1706',
  name: 'gehaltsliste-2026.txt',
  kind: 'Writer',
  sizeBytes: 42,
  encryptedHash: 'deadbeef'.repeat(8),
  contentDigest: 'deadbeef'.repeat(8),
  lastModified: 1_700_000_000_000,
  sourceType: 'attachment',
  mimeType: 'text/plain',
  payloadDataUrl: 'data:text/plain;base64,51JFR0VJTQ==',
  integrityState: 'verified',
  status: 'available',
  tags: ['geheim'],
  owner: 'local-user',
  folderId: null,
};

/**
 * Das Dokument des Vaults. Die Schutzart ist `portable_password` (damit der gesperrte Zustand ein
 * Ausweisfeld zeigt) und die Auto-Lock-Frist ist `0` (damit kein Zeitgeber den Ablauf unbestimmt macht).
 * Ein Ausweis ist NICHT gesetzt — es gibt hier keinen Schluessel und kein Passwort.
 */
function vaultDokument(gesperrt: boolean): WorkspaceDocument {
  const basis: WorkspaceDocument = {
    id: 'vault-1706',
    title: 'Vault M12-Z2422',
    kind: 'Vault',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'cosmic-obsidian',
    root_object_ids: [],
    objects: {},
    vaultData: {
      files: [GEHEIME_DATEI],
      folders: [],
      keyPolicy: normalizeVaultKeyPolicy({ protectionMode: 'portable_password', autoLockMinutes: 0 }),
    },
  };
  // Der Sperrzustand wird mit den Produktionsfunktionen ins Dokument geschrieben — nicht von Hand gebaut.
  return gesperrt ? persistVaultLockRecord(basis, vaultLockRecord(true, Date.now())) : basis;
}

/** Rendert den echten Vault-Einstieg, uebergibt das Wurzelelement und raeumt danach auf. */
async function mitVault(
  gesperrt: boolean,
  pruefung: (container: HTMLElement) => Promise<void> | void,
): Promise<void> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const wurzel = createRoot(container);
  await act(async () => {
    wurzel.render(<VaultFreeRuntime
      document={vaultDokument(gesperrt)}
      documents={[]}
      onUpdateDocument={() => undefined}
      onCreateDerivedDocument={() => undefined}
      vaultStatus={KEYVAULT_STATUS}
      activeDocumentPin={null}
      activeDocumentPassword={undefined}
      onSetActiveDocumentPin={() => undefined}
      onSetActiveDocumentPassword={() => undefined}
      networkCapability="None"
    />);
  });
  try {
    await pruefung(container);
  } finally {
    await act(async () => {
      wurzel.unmount();
    });
    container.remove();
  }
}

/**
 * Eine echte Nutzereingabe in ein kontrolliertes React-Feld. `element.value = x` allein sieht React nicht;
 * der native Setter plus `input`-Ereignis ist derselbe Weg, den `user-event` geht. Ohne `any` und ohne
 * Cast: der Setter kommt typisiert aus dem Prototyp-Deskriptor.
 */
function tippeEin(element: HTMLInputElement, wert: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(element, wert);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Eine echte Auswahl in einem kontrollierten React-`<select>` — derselbe Weg wie `user-event`. */
function waehleAus(element: HTMLSelectElement, wert: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  descriptor?.set?.call(element, wert);
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Ein Knopf ueber seinen sichtbaren Text — so, wie ihn ein Nutzer findet. */
function knopfMitText(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
    .find((knopf) => knopf.textContent?.trim() === text);
}

describe('M12-Z2422 / ASR-1706 — Tastatur, Fokus und zugaengliche Namen des Vaults wirken im Betrieb', () => {
  it('der gesperrte Vault gibt Dateiname, Tag, Digest und Nutzlast nicht heraus (fail-closed)', async () => {
    await mitVault(true, (container) => {
      expect(
        container.querySelector('[data-vault-locked]')?.getAttribute('data-vault-locked'),
        'der Vault muss gesperrt starten, wenn das Dokument einen Sperrvermerk traegt',
      ).toBe('true');

      const text = container.textContent ?? '';
      expect(text, 'der Dateiname darf im gesperrten Zustand nicht im DOM stehen').not.toContain(GEHEIME_DATEI.name);
      expect(text, 'der Tag ist selbst Geheimnis und darf nicht im DOM stehen').not.toContain('geheim');
      expect(text, 'der Digest darf nicht im DOM stehen').not.toContain(GEHEIME_DATEI.encryptedHash.slice(0, 12));
      expect(container.querySelectorAll('img[src^="data:"]').length, 'keine entschluesselte Nutzlast im DOM').toBe(0);
      expect(container.querySelectorAll('article').length, 'keine Dateizeile im gesperrten Zustand').toBe(0);

      // Die Wege, die Klartext austreten lassen, sind nicht nur unsichtbar, sondern gar nicht gebaut.
      expect(container.querySelector('[role="dialog"]'), 'kein Dialog im gesperrten Zustand').toBeNull();
      expect(container.querySelector(`select[aria-label="Open ${GEHEIME_DATEI.name} with"]`), 'kein Open-With-Weg').toBeNull();
      expect(container.querySelector('input[type="file"][aria-label="Add local files to Vault"]'), 'kein Import-Weg').toBeNull();
      expect(container.querySelector('[aria-label="Vault sharing"]'), 'kein Freigabe-Panel').toBeNull();
    });
  });

  it('im entsperrten Vault ist dieselbe Datei sichtbar und jede Handlung ihrer Zeile ist ohne Zeiger erreichbar', async () => {
    await mitVault(false, (container) => {
      expect(
        container.querySelector('[data-vault-locked]')?.getAttribute('data-vault-locked'),
        'ohne Sperrvermerk startet der Vault entsperrt',
      ).toBe('false');

      // GEGENPROBE zum Test darueber: derselbe Zustand zeigt Name und Tag. Ohne diese Zeile koennte der
      // gesperrte Test gruen sein, weil die Datei ohnehin nirgends gerendert wird.
      const text = container.textContent ?? '';
      expect(text, 'im entsperrten Zustand muss der Dateiname sichtbar sein').toContain(GEHEIME_DATEI.name);
      expect(text, 'im entsperrten Zustand muss der Tag sichtbar sein').toContain('geheim');

      const zeile = container.querySelector('article');
      expect(zeile, 'die Dateizeile fehlt').not.toBeNull();

      // Jede Handlung der Zeile ist ein NATIVES, nicht deaktiviertes Bedienelement. Ein `<div onClick>`
      // waere hier nicht enthalten und wuerde die Zahl unter die gemessenen 13 druecken — dann ist der
      // Test rot.
      const bedienelemente = Array.from(zeile!.querySelectorAll<HTMLElement>(
        'button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href]',
      ));
      expect(
        bedienelemente.length,
        'die Dateizeile bietet weniger bedienbare Elemente an als gemessen (13)',
      ).toBeGreaterThanOrEqual(13);

      for (const element of bedienelemente) {
        const name = element.getAttribute('aria-label')?.trim() ?? element.textContent?.trim() ?? '';
        expect(name.length, `${element.tagName} hat keinen zugaenglichen Namen`).toBeGreaterThan(0);

        /*
         * WARUM HIER NICHT `element.focus()` + `document.activeElement` STEHT — selbst gemessen, nicht
         * angenommen: happy-dom setzt `document.activeElement` auf JEDES Element, auch auf ein `<div>`
         * ohne `tabindex` und auf ein `<div tabindex="-1">` (jeweils `tabIndex === -1`, `:focus` true).
         * Diese Messung beweist in dieser Umgebung also keine Tabbarkeit; sie waere auch fuer ein
         * `<div onClick>` gruen. Gemessen wird deshalb die Eigenschaft, die der Browser fuer die
         * Tab-Reihenfolge auswertet: der Elementtyp (oben im Selektor) und `tabIndex >= 0`.
         */
        expect(
          element.tabIndex,
          `${element.tagName} "${name}" liegt nicht in der Tab-Reihenfolge`,
        ).toBeGreaterThanOrEqual(0);
      }
    });
  });

  it('die Klartext-Exportpforte holt den Fokus in den Dialog, benennt ihn und gibt ihn zurueck', async () => {
    await mitVault(false, async (container) => {
      const auswahl = container.querySelector<HTMLSelectElement>(`select[aria-label="Open ${GEHEIME_DATEI.name} with"]`);
      expect(auswahl, 'die "Open With"-Auswahl der Datei fehlt').not.toBeNull();
      const ziel = Array.from(auswahl!.options).find((option) => option.text === 'Download original');
      expect(ziel, 'die Auswahl muss den Klartext-Export anbieten').not.toBeUndefined();

      // Der Auslöser traegt den Fokus, damit die Rueckgabe unten messbar ist. Ohne diesen Ausgangszustand
      // waere "der Fokus ist wieder dort" auch dann wahr, wenn er nie woanders war.
      auswahl!.focus();
      expect(document.activeElement, 'der Auslöser muss vor dem Oeffnen den Fokus haben').toBe(auswahl);

      await act(async () => {
        waehleAus(auswahl!, ziel!.value);
      });

      const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
      expect(dialog, 'der Exportdialog erscheint nicht').not.toBeNull();
      expect(dialog!.getAttribute('aria-modal'), 'der Dialog muss modal sein').toBe('true');

      // Ein Screenreader liest den Dialog ueber diese beiden Verweise, nicht ueber die Naehe im Markup.
      const titelId = dialog!.getAttribute('aria-labelledby') ?? '';
      const beschreibungId = dialog!.getAttribute('aria-describedby') ?? '';
      expect(document.getElementById(titelId)?.textContent, 'der Dialogtitel ist nicht verknuepft').toBe(
        'Export an unencrypted copy?',
      );
      const beschreibung = document.getElementById(beschreibungId);
      expect(beschreibung?.getAttribute('role'), 'die Warnung muss sofort angesagt werden').toBe('alert');
      expect(beschreibung?.textContent, 'die Warnung muss die betroffene Datei nennen').toContain(GEHEIME_DATEI.name);
      expect(beschreibung?.textContent, 'die Warnung muss benennen, was nicht geschuetzt ist').toContain('not encrypted');

      const abbrechen = dialog!.querySelector<HTMLButtonElement>('[data-initial-focus="cancel"]');
      expect(abbrechen, 'der Abbrechen-Knopf mit Erstfokus fehlt').not.toBeNull();
      expect(document.activeElement, 'der Fokus muss IM Dialog stehen, nicht davor').toBe(abbrechen);

      const bestaetigen = knopfMitText(dialog!, 'Export unencrypted copy');
      expect(bestaetigen, 'der Bestaetigungsknopf fehlt').not.toBeUndefined();
      expect(bestaetigen!.disabled, 'ohne die Bestaetigungsphrase darf der Export nicht ausloesbar sein').toBe(true);
      await act(async () => {
        bestaetigen!.click();
      });
      expect(container.querySelector('[role="dialog"]'), 'ein gesperrter Knopf darf nichts ausloesen').not.toBeNull();

      const phrase = dialog!.querySelector<HTMLInputElement>('input');
      expect(phrase, 'das Feld fuer die Bestaetigungsphrase fehlt').not.toBeNull();
      await act(async () => {
        tippeEin(phrase!, 'EXPORT PLAINTEXT');
      });
      expect(phrase!.value).toBe('EXPORT PLAINTEXT');
      expect(bestaetigen!.disabled, 'nach der Phrase muss der Export ausloesbar sein').toBe(false);

      // Die Tastaturfuehrung des Dialogs: Escape bricht ab, und der Fokus kehrt zum Auslöser zurueck.
      await act(async () => {
        dialog!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      });
      expect(container.querySelector('[role="dialog"]'), 'Escape muss den Dialog schliessen').toBeNull();
      expect(document.activeElement, 'der Fokus muss zum Auslöser zurueckkehren').toBe(auswahl);
    });
  });

  it('der gesperrte Vault zieht den Fokus nicht in sein Ausweisfeld und oeffnet sich durch Eingabe nicht', async () => {
    const ausserhalb = document.createElement('button');
    ausserhalb.type = 'button';
    ausserhalb.textContent = 'Fokus ausserhalb des Vaults';
    document.body.appendChild(ausserhalb);
    try {
      ausserhalb.focus();
      expect(document.activeElement).toBe(ausserhalb);

      await mitVault(true, async (container) => {
        // DER KERNSATZ DIESES MODULS: der gesperrte Vault nimmt den Fokus nicht an sich. Kein `autoFocus`,
        // kein Fokus in ein Eingabefeld — der Nutzer bleibt, wo er war.
        expect(document.activeElement, 'der gesperrte Vault darf den Fokus nicht stehlen').toBe(ausserhalb);

        const ausweisfeld = container.querySelector<HTMLInputElement>('input[type="password"]');
        expect(ausweisfeld, 'das Ausweisfeld des gesperrten Vaults fehlt').not.toBeNull();
        expect(document.activeElement, 'der Fokus darf nicht im Ausweisfeld stehen').not.toBe(ausweisfeld);

        // GEGENPROBE: das Feld ist nicht deshalb unbenutzt, weil es gar nicht bedienbar waere. Es ist ein
        // nicht deaktiviertes `<input type="password">` und nimmt den Fokus an, wenn der Nutzer ihn
        // ausdruecklich dorthin setzt. (happy-dom emuliert `focus()` fuer jedes Element — deshalb traegt
        // die Aussage hier der Elementtyp aus dem Selektor, nicht die Fokusemulation.)
        expect(ausweisfeld!.disabled, 'das Ausweisfeld ist deaktiviert statt bedienbar').toBe(false);
        ausweisfeld!.focus();
        expect(document.activeElement, 'das Ausweisfeld nimmt den Fokus nicht an').toBe(ausweisfeld);
        ausserhalb.focus();
        expect(document.activeElement, 'der Fokus kehrt nicht auf das aeussere Element zurueck').toBe(ausserhalb);

        const oeffnen = knopfMitText(container, 'Unlock');
        expect(oeffnen, 'der Unlock-Knopf des gesperrten Vaults fehlt').not.toBeUndefined();

        // Ein ausdruecklich FALSCHER Wert. Kein Schluessel, kein Passwort, kein Umgehungsversuch: dieses
        // Dokument hat gar keinen aktiven Ausweis, deshalb kann hier nichts geoeffnet werden.
        expect(container.querySelectorAll('[role="status"]').length, 'vor dem Versuch gibt es keine Meldung').toBe(0);
        await act(async () => {
          tippeEin(ausweisfeld!, 'kein-gueltiger-ausweis');
        });
        await act(async () => {
          oeffnen!.click();
        });

        const meldung = container.querySelector('[role="status"]');
        expect(meldung, 'die Ablehnung muss als Statusmeldung erscheinen').not.toBeNull();
        expect(meldung!.textContent, 'die Ablehnung muss benannt werden').toBe('vault_password_format_invalid');

        // Fail-closed: der Vault bleibt zu, und der Inhalt bleibt draussen.
        expect(
          container.querySelector('[data-vault-locked]')?.getAttribute('data-vault-locked'),
          'nach einer abgelehnten Eingabe muss der Vault gesperrt bleiben',
        ).toBe('true');
        expect(container.textContent ?? '', 'auch nach dem Versuch darf kein Dateiname im DOM stehen').not.toContain(
          GEHEIME_DATEI.name,
        );
        expect(document.activeElement, 'auch die Ablehnung darf den Fokus nicht verschieben').toBe(ausserhalb);
      });
    } finally {
      ausserhalb.remove();
    }
  });
});
