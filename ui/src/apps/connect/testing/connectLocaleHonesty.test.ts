// STATUS: PLATIN — der Waechter gegen eine Sicherheitszusage ohne Pruefung.
import { describe, expect, it } from 'vitest';
import { connectCopy } from '../locale/connectLocale';
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';

/**
 * Gemessen am 2026-10-16: `contactsDescription` sagte in VIER von sieben
 * Sprachen eine kryptografische GPG-Verifikation zu —
 *
 *   en  "Cryptographically authenticated address book with GPG public-key
 *        fingerprint verification."
 *   ru  "Криптографически аутентифицированная адресная книга с проверкой
 *        отпечатка открытого ключа GPG."
 *   it  "Rubrica autenticata crittograficamente con verifica dell'impronta
 *        della chiave pubblica GPG."
 *   es  "Agenda autenticada criptográficamente con verificación de la huella
 *        de la clave pública GPG."
 *
 * während drei Sprachen die Wahrheit sagten (de, ja, zh: gespeichert und
 * angezeigt, aber NICHT geprüft).
 *
 * UND ES GIBT KEINE PRÜFUNG: der Fingerabdruck ist ein Freitextfeld
 * (`ConnectContactsView.tsx:31,71`), und `connectComposeCore.ts:130-132` sagt
 * wörtlich „There is no key material in this build".
 *
 * Dieser Test hält fest, dass KEINE Sprache eine Schlüssel- oder
 * Fingerabdruckprüfung zusagt. Er wird rot, sobald eine Sprache sie
 * zurückbekommt — und genau das ist die Absicht: eine Sicherheitszusage ohne
 * Prüfung ist nach Paragraf 1 verboten.
 */
const LOCALES: readonly WorkspaceLocale[] = [
  'de-DE', 'en-US', 'ru-RU', 'it-IT', 'es-ES', 'ja-JP', 'zh-CN',
];

/** Die Wörter, mit denen die vier Fassungen die Prüfung zugesagt haben. */
const VERIFICATION_CLAIMS: readonly string[] = [
  'gpg',
  'kryptografisch',
  'cryptographically',
  'криптографически',
  'crittograficamente',
  'criptográficamente',
  'autenticata',
  'autenticada',
  'authenticated address book',
  'аутентифицированная адресная книга',
];

describe('Connect contactsDescription ist in jeder Sprache ehrlich', () => {
  it('sagt in keiner der sieben Sprachen eine Schlüsselprüfung zu', () => {
    for (const locale of LOCALES) {
      const text = connectCopy(locale).contactsDescription.toLocaleLowerCase(locale);
      for (const claim of VERIFICATION_CLAIMS) {
        expect(
          text.includes(claim.toLocaleLowerCase(locale)),
          `${locale}: "${claim}" darf nicht vorkommen, gefunden in: ${text}`,
        ).toBe(false);
      }
    }
  });

  it('nennt das Adressbuch in jeder Sprache lokal und die Anzeige ohne Prüfung', () => {
    // Die drei ehrlichen Sprachen formulierten es in eigenen Worten; die vier
    // anderen wurden auf denselben Sachverhalt gezogen. Geprüft wird deshalb
    // nicht ein einzelnes Wort, sondern dass jeder Text die SPEICHERUNG nennt
    // und die PRÜFUNG verneint — beides ist der Kern der Aussage.
    const storageWords: readonly string[] = [
      'gespeichert', 'stored', 'сохраняются', 'salvate', 'guardan',
      '保存', '保存',
    ];
    const negationWords: readonly string[] = [
      'nicht geprüft', 'not verified', 'не проверяются', 'non verificate',
      'no se verifican', '検証はされません', '不会验证',
    ];
    for (const locale of LOCALES) {
      const text = connectCopy(locale).contactsDescription;
      expect(
        storageWords.some((word) => text.includes(word)),
        `${locale}: der Text muss die Speicherung nennen: ${text}`,
      ).toBe(true);
      expect(
        negationWords.some((word) => text.includes(word)),
        `${locale}: der Text muss die Prüfung verneinen: ${text}`,
      ).toBe(true);
    }
  });
});
