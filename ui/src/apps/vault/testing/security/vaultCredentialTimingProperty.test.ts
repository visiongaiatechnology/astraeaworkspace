// STATUS: DIAMANT VGT SUPREME — Zeuge fuer die EIGENSCHAFT des Vergleichs, nicht fuer seine Laufzeit.
//
// **Warum dieser Zeuge nicht die Zeit misst.** In dieser Umgebung gibt es kein jsdom, keine stabile
// Zeitquelle und CI-Jitter. Eine Zusage auf eine Laufzeitmessung waere entweder flatterhaft oder wertlos.
// Gemessen ist der Kanal ohnehin unter der Rauschgrenze: der Gate-Aufruf braucht 6405,6 ns bei Unterschied
// an Position 0 und 6424,2 ns bei Position 127, waehrend die Streuung derselben Konfiguration 435,9 bis
// 713,1 ns betraegt (Werkzeug `vaultTimingProbe.test.ts`).
//
// **Was dieser Zeuge stattdessen zusichert.** Der Vergleich gibt die Zahl seiner Schleifenschritte zurueck.
// Der Zeuge prueft damit die Eigenschaft, die den Kanal ausmacht oder schliesst:
//   1. gleiche Schrittzahl fuer zwei gleich lange Eingaben, egal an welcher Stelle sie sich unterscheiden;
//   2. gleiche Schrittzahl fuer unterschiedlich lange Eingaben — die Laengendifferenz ist Arbeit, kein Abbruch;
//   3. die Schrittzahl haengt nicht von der Laenge des Geheimnisses ab;
//   4. der Vergleich ist fuer jede Eingabe korrekt (`equal` stimmt mit `===` ueberein);
//   5. das Verhalten des Gates ist unveraendert — gueltiger Ausweis kommt durch, falscher wird mit
//      demselben Fehlercode abgewiesen, Leerwert sperrt;
//   6. die Schleifenschranke ist die Formatgrenze selbst, kein zweiter Wert, der abdriften kann.
import { describe, expect, it } from 'vitest';
import type { KeyVaultStatus, VaultKeyPolicyModel, VaultProtectionMode } from '../../../../shared/contracts/workspace';
import {
  DEFAULT_VAULT_KEY_POLICY,
  VAULT_CREDENTIAL_MAXIMUM_LENGTH,
  normalizeVaultKeyPolicy,
  validateVaultCredential,
  validateVaultUiSessionGate,
} from '../../../../shared/vault/security/vaultKeyPolicyEngine';
import { compareVaultCredentials } from '../../../../shared/vault/security/vaultCredentialComparison';

const STATUS: KeyVaultStatus = {
  isLocked: false,
  hasPin: false,
  platform: 'zeuge',
  privacyMode: false,
  coreConnected: true,
};

function policyFor(mode: VaultProtectionMode): VaultKeyPolicyModel {
  return normalizeVaultKeyPolicy({ ...DEFAULT_VAULT_KEY_POLICY, protectionMode: mode });
}

/** Der Fehlercode des Gates, oder `null` wenn es durchgelassen hat. */
function gateError(
  policy: VaultKeyPolicyModel,
  supplied: string | null | undefined,
  active: string | null | undefined,
  status: KeyVaultStatus = STATUS,
): string | null {
  try {
    validateVaultUiSessionGate(policy, supplied, active, status);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'kein_error';
  }
}

/** Die Stelle des ersten Unterschieds — nur zur Absicherung, dass dieser Zeuge nicht leer laeuft. */
function firstDifferenceIndex(left: string, right: string): number {
  const bound = Math.min(left.length, right.length);
  for (let position = 0; position < bound; position += 1) {
    if (left.charCodeAt(position) !== right.charCodeAt(position)) return position;
  }
  return left.length === right.length ? -1 : bound;
}

