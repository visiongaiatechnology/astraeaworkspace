// STATUS: PLATIN — honest Beta release tiers and security-gate decisions for every app kind.
//
// **Warum dieses Modul existiert:** `availability: 'implemented' | 'premium-required'` beantwortet nur
// „ist der Code in dieser Edition enthalten?". Es sagt **nichts** darüber, ob eine App im Beta-Release
// ehrlich als Kernmodul, als Vorschau oder als Sicherheits-Gate angeboten werden darf. Genau diese Lücke
// erzeugte falsch-positive „verfügbar"-Kennzeichnungen: Admin & Policy wurde als vollwertige
// Governance-Konsole angeboten, obwohl ihre Richtlinien von keinem Workspace-Modul durchgesetzt werden.
//
// **Eine Quelle, kein zweites Urteil:** Start-Center, App-Launcher und die App-Ansichten lesen denselben
// Katalog. Die Labels entsprechen der vom Nutzer vorgegebenen Release-Priorisierung (Beta 0.1):
//   • Kernmodule (Beta): Writer, Grid, Present, Notes, Tasks
//   • Basis + Vorschau: Whiteboard, Draw, PDF Studio
//   • Feature Preview: Publish, Insight
//   • Begrenzte Preview: Connect, Automate
//   • Sicherheits-Gate: Vault (geprüft freigegeben), Admin & Policy (in Beta gesperrt)
//
// **Sicherheitsgrenze:** Dieses Modul ist reine Kennzeichnung. Es lockert keine bestehende Sicherheit und
// ersetzt keinen Gate-Check in einem sicherheitskritischen Pfad; es verhindert nur das *Anbieten* einer
// Funktion, für die die Beta keine belastbare Zusage machen kann.

import type { AppKind } from './contracts';

export type ReleaseStatus =
  | 'core-beta'
  | 'base-preview'
  | 'feature-preview'
  | 'limited-preview'
  | 'security-gate-approved'
  | 'security-gate-blocked'
  | 'premium-only';

export type SecurityGateDecision = 'approved' | 'blocked';

export interface ReleaseCopy {
  readonly de: string;
  readonly en: string;
}

export interface ReleaseStatusDefinition {
  /** Sichtbares Label — kurz, ehrlich, ohne Marketing-Sprache. */
  readonly label: ReleaseCopy;
  /** Begründung / Grenze, als Tooltip und in der App sichtbar. */
  readonly detail: ReleaseCopy;
  /** Darf die App im Beta-Release neu angelegt und geöffnet angeboten werden? */
  readonly creatableInBeta: boolean;
}

/**
 * Die verbindliche Beta-Priorisierung je App-Art.
 *
 * `premium-only` heißt: nicht Teil von Open Core (Edition entscheidet). Es ist **kein** Beta-Gate.
 */
export const RELEASE_STATUS_BY_APP: Readonly<Record<AppKind, ReleaseStatus>> = Object.freeze({
  Writer: 'core-beta',
  Grid: 'core-beta',
  Present: 'core-beta',
  Notes: 'core-beta',
  Tasks: 'core-beta',

  Whiteboard: 'base-preview',
  Draw: 'base-preview',
  PdfStudio: 'base-preview',

  Publish: 'feature-preview',
  Insight: 'feature-preview',

  Connect: 'limited-preview',
  Automate: 'limited-preview',

  Vault: 'security-gate-approved',
  AdminPolicy: 'security-gate-blocked',

  Planner: 'premium-only',
  Projects: 'premium-only',
  Forms: 'premium-only',
  Database: 'premium-only',
  Spaces: 'premium-only',
  GaiaCom: 'premium-only',
});

