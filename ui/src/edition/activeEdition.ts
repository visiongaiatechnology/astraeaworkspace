import type { WorkspaceDocument } from '../shared/contracts/workspace';
import { createEditionRegistry } from './registry';
import type { AstraeaEdition, EditionRegistry } from './contracts';

export function resolveAstraeaEdition(
  configuredEdition: string | undefined,
  isDevelopment: boolean,
): AstraeaEdition {
  if (configuredEdition === 'open-core' || configuredEdition === 'premium') {
    return configuredEdition;
  }
  if ((configuredEdition === undefined || configuredEdition === '') && isDevelopment) {
    return 'premium';
  }
  throw new Error('Astraea edition is not configured. Build with the open-core or premium mode.');
}

export const ACTIVE_EDITION: AstraeaEdition = resolveAstraeaEdition(
  import.meta.env.VITE_ASTRAEA_EDITION,
  import.meta.env.DEV,
);

export const ACTIVE_EDITION_REGISTRY = createEditionRegistry(ACTIVE_EDITION);

export function filterDocumentsForEdition(
  documents: Readonly<Record<string, WorkspaceDocument>>,
  registry: EditionRegistry = ACTIVE_EDITION_REGISTRY,
): Record<string, WorkspaceDocument> {
  const allowedEntries = Object.entries(documents).filter(([, document]) =>
    registry.isImplementedApp(document.kind),
  );
  return Object.fromEntries(allowedEntries);
}
