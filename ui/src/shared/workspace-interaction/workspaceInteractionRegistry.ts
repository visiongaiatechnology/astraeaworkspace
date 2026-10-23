// STATUS: PLATIN — Explicit sealed manifests and deterministic drop-adapter routes.
import { assertStableWorkspaceId } from '../../platform/workspace/model/workspaceObjectModel';
import {
  WORKSPACE_DROP_INTENTS,
  WorkspaceInteractionError,
  isWorkspaceDocumentKind,
  isWorkspaceDropIntent,
  isWorkspaceObjectKind,
  type WorkspaceDropIntent,
  type WorkspaceObjectKind,
} from './workspaceInteractionTypes';
import type { DocumentKind } from '../contracts/workspace';

export interface WorkspaceObjectCapabilities {
  readonly objectKind: WorkspaceObjectKind;
  readonly intents: readonly WorkspaceDropIntent[];
}

export interface WorkspaceInteractionAppManifest {
  readonly app: DocumentKind;
  readonly exports: readonly WorkspaceObjectCapabilities[];
  readonly imports: readonly WorkspaceObjectCapabilities[];
}

export interface WorkspaceDropAdapterDefinition {
  readonly id: string;
  readonly targetApp: DocumentKind;
  readonly objectKinds: readonly WorkspaceObjectKind[];
  readonly intents: readonly WorkspaceDropIntent[];
}

function normalizeCapabilities(value: unknown): readonly WorkspaceObjectCapabilities[] {
  if (!Array.isArray(value) || value.length > 64) throw new WorkspaceInteractionError('registry_manifest_invalid');
  const seenKinds = new Set<string>();
  const normalized: WorkspaceObjectCapabilities[] = [];
  for (const item of value as unknown[]) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new WorkspaceInteractionError('registry_manifest_invalid');
    const capability = item as Record<string, unknown>;
    if (!isWorkspaceObjectKind(capability.objectKind) || !Array.isArray(capability.intents)) {
      throw new WorkspaceInteractionError('registry_manifest_invalid');
    }
    if (seenKinds.has(capability.objectKind)) throw new WorkspaceInteractionError('registry_manifest_invalid');
    seenKinds.add(capability.objectKind);
    if (capability.intents.length === 0 || capability.intents.length > WORKSPACE_DROP_INTENTS.length) {
      throw new WorkspaceInteractionError('registry_manifest_invalid');
    }
    const intents: WorkspaceDropIntent[] = [];
    for (const intent of capability.intents as unknown[]) {
      if (!isWorkspaceDropIntent(intent) || intents.includes(intent)) {
        throw new WorkspaceInteractionError('registry_manifest_invalid');
      }
      intents.push(intent);
    }
    normalized.push(Object.freeze({ objectKind: capability.objectKind, intents: Object.freeze(intents) }));
  }
  return Object.freeze(normalized);
}

function routeKey(app: DocumentKind, kind: WorkspaceObjectKind, intent: WorkspaceDropIntent): string {
  return `${app}\u0000${kind}\u0000${intent}`;
}

function hasCapability(
  capabilities: readonly WorkspaceObjectCapabilities[],
  objectKind: WorkspaceObjectKind,
  intent: WorkspaceDropIntent,
): boolean {
  return capabilities.some((item) => item.objectKind === objectKind && item.intents.includes(intent));
}

export class WorkspaceInteractionRegistry {
  private readonly manifests = new Map<DocumentKind, WorkspaceInteractionAppManifest>();
  private readonly adaptersById = new Map<string, WorkspaceDropAdapterDefinition>();
  private readonly adaptersByRoute = new Map<string, WorkspaceDropAdapterDefinition>();
  private sealed = false;

  registerAppManifest(manifest: WorkspaceInteractionAppManifest): void {
    this.assertWritable();
    if (!manifest || !isWorkspaceDocumentKind(manifest.app)) throw new WorkspaceInteractionError('registry_manifest_invalid');
    if (this.manifests.has(manifest.app)) throw new WorkspaceInteractionError('registry_manifest_duplicate');
    const normalized = Object.freeze({
      app: manifest.app,
      exports: normalizeCapabilities(manifest.exports),
      imports: normalizeCapabilities(manifest.imports),
    });
    this.manifests.set(normalized.app, normalized);
  }

