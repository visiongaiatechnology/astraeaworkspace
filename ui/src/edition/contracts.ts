import type { DocumentKind as WorkspaceDocumentKind } from '../shared/contracts/documentKind';

import type { ReleaseStatus } from './releaseStatus';

export type { ReleaseStatus };

export type AstraeaEdition = 'open-core' | 'premium';

export const ALL_APP_KINDS = [
  'Writer',
  'Grid',
  'Present',
  'Notes',
  'PdfStudio',
  'Tasks',
  'Planner',
  'Projects',
  'Whiteboard',
  'Draw',
  'Forms',
  'Database',
  'Vault',
  'Spaces',
  'AdminPolicy',
  'GaiaCom',
  'Publish',
  'Insight',
  'Connect',
  'Automate',
] as const satisfies readonly WorkspaceDocumentKind[];

export type AppKind = (typeof ALL_APP_KINDS)[number];

type Assert<T extends true> = T;

/** Compile-time failure if the persisted DocumentKind union gains an unregistered kind. */
export type WorkspaceDocumentKindCoverage = Assert<
  Exclude<WorkspaceDocumentKind, AppKind> extends never ? true : false
>;

export const PREMIUM_ONLY_APP_KINDS = [
  'Projects',
  'Planner',
  'Database',
  'Forms',
  'Spaces',
  'GaiaCom',
] as const satisfies readonly AppKind[];

export type PremiumOnlyAppKind = (typeof PREMIUM_ONLY_APP_KINDS)[number];
export type OpenCoreAppKind = Exclude<AppKind, PremiumOnlyAppKind>;

export const OPEN_CORE_APP_KINDS = [
  'Writer',
  'Grid',
  'Present',
  'Notes',
  'PdfStudio',
  'Tasks',
  'Whiteboard',
  'Draw',
  'Vault',
  'AdminPolicy',
  'Publish',
  'Insight',
  'Connect',
  'Automate',
] as const satisfies readonly OpenCoreAppKind[];

export type AppCategory = 'productivity' | 'work' | 'collaboration' | 'platform';

export interface AppCatalogMetadata {
  readonly kind: AppKind;
  readonly name: string;
  readonly shortName: string;
  readonly category: AppCategory;
  readonly extension?: string;
  readonly description: string;
}

export type ImplementedAppDescriptor = Readonly<
  AppCatalogMetadata & { availability: 'implemented' }
>;

export type CatalogOnlyAppDescriptor = Readonly<
  AppCatalogMetadata & { availability: 'premium-required' }
>;

export interface KnownAppExtensionRecognition {
  readonly kind: AppKind;
  readonly extension: string;
  readonly availability: 'implemented' | 'premium-required';
}

export interface EditionRegistry {
  readonly edition: AstraeaEdition;
  readonly implementedApps: readonly ImplementedAppDescriptor[];
  /**
   * Die Apps, die in dieser Edition **und** im Beta-Release neu angelegt werden dürfen. Sicherheits-Gates
   * mit „blocked"-Entscheidung fehlen hier, obwohl ihr Code vorhanden ist. Jeder Erstellungsweg (Explorer,
   * Start-Center, Launcher, Shell) soll diese Liste statt `implementedApps` verwenden.
   */
  readonly creatableApps: readonly ImplementedAppDescriptor[];
  readonly catalogApps: readonly CatalogOnlyAppDescriptor[];
  /** Recognized suffixes supported by this source edition. */
  readonly knownExtensions: readonly string[];
  /** Suffixes whose app kind is implemented by this edition. */
  readonly editableExtensions: readonly string[];
  /**
   * Ehrlicher Release-Status jeder App-Art im Beta-Release (Kernmodul, Vorschau, Sicherheits-Gate).
   * Unabhängig von `isImplementedApp`: Code kann vorhanden sein, ohne im Beta freigegeben zu sein.
   */
  readonly releaseStatuses: Readonly<Record<AppKind, ReleaseStatus>>;
  isImplementedApp(kind: unknown): kind is AppKind;
  getImplementedApp(kind: AppKind): ImplementedAppDescriptor | undefined;
  getCatalogOnlyApp(kind: AppKind): CatalogOnlyAppDescriptor | undefined;
  /** Release-Status der App-Art — dieselbe Quelle wie Start-Center und App-Launcher. */
  getReleaseStatus(kind: AppKind): ReleaseStatus;
  /**
   * `true` nur wenn die App in dieser Edition implementiert **und** für die Beta als „neu anlegen"
   * freigegeben ist. Sicherheits-Gates wie Admin & Policy sind bewusst nicht freigegeben.
   */
  isCreationAvailable(kind: unknown): kind is AppKind;
  /**
   * Matches a filename/path suffix only. This does not authenticate, inspect,
   * parse, trust, open, or modify the file contents.
   */
  recognizeKnownExtension(candidate: unknown): KnownAppExtensionRecognition | null;
}