const BOUND = VAULT_CREDENTIAL_MAXIMUM_LENGTH;
const SECRET_128 = 'A'.repeat(BOUND - 1) + 'Z';
const DIFFER_FIRST = 'B' + 'A'.repeat(BOUND - 1);
const DIFFER_LAST = 'A'.repeat(BOUND - 1) + 'Y';

describe('Der Vergleich leistet volle Arbeit, unabhaengig von der Lage des Unterschieds', () => {
  it('gleich lange Eingaben mit Unterschied an verschiedener Stelle haben dieselbe Schrittzahl', () => {
    // Absicherung gegen einen leeren Zeugen: die drei Eingaben unterscheiden sich tatsaechlich an
    // verschiedenen Stellen. Ein Abbruch beim ersten Unterschied MUSS daher verschiedene Zahlen liefern.
    expect(firstDifferenceIndex(DIFFER_FIRST, SECRET_128)).toBe(0);
    expect(firstDifferenceIndex(DIFFER_LAST, SECRET_128)).toBe(BOUND - 1);
    expect(firstDifferenceIndex(SECRET_128, SECRET_128)).toBe(-1);

    const atFirst = compareVaultCredentials(DIFFER_FIRST, SECRET_128, BOUND);
    const atLast = compareVaultCredentials(DIFFER_LAST, SECRET_128, BOUND);
    const identical = compareVaultCredentials(SECRET_128, SECRET_128, BOUND);

    expect(atFirst.steps).toBe(BOUND);
    expect(atLast.steps).toBe(atFirst.steps);
    expect(identical.steps).toBe(atFirst.steps);

    // Und das Ergebnis bleibt richtig: nur die identische Eingabe ist gleich.
    expect(atFirst.equal).toBe(false);
    expect(atLast.equal).toBe(false);
    expect(identical.equal).toBe(true);
  });

  it('die Laengendifferenz ist konstante Arbeit und kein Abbruch davor', () => {
    const short = 'A'.repeat(3);
    const long = 'A'.repeat(BOUND);
    // Gleiche Laenge, verschiedene Laenge — die Schrittzahl bleibt die Schranke.
    expect(compareVaultCredentials(short, long, BOUND).steps).toBe(BOUND);
    expect(compareVaultCredentials(long, short, BOUND).steps).toBe(BOUND);
    expect(compareVaultCredentials('', long, BOUND).steps).toBe(BOUND);
    expect(compareVaultCredentials('', '', BOUND).steps).toBe(BOUND);
    // Ein Praefix ist kein Gleichstand: die Laenge geht in den Akkumulator ein.
    expect(compareVaultCredentials('A'.repeat(3), 'A'.repeat(3), BOUND).equal).toBe(true);
    expect(compareVaultCredentials('A'.repeat(3), 'A'.repeat(4), BOUND).equal).toBe(false);
  });

  it('die Schrittzahl haengt nicht von der Laenge des Geheimnisses ab', () => {
    const supplied = 'A'.repeat(BOUND);
    const observed = new Set<number>();
    for (let length = 1; length <= BOUND; length += 1) {
      observed.add(compareVaultCredentials(supplied, 'A'.repeat(length), BOUND).steps);
    }
    // Ein einziger Wert fuer 128 verschiedene Geheimnislaengen.
    expect(Array.from(observed)).toEqual([BOUND]);
  });

  it('die Schrittzahl haengt nur von der Angreifereingabe und der oeffentlichen Schranke ab', () => {
    const expected = 'A'.repeat(BOUND);
    // Ueberlange Eingabe: die Korrektheitsuntergrenze greift, die Zahl ist max(Schranke, Eingabelaenge) —
    // eine Funktion der Eingabe, nicht des Geheimnisses.
    const overlong = 'A'.repeat(BOUND + 50);
    expect(compareVaultCredentials(overlong, expected, BOUND).steps).toBe(BOUND + 50);
    expect(compareVaultCredentials(overlong, expected, BOUND).equal).toBe(false);
    // Derselbe ueberlange Angreiferwert gegen ein kuerzeres Geheimnis: dieselbe Schrittzahl.
    expect(compareVaultCredentials(overlong, 'A'.repeat(20), BOUND).steps).toBe(BOUND + 50);
  });

  it('eine zu kleine Schranke erzeugt niemals ein falsches Gleichstandsergebnis', () => {
    // Diese Untergrenze ist die Korrektheitszusage: ein Aufrufer mit zu kleiner Schranke darf die
    // Ausweisprüfung nicht umgehen koennen.
    expect(compareVaultCredentials('XXXX', 'XXXY', 0).equal).toBe(false);
    expect(compareVaultCredentials('XXXX', 'XXXY', 1).equal).toBe(false);
    expect(compareVaultCredentials('ABCD', 'ABCD', 1).equal).toBe(true);
    expect(compareVaultCredentials('ABCD', 'ABCD', 0).steps).toBe(4);
  });
});