  registerAdapter(adapter: WorkspaceDropAdapterDefinition): void {
    this.assertWritable();
    if (!adapter || !isWorkspaceDocumentKind(adapter.targetApp) || !Array.isArray(adapter.objectKinds) || !Array.isArray(adapter.intents)) {
      throw new WorkspaceInteractionError('registry_adapter_invalid');
    }
    try {
      assertStableWorkspaceId(adapter.id, 'Workspace adapter id');
    } catch {
      throw new WorkspaceInteractionError('registry_adapter_invalid');
    }
    if (this.adaptersById.has(adapter.id)) throw new WorkspaceInteractionError('registry_adapter_id_duplicate');
    const targetManifest = this.manifests.get(adapter.targetApp);
    if (!targetManifest) throw new WorkspaceInteractionError('registry_manifest_missing');
    if (adapter.objectKinds.length === 0 || adapter.objectKinds.length > 64 || adapter.intents.length === 0 || adapter.intents.length > WORKSPACE_DROP_INTENTS.length) {
      throw new WorkspaceInteractionError('registry_adapter_invalid');
    }
    const objectKinds: WorkspaceObjectKind[] = [];
    for (const kind of adapter.objectKinds as readonly unknown[]) {
      if (!isWorkspaceObjectKind(kind) || objectKinds.includes(kind)) throw new WorkspaceInteractionError('registry_adapter_invalid');
      objectKinds.push(kind);
    }
    const intents: WorkspaceDropIntent[] = [];
    for (const intent of adapter.intents as readonly unknown[]) {
      if (!isWorkspaceDropIntent(intent) || intents.includes(intent)) throw new WorkspaceInteractionError('registry_adapter_invalid');
      intents.push(intent);
    }
    for (const kind of objectKinds) {
      for (const intent of intents) {
        if (!hasCapability(targetManifest.imports, kind, intent)) throw new WorkspaceInteractionError('registry_adapter_invalid');
        if (this.adaptersByRoute.has(routeKey(adapter.targetApp, kind, intent))) {
          throw new WorkspaceInteractionError('registry_adapter_route_duplicate');
        }
      }
    }
    const normalized = Object.freeze({
      id: adapter.id,
      targetApp: adapter.targetApp,
      objectKinds: Object.freeze(objectKinds),
      intents: Object.freeze(intents),
    });
    this.adaptersById.set(normalized.id, normalized);
    for (const kind of objectKinds) {
      for (const intent of intents) this.adaptersByRoute.set(routeKey(normalized.targetApp, kind, intent), normalized);
    }
  }

  seal(): this {
    this.sealed = true;
    return this;
  }

  get isSealed(): boolean {
    return this.sealed;
  }

  getManifest(app: DocumentKind): WorkspaceInteractionAppManifest | undefined {
    return this.manifests.get(app);
  }

  getAdapter(targetApp: DocumentKind, objectKind: WorkspaceObjectKind, intent: WorkspaceDropIntent): WorkspaceDropAdapterDefinition | undefined {
    return this.adaptersByRoute.get(routeKey(targetApp, objectKind, intent));
  }

  getCompatibleIntents(
    sourceApp: DocumentKind,
    targetApp: DocumentKind,
    objectKind: WorkspaceObjectKind,
  ): readonly WorkspaceDropIntent[] {
    const source = this.manifests.get(sourceApp);
    const target = this.manifests.get(targetApp);
    if (!source || !target) return [];
    return WORKSPACE_DROP_INTENTS.filter((intent) =>
      hasCapability(source.exports, objectKind, intent)
      && hasCapability(target.imports, objectKind, intent)
      && this.adaptersByRoute.has(routeKey(targetApp, objectKind, intent)));
  }

  private assertWritable(): void {
    if (this.sealed) throw new WorkspaceInteractionError('registry_read_only');
  }
}
