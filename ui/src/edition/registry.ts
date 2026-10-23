import { APP_CATALOG, findAppMetadataByExtension, isAppKind } from './catalog';
import { RELEASE_STATUS_BY_APP, isCreatableInBeta } from './releaseStatus';
import {
  ALL_APP_KINDS,
  OPEN_CORE_APP_KINDS,
  PREMIUM_ONLY_APP_KINDS,
  type AppKind,
  type CatalogOnlyAppDescriptor,
  type EditionRegistry,
  type ImplementedAppDescriptor,
  type KnownAppExtensionRecognition,
  type AstraeaEdition,
  type ReleaseStatus,
} from './contracts';


const MAX_FILENAME_LENGTH = 4096;
const VALID_EXTENSION = /^\.[a-z0-9]{1,16}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

function implementedDescriptor(
  metadata: Readonly<(typeof APP_CATALOG)[number]>,
): ImplementedAppDescriptor {
  return Object.freeze({ ...metadata, availability: 'implemented' as const });
}

function catalogOnlyDescriptor(
  metadata: Readonly<(typeof APP_CATALOG)[number]>,
): CatalogOnlyAppDescriptor {
  return Object.freeze({ ...metadata, availability: 'premium-required' as const });
}

function metadataForKind(kind: AppKind): Readonly<(typeof APP_CATALOG)[number]> {
  const metadata = APP_CATALOG.find((app) => app.kind === kind);
  if (!metadata) throw new Error('Edition registry metadata is incomplete.');
  return metadata;
}

function extractExtension(candidate: unknown): string | null {
  if (
    typeof candidate !== 'string' ||
    candidate.length === 0 ||
    candidate.length > MAX_FILENAME_LENGTH ||
    CONTROL_CHARACTERS.test(candidate)
  ) {
    return null;
  }

  const basenameStart = Math.max(candidate.lastIndexOf('/'), candidate.lastIndexOf('\\')) + 1;
  const basename = candidate.slice(basenameStart);
  if (basename.length === 0) return null;

  const extensionStart = basename.lastIndexOf('.');
  if (extensionStart < 0) return null;

  const extension = basename.slice(extensionStart).toLowerCase();
  return VALID_EXTENSION.test(extension) ? extension : null;
}

export function createEditionRegistry(edition: AstraeaEdition): EditionRegistry {
  if (edition !== 'open-core' && edition !== 'premium') {
    throw new RangeError('Unsupported Astraea edition.');
  }

  const implementedKindsForEdition = edition === 'premium' ? ALL_APP_KINDS : OPEN_CORE_APP_KINDS;
  const implementedApps: readonly ImplementedAppDescriptor[] = Object.freeze(
    implementedKindsForEdition.map((kind) => implementedDescriptor(metadataForKind(kind))),
  );

  const catalogApps: readonly CatalogOnlyAppDescriptor[] = Object.freeze(
    edition === 'open-core'
      ? PREMIUM_ONLY_APP_KINDS.map((kind) => catalogOnlyDescriptor(metadataForKind(kind)))
      : [],
  );

  const implementedKinds: ReadonlySet<AppKind> = new Set(implementedApps.map((app) => app.kind));
  const knownExtensions = Object.freeze(APP_CATALOG.flatMap((app) => app.extension ? [app.extension] : []));
  const editableExtensions = Object.freeze(implementedApps.flatMap((app) => app.extension ? [app.extension] : []));
  /**
   * Die Beta-Freigabe ist **edition-unabhängig** (Produktentscheidung): Admin & Policy bleibt auch in
   * Premium ein gesperrtes Sicherheits-Gate, bis die Durchsetzung nachgewiesen ist. Die Edition entscheidet
   * nur, ob der Code enthalten ist (`isImplementedApp`) — nie, ob eine unzuverlässige Sicherheitszusage
   * angeboten wird.
   */
  const releaseStatuses: Readonly<Record<AppKind, ReleaseStatus>> = Object.freeze({ ...RELEASE_STATUS_BY_APP });
  const creatableApps: readonly ImplementedAppDescriptor[] = Object.freeze(
    implementedApps.filter((app) => isCreatableInBeta(app.kind)),
  );

  const registry: EditionRegistry = {
    edition,
    implementedApps,
    creatableApps,
    catalogApps,
    knownExtensions,
    editableExtensions,
    releaseStatuses,
    isImplementedApp(kind: unknown): kind is AppKind {
      return isAppKind(kind) && implementedKinds.has(kind);
    },
    isCreationAvailable(kind: unknown): kind is AppKind {
      return isAppKind(kind) && implementedKinds.has(kind) && isCreatableInBeta(kind);
    },
    getReleaseStatus(kind: AppKind): ReleaseStatus {
      return releaseStatuses[kind];
    },
    getImplementedApp(kind: AppKind) {
      return implementedApps.find((app) => app.kind === kind);
    },
    getCatalogOnlyApp(kind: AppKind) {
      return catalogApps.find((app) => app.kind === kind);
    },
    recognizeKnownExtension(candidate: unknown): KnownAppExtensionRecognition | null {
      const extension = extractExtension(candidate);
      if (extension === null) return null;

      const metadata = findAppMetadataByExtension(extension);
      if (!metadata?.extension) return null;

      return Object.freeze({
        kind: metadata.kind,
        extension: metadata.extension,
        availability: implementedKinds.has(metadata.kind) ? 'implemented' : 'premium-required',
      });
    },
  };

  return Object.freeze(registry);
}

export { OPEN_CORE_APP_KINDS, PREMIUM_ONLY_APP_KINDS };
export { ALL_APP_KINDS } from './contracts';