describe('Der Vergleich ist fuer jede Eingabe genauso richtig wie der alte Ausdruck', () => {
  const pairs: ReadonlyArray<readonly [string, string]> = [
    ['', ''],
    ['', 'a'],
    ['a', ''],
    ['a', 'a'],
    ['a', 'b'],
    ['abc', 'abc'],
    ['abc', 'abd'],
    ['abc', 'ab'],
    ['ab', 'abc'],
    ['A'.repeat(BOUND), 'A'.repeat(BOUND)],
    ['A'.repeat(BOUND), 'A'.repeat(BOUND - 1) + 'B'],
    ['👁️🗨️', '👁️🗨️'],
    ['👁️', '👁\u200d'],
    ['\u0000a', '\u0000b'],
    ['\u0000', '\u0000'],
    ['a\tb', 'a\tb'],
    ['a\tb', 'a b'],
    ['Straße', 'Strasse'],
  ];

  it('equal stimmt fuer jede Paarung mit === ueberein', () => {
    for (const [left, right] of pairs) {
      expect(compareVaultCredentials(left, right, BOUND).equal).toBe(left === right);
    }
  });

  it('equal stimmt auch bei zu kleiner Schranke mit === ueberein', () => {
    for (const [left, right] of pairs) {
      expect(compareVaultCredentials(left, right, 2).equal).toBe(left === right);
    }
  });
});