export const RELEASE_STATUS_DEFINITIONS: Readonly<Record<ReleaseStatus, ReleaseStatusDefinition>> = Object.freeze({
  'core-beta': {
    label: { de: 'ALPHA · Kernfunktion', en: 'ALPHA · core feature' },
    detail: {
      de: 'Alpha 0.1: Kernfunktion ist nutzbar, die App befindet sich aber weiterhin im Aufbau. Randfunktionen können fehlen; vorhandene Kernpfade sind getestet.',
      en: 'Alpha 0.1: the core feature is usable, but the app is still under construction. Peripheral features may be missing; existing core paths are tested.',
    },
    creatableInBeta: true,
  },
  'base-preview': {
    label: { de: 'ALPHA · Basis, im Ausbau', en: 'ALPHA · base, under construction' },
    detail: {
      de: 'Alpha 0.1: Grundfunktionen vorhanden, die App ist aber noch im Ausbau. Nicht alle Funktionen sind verfügbar — als Vorschau gekennzeichnet, nicht als fertiges Produkt.',
      en: 'Alpha 0.1: basic functions exist, but the app is still under construction. Not all features are available — labelled as preview, not as a finished product.',
    },
    creatableInBeta: true,
  },
  'feature-preview': {
    label: { de: 'ALPHA · Feature Preview, im Ausbau', en: 'ALPHA · feature preview, under construction' },
    detail: {
      de: 'Alpha 0.1: neue Funktion als Vorschau freigegeben, die App ist noch im Ausbau. Nicht alle Funktionen sind verfügbar; der Umfang kann sich ändern.',
      en: 'Alpha 0.1: new feature released as a preview while the app is still under construction. Not all features are available; behaviour may change.',
    },
    creatableInBeta: true,
  },
  'limited-preview': {
    label: { de: 'ALPHA · begrenzt, im Ausbau', en: 'ALPHA · limited, under construction' },
    detail: {
      de: 'Alpha 0.1: nur ein bewusst begrenzter Teil des geplanten Funktionsumfangs ist freigegeben; die App ist noch im Ausbau.',
      en: 'Alpha 0.1: only a deliberately limited part of the planned feature set is released; the app is still under construction.',
    },
    creatableInBeta: true,
  },
  'security-gate-approved': {
    label: { de: 'ALPHA · Sicherheits-Gate geprüft', en: 'ALPHA · security gate reviewed' },
    detail: {
      de: 'Verschlüsselung im Container, Sperren/Entsperren mit PIN oder Passwort und Wiederherstellung sind geprüft. Grenzen der Beta: im Gerätemodus sperrt „Lock now" nur die Oberfläche ohne eigenen Ausweis; die PIN hat 4–8 Ziffern; es gibt keinen universellen Wiederherstellungsschlüssel — ohne Ausweis oder Backup bleibt ein Tresor unlesbar.',
      en: 'Container encryption, lock/unlock with PIN or password, and restore are reviewed. Beta limits: in device mode, “Lock now” only locks the UI without a separate credential; the PIN is 4–8 digits; there is no universal recovery key — without credential or backup a vault stays unreadable.',
    },
    creatableInBeta: true,
  },
  'security-gate-blocked': {
    label: { de: 'IM AUSBAU · Sicherheits-Gate gesperrt', en: 'IN PROGRESS · security gate locked' },
    detail: {
      de: 'Richtlinien werden angezeigt und in der Konsole bewertet, aber von den Modulen des Workspace noch nicht durchgesetzt. Eine angezeigte Regel ist keine durchgesetzte Regel — deshalb in Alpha 0.1 nicht freigegeben und nicht neu anlegbar.',
      en: 'Policies are displayed and evaluated inside the console, but not enforced by the Workspace modules. A displayed rule is not an enforced rule — therefore not released and not creatable in Alpha 0.1.',
    },
    creatableInBeta: false,
  },
  'premium-only': {
    label: { de: 'Nur Premium', en: 'Premium only' },
    detail: {
      de: 'Nicht Teil von Open Core. Die Edition entscheidet über die Verfügbarkeit.',
      en: 'Not part of Open Core. Availability is decided by the edition.',
    },
    creatableInBeta: true,
  },
});

/** Der Release-Status einer App-Art (jede `AppKind` ist abgedeckt — compile-time geprüft). */
export function releaseStatusOf(kind: AppKind): ReleaseStatus {
  return RELEASE_STATUS_BY_APP[kind];
}

export function releaseStatusDefinition(kind: AppKind): ReleaseStatusDefinition {
  return RELEASE_STATUS_DEFINITIONS[releaseStatusOf(kind)];
}

/** `approved`/`blocked` nur für die beiden Sicherheits-Gate-Apps, sonst `null`. */
export function securityGateDecisionOf(kind: AppKind): SecurityGateDecision | null {
  const status = releaseStatusOf(kind);
  if (status === 'security-gate-approved') return 'approved';
  if (status === 'security-gate-blocked') return 'blocked';
  return null;
}

/** Darf die App im Beta-Release als „neu anlegen" angeboten werden? Edition-scope bleibt separat. */
export function isCreatableInBeta(kind: AppKind): boolean {
  return releaseStatusDefinition(kind).creatableInBeta;
}

/** Ein Label, das ein Nutzer sieht; DE für deutschsprachige Locales, sonst EN (bewusster Beta-Fallback). */
export function releaseStatusLabel(kind: AppKind, locale: string): string {
  return pickLocale(releaseStatusDefinition(kind).label, locale);
}

/** Die Begründung/Grenze für Tooltip und Gate-Ansicht. */
export function releaseStatusDetail(kind: AppKind, locale: string): string {
  return pickLocale(releaseStatusDefinition(kind).detail, locale);
}

/**
 * Legende für Start-Center und App-Launcher: erklärt die fünf Beta-Stufen in einer Zeile. Ein Katalog,
 * der Kernmodule und Vorschauen nebeneinander zeigt, muss die Stufen benennen — sonst liest ein Nutzer
 * „vorhanden" als „fertig".
 */
export function releaseTierLegend(locale: string): string {
  return pickLocale({
    de: 'Release-Status Alpha 0.1: Kernfunktion · Basis im Ausbau · Feature Preview im Ausbau · begrenzte Funktionen im Ausbau · Sicherheits-Gate (geprüft / gesperrt)',
    en: 'Alpha 0.1 release status: core feature · base under construction · feature preview under construction · limited features under construction · security gate (reviewed / locked)',
  }, locale);
}