describe('Das Gate verhaelt sich unveraendert', () => {
  const passwordPolicy = policyFor('portable_password');
  const pinPolicy = policyFor('device_pin');
  const devicePolicy = policyFor('device');
  const PASSWORD = 'korrekte-pferde-batterie';
  const PIN = '4821';

  it('ein gueltiger Ausweis kommt durch', () => {
    expect(gateError(passwordPolicy, PASSWORD, PASSWORD)).toBeNull();
    expect(gateError(pinPolicy, PIN, PIN)).toBeNull();
    // Ein PIN wird getrimmt, bevor er verglichen wird.
    expect(gateError(pinPolicy, ' 4821 ', PIN)).toBeNull();
    expect(gateError(passwordPolicy, '  ' + PASSWORD + '  ', '  ' + PASSWORD + '  ')).toBeNull();
  });

  it('ein falscher Ausweis wird mit vault_wrong_credential abgewiesen', () => {
    expect(gateError(passwordPolicy, 'X' + PASSWORD.slice(1), PASSWORD)).toBe('vault_wrong_credential');
    expect(gateError(passwordPolicy, PASSWORD.slice(0, -1) + 'X', PASSWORD)).toBe('vault_wrong_credential');
    expect(gateError(passwordPolicy, PASSWORD + 'X', PASSWORD)).toBe('vault_wrong_credential');
    expect(gateError(passwordPolicy, PASSWORD.slice(1), PASSWORD)).toBe('vault_wrong_credential');
    expect(gateError(pinPolicy, '4822', PIN)).toBe('vault_wrong_credential');
    expect(gateError(pinPolicy, '14821', PIN)).toBe('vault_wrong_credential');
  });

  it('ein Leerwert sperrt weiterhin, statt durchzurutschen', () => {
    // Der alte Ausdruck sperrte bei `!expected`. Ein zeitkonstanter Vergleich zweier leerer Zeichenketten
    // meldet Gleichstand — diese vier Faelle sind die Probe darauf, dass daraus kein Durchlassen wurde.
    expect(gateError(passwordPolicy, '', '')).toBe('vault_password_format_invalid');
    expect(gateError(passwordPolicy, null, null)).toBe('vault_password_format_invalid');
    expect(gateError(passwordPolicy, undefined, undefined)).toBe('vault_password_format_invalid');
    expect(gateError(passwordPolicy, PASSWORD, null)).toBe('vault_password_format_invalid');
    expect(gateError(passwordPolicy, null, PASSWORD)).toBe('vault_password_format_invalid');
    expect(gateError(passwordPolicy, PASSWORD, '')).toBe('vault_password_format_invalid');
    expect(gateError(passwordPolicy, '', PASSWORD)).toBe('vault_password_format_invalid');
  });

  it('die Formatpruefung bleibt der Formatpruefung vorbehalten', () => {
    expect(gateError(passwordPolicy, 'kurz', PASSWORD)).toBe('vault_password_format_invalid');
    expect(gateError(passwordPolicy, 'a'.repeat(BOUND + 1), PASSWORD)).toBe('vault_password_format_invalid');
    expect(gateError(pinPolicy, 'abc', PIN)).toBe('vault_pin_format_invalid');
    expect(gateError(pinPolicy, '12', PIN)).toBe('vault_pin_format_invalid');
    expect(gateError(pinPolicy, '123456789', PIN)).toBe('vault_pin_format_invalid');
  });

  it('device bleibt ohne Ausweis und sperrt, wenn der Anbieter gesperrt meldet', () => {
    expect(gateError(devicePolicy, undefined, undefined)).toBeNull();
    expect(gateError(devicePolicy, 'egal', 'egal')).toBeNull();
    expect(gateError(devicePolicy, undefined, undefined, { ...STATUS, isLocked: true })).toBe('vault_keyvault_locked');
  });

  it('eine fehlende Hardware-Vorbedingung verhindert das Entsperren wie zuvor', () => {
    const demanding = normalizeVaultKeyPolicy({ ...passwordPolicy, hardwarePreference: 'required' });
    expect(gateError(demanding, PASSWORD, PASSWORD, { ...STATUS, hardwareBacked: false }))
      .toBe('vault_hardware_backing_required_unavailable');
  });
});

describe('Die Schleifenschranke ist die Formatgrenze selbst', () => {
  it('kein Ausweis erreicht den Vergleich mit mehr Zeichen als die Schranke', () => {
    // Genau die Schranke wird angenommen ...
    expect(validateVaultCredential('portable_password', 'a'.repeat(BOUND))).toHaveLength(BOUND);
    // ... und ein Zeichen mehr wird am Format abgewiesen. Damit ist BOUND eine bewiesene Obergrenze
    // fuer jeden Wert, der den Vergleich ueberhaupt erreicht.
    expect(() => validateVaultCredential('portable_password', 'a'.repeat(BOUND + 1))).toThrow(/vault_password_format_invalid/u);
  });

  it('die PIN-Grenze liegt unter der Schranke', () => {
    expect(validateVaultCredential('device_pin', '12345678')).toHaveLength(8);
    expect(() => validateVaultCredential('device_pin', '123456789')).toThrow(/vault_pin_format_invalid/u);
    expect(8).toBeLessThanOrEqual(BOUND);
  });

  it('ein Aufruf mit einem Geheimnis an der Schranke leckt seine Laenge nicht', () => {
    // Der schaerfste Fall: das Geheimnis ist genau so lang wie die Schranke, die Eingabe kuerzer.
    const supplied = 'A'.repeat(BOUND - 1) + 'B';
    const observed = new Set<number>();
    for (const secretLength of [BOUND - 1, BOUND]) {
      observed.add(compareVaultCredentials(supplied, 'A'.repeat(secretLength - 1) + 'C', BOUND).steps);
    }
    expect(Array.from(observed)).toEqual([BOUND]);
  });
});

/**
 * Die vier Zahlen, die der Auftraggeber verlangt hat — als dauerhafte Zusage, nicht als einmalige Ausgabe.
 * (a) vollstaendig gleich, (b) nur das letzte Zeichen verschieden, (c) nur das erste Zeichen verschieden,
 * (d) um ein Zeichen kuerzer. **Alle vier muessen DIESELBE Schrittzahl liefern.** (d) ist der
 * Laengen-Leck-Test und der schwierigste: eine Laengensperre vor der Schleife faellt genau hier auf.
 */
describe('Die vier Zahlen des Auftraggebers sind identisch', () => {
  const PASSWORD = 'korrekte-pferde-batterie';
  const PIN = '4821';
  const passwordPolicy = policyFor('portable_password');
  const pinPolicy = policyFor('device_pin');

  const passwordCases: ReadonlyArray<readonly [string, string]> = [
    ['a vollstaendig gleich', PASSWORD],
    ['b letztes Zeichen verschieden', PASSWORD.slice(0, -1) + 'X'],
    ['c erstes Zeichen verschieden', 'X' + PASSWORD.slice(1)],
    ['d ein Zeichen kuerzer', PASSWORD.slice(0, -1)],
  ];

  it('a, b, c und d liefern fuer ein Kennwort dieselbe Schrittzahl', () => {
    const observed = passwordCases.map(([name, supplied]) => {
      const comparison = compareVaultCredentials(supplied, PASSWORD, BOUND);
      return { name, steps: comparison.steps, equal: comparison.equal };
    });
    for (const entry of observed) expect(entry.steps).toBe(BOUND);
    expect(new Set(observed.map((entry) => entry.steps)).size).toBe(1);
    // Und das Ergebnis bleibt trotzdem richtig — nur (a) ist ein Gleichstand.
    expect(observed.map((entry) => entry.equal)).toEqual([true, false, false, false]);
  });

  it('dasselbe fuer einen PIN', () => {
    const pinCases: ReadonlyArray<readonly [string, string]> = [
      ['a vollstaendig gleich', PIN],
      ['b letztes Zeichen verschieden', PIN.slice(0, -1) + '9'],
      ['c erstes Zeichen verschieden', '9' + PIN.slice(1)],
      ['d ein Zeichen kuerzer', PIN.slice(0, -1)],
    ];
    const observed = pinCases.map(([, supplied]) => compareVaultCredentials(supplied, PIN, BOUND));
    for (const comparison of observed) expect(comparison.steps).toBe(BOUND);
    expect(new Set(observed.map((comparison) => comparison.steps)).size).toBe(1);
    expect(observed.map((comparison) => comparison.equal)).toEqual([true, false, false, false]);
  });

  it('und das Gate unterscheidet die vier Faelle weiterhin richtig', () => {
    expect(gateError(passwordPolicy, passwordCases[0][1], PASSWORD)).toBeNull();
    expect(gateError(passwordPolicy, passwordCases[1][1], PASSWORD)).toBe('vault_wrong_credential');
    expect(gateError(passwordPolicy, passwordCases[2][1], PASSWORD)).toBe('vault_wrong_credential');
    expect(gateError(passwordPolicy, passwordCases[3][1], PASSWORD)).toBe('vault_wrong_credential');
    expect(gateError(pinPolicy, PIN, PIN)).toBeNull();
    expect(gateError(pinPolicy, PIN.slice(0, -1) + '9', PIN)).toBe('vault_wrong_credential');
    expect(gateError(pinPolicy, PIN.slice(0, -1), PIN)).toBe('vault_pin_format_invalid');
  });
});