/** Kurzer englischer/germanischer Statusname für Datenattribute und Diagnose. */
export function releaseStatusKey(kind: AppKind): ReleaseStatus {
  return releaseStatusOf(kind);
}

/**
 * **Verfügbarkeits-/Alpha-Kennzeichnung (Beta 0.1).**
 *
 * Die Release-Stufen beantworten „wie weit ist die App?"; diese zweite, bewusst grobe Achse beantwortet
 * die Frage, die ein Nutzer tatsächlich stellt: **kann ich die App im beworbenen Umfang benutzen?**
 *   • `alpha`       — im beworbenen Umfang nutzbar (Kernmodule + freigegebenes Sicherheits-Gate Vault).
 *   • `in-progress` — nicht alle angekündigten Funktionen verfügbar (Preview-Stufen, gesperrte Gates).
 *
 * **Keine Aufwertung:** Diese Funktion leitet ausschließlich aus den bestehenden Release-Stufen ab. Sie
 * kann keine App „fertig" machen; eine Stufe lässt sich nur in `RELEASE_STATUS_DEFINITIONS` ändern.
 * Die sichtbaren Texte (Badge/Hinweis) kommen aus dem 7-Sprachen-Katalog (`availability.*`).
 */
export type AppAvailabilityClass = 'alpha' | 'in-progress';

const AVAILABILITY_BY_RELEASE_STATUS: Readonly<Record<ReleaseStatus, AppAvailabilityClass>> = Object.freeze({
  'core-beta': 'alpha',
  'base-preview': 'in-progress',
  'feature-preview': 'in-progress',
  'limited-preview': 'in-progress',
  'security-gate-approved': 'alpha',
  'security-gate-blocked': 'in-progress',
  'premium-only': 'in-progress',
});

/** Die ehrliche Verfügbarkeitsklasse einer App-Art für Start-Center und App-Rundgang. */
export function availabilityClassOf(kind: AppKind): AppAvailabilityClass {
  return AVAILABILITY_BY_RELEASE_STATUS[releaseStatusOf(kind)];
}

/** Begründung der Einstufung in einem Satz (für Tooltip/Diagnose, DE/EN-Fallback). */
export function availabilityReason(kind: AppKind, locale: string): string {
  const status = releaseStatusOf(kind);
  const reasons: Readonly<Record<ReleaseStatus, ReleaseCopy>> = {
    'core-beta': {
      de: 'Alpha-Kernfunktion: der beworbene Funktionsumfang ist nutzbar und getestet; die App ist weiterhin im Aufbau, Randfunktionen können fehlen.',
      en: 'Alpha core feature: the advertised scope is usable and tested; the app is still under construction, peripheral features may be missing.',
    },
    'base-preview': {
      de: 'Alpha-Basis im Ausbau: Grundfunktionen sind vorhanden, aber nicht alle Funktionen sind verfügbar.',
      en: 'Alpha base under construction: basic functions exist, but not all features are available.',
    },
    'feature-preview': {
      de: 'Alpha-Feature-Preview im Ausbau: als Vorschau freigegeben; nicht alle Funktionen sind verfügbar und der Umfang kann sich ändern.',
      en: 'Alpha feature preview under construction: released as a preview; not all features are available and the set may change.',
    },
    'limited-preview': {
      de: 'Alpha mit begrenzten Funktionen: nur ein bewusst begrenzter Teil des geplanten Umfangs ist freigegeben; die App ist im Ausbau.',
      en: 'Alpha with limited features: only a deliberately limited part of the planned scope is released; the app is under construction.',
    },
    'security-gate-approved': {
      de: 'Alpha-Sicherheits-Gate geprüft: Verschlüsselung, Sperren mit PIN/Passwort und Wiederherstellung sind getestet; die Grenzen stehen in der App, die App bleibt im Aufbau. Alpha-Grenzen: im Gerätemodus sperrt „Lock now“ nur die Oberfläche ohne eigenen Ausweis; die PIN hat 4–8 Ziffern; es gibt keinen universellen Wiederherstellungsschlüssel — ohne Ausweis oder Backup bleibt ein Tresor unlesbar.',
      en: 'Alpha security gate reviewed: encryption, PIN/password lock, and restore are tested; the limits are stated in the app and the app remains under construction. Alpha limits: in device mode, “Lock now” only locks the UI without a separate credential; the PIN is 4–8 digits; there is no universal recovery key — without credential or backup a vault stays unreadable.',
    },
    'security-gate-blocked': {
      de: 'Sicherheits-Gate im Ausbau: Richtlinien werden angezeigt, aber von keinem Workspace-Modul durchgesetzt — deshalb gesperrt.',
      en: 'Security gate under construction: policies are displayed but not enforced by any Workspace module — therefore locked.',
    },
    'premium-only': {
      de: 'Nicht Teil von Open Core; die Edition entscheidet über die Verfügbarkeit.',
      en: 'Not part of Open Core; availability is decided by the edition.',
    },
  };
  return pickLocale(reasons[status], locale);
}

function pickLocale(copy: ReleaseCopy, locale: string): string {
  return locale.toLowerCase().startsWith('de') ? copy.de : copy.en;
}
