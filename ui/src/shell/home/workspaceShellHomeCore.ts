// STATUS: DIAMANT VGT SUPREME — canonical Workspace Shell & Home orchestration core.
// Shell state is orchestration-only. It never becomes a second persistent document truth.

import type { DocumentKind, WorkspaceDocument } from '../../shared/contracts/workspace';
import type { RecoverySnapshotInfo } from '../../platform/recovery/recovery';
import type { ShellRecentEntry } from '../platform/workspaceShellPlatform';
import type { WorkspaceSaveFailureCode } from '../../shell/persistence/workspaceSaveFailure';

export const SHELL_LIMITS = Object.freeze({
  maxOpenDocuments: 64,
  maxClosedHistory: 32,
  maxPinnedDocuments: 32,
  maxCommands: 256,
  maxShortcutLength: 48,
  maxOpenIngressBytes: 128 * 1024 * 1024,
  maxDropFiles: 32,
  maxDeepLinkLength: 2048,
  maxWindowCoordinate: 100_000,
  minWindowWidth: 640,
  minWindowHeight: 480,
  maxWindowWidth: 16_384,
  maxWindowHeight: 16_384,
});

export const SHELL_INSTANCE_POLICY = 'multi-instance-process-isolated' as const;


export type ShellPrimaryEntryId = 'create' | 'open' | 'recent' | 'recovered' | 'templates' | 'vault';
export interface ShellPrimaryEntry {
  id: ShellPrimaryEntryId;
  label: string;
  description: string;
  enabled: boolean;
}

export const SHELL_PRIMARY_ENTRIES: readonly ShellPrimaryEntry[] = Object.freeze([
  { id: 'create', label: 'Create', description: 'Create a local Workspace document.', enabled: true },
  { id: 'open', label: 'Open', description: 'Open a local or explicitly selected supported file.', enabled: true },
  { id: 'recent', label: 'Recent', description: 'Open privacy-preserving local recent metadata.', enabled: true },
  { id: 'recovered', label: 'Recovered', description: 'Inspect encrypted crash-recovery snapshots.', enabled: true },
  { id: 'templates', label: 'Templates', description: 'Create from local, Space or admin templates.', enabled: true },
  { id: 'vault', label: 'Vault', description: 'Open the encrypted sovereign Vault.', enabled: true },
]);

export type ShellRecentAvailability = 'open' | 'stored' | 'missing';
export interface ShellRecentAvailabilityProjection extends ShellRecentEntry {
  availability: ShellRecentAvailability;
  canOpen: boolean;
}

export function projectRecentAvailability(
  entries: readonly ShellRecentEntry[],
  openDocumentIds: ReadonlySet<string>,
  storedDocumentIds: ReadonlySet<string>,
): ShellRecentAvailabilityProjection[] {
  return entries.slice(0, 32).map((entry) => {
    const availability: ShellRecentAvailability = openDocumentIds.has(entry.documentId)
      ? 'open'
      : storedDocumentIds.has(entry.documentId) ? 'stored' : 'missing';
    return { ...entry, availability, canOpen: availability !== 'missing' };
  });
}

export interface ShellRecoveryProjection {
  snapshotId: string;
  timestamp: number;
  documentKind: string;
  protectionStatus: string;
  requiresUnlockFactor: boolean;
}

export function projectRecoveryEntry(snapshot: RecoverySnapshotInfo): ShellRecoveryProjection {
  if (!snapshot.snapshot_id || snapshot.snapshot_id.length > 128) throw new Error('Recovery snapshot identifier is invalid');
  if (!Number.isSafeInteger(snapshot.created_at) || snapshot.created_at <= 0) throw new Error('Recovery timestamp is invalid');
  const documentKind = typeof snapshot.document_kind === 'string' && /^[A-Za-z][A-Za-z0-9]{0,31}$/.test(snapshot.document_kind)
    ? snapshot.document_kind
    : 'Protected';
  const securityProfile = String(snapshot.security_profile || 'STANDARD').slice(0, 48);
  return {
    snapshotId: snapshot.snapshot_id,
    timestamp: snapshot.created_at,
    documentKind,
    protectionStatus: securityProfile,
    requiresUnlockFactor: Boolean(snapshot.requires_pin || snapshot.requires_password || securityProfile === 'VGT_TOP_SECRET'),
  };
}

export type ShellTemplateScope = 'local' | 'space' | 'admin' | 'remote';
export interface ShellTemplateDescriptor {
  id: string;
  name: string;
  kind: DocumentKind;
  scope: ShellTemplateScope;
  sourceRef?: string;
}

function boundedShellText(value: unknown, field: string, max = 160): string {
  if (typeof value !== 'string') throw new Error(`${field} must be text`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\u0000-\u001f]/.test(normalized)) throw new Error(`${field} is invalid`);
  return normalized;
}

export function normalizeTemplateCatalog(
  templates: readonly ShellTemplateDescriptor[],
  options: { allowRemoteCatalog: boolean },
): ShellTemplateDescriptor[] {
  const seen = new Set<string>();
  const out: ShellTemplateDescriptor[] = [];
  for (const candidate of templates.slice(0, 256)) {
    const id = boundedShellText(candidate.id, 'Template ID', 128);
    if (seen.has(id)) continue;
    if (candidate.scope === 'remote' && !options.allowRemoteCatalog) continue;
    const name = boundedShellText(candidate.name, 'Template name', 160);
    const sourceRef = candidate.sourceRef ? boundedShellText(candidate.sourceRef, 'Template source', 512) : undefined;
    seen.add(id);
    out.push({ id, name, kind: candidate.kind, scope: candidate.scope, sourceRef });
  }
  return out;
}

export interface ShellTabState {
  version: 1;
  activeDocumentId: string | null;
  openDocumentIds: string[];
  pinnedDocumentIds: string[];
  recentlyClosedDocumentIds: string[];
}

export interface ShellCloseDecision {
  state: ShellTabState;
  requiresSavePrompt: boolean;
  closedDocumentId: string | null;
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,256}$/.test(value);
}

function uniqueBoundedIds(values: readonly string[], limit: number): string[] {
  return [...new Set(values.filter(validId))].slice(0, limit);
}

export function normalizeShellTabState(input: Partial<ShellTabState>): ShellTabState {
  const openDocumentIds = uniqueBoundedIds(input.openDocumentIds ?? [], SHELL_LIMITS.maxOpenDocuments);
  const pinnedDocumentIds = uniqueBoundedIds(input.pinnedDocumentIds ?? [], SHELL_LIMITS.maxPinnedDocuments)
    .filter((id) => openDocumentIds.includes(id));
  const recentlyClosedDocumentIds = uniqueBoundedIds(input.recentlyClosedDocumentIds ?? [], SHELL_LIMITS.maxClosedHistory)
    .filter((id) => !openDocumentIds.includes(id));
  const activeDocumentId = validId(input.activeDocumentId) && openDocumentIds.includes(input.activeDocumentId)
    ? input.activeDocumentId : openDocumentIds[0] ?? null;
  return { version: 1, activeDocumentId, openDocumentIds, pinnedDocumentIds, recentlyClosedDocumentIds };
}

export function pinShellDocument(state: ShellTabState, documentId: string, pinned: boolean): ShellTabState {
  const normalized = normalizeShellTabState(state);
  if (!normalized.openDocumentIds.includes(documentId)) throw new Error('Only open documents can be pinned');
  const nextPinned = pinned
    ? uniqueBoundedIds([documentId, ...normalized.pinnedDocumentIds], SHELL_LIMITS.maxPinnedDocuments)
    : normalized.pinnedDocumentIds.filter((id) => id !== documentId);
  return { ...normalized, pinnedDocumentIds: nextPinned };
}

export function closeShellDocument(
  state: ShellTabState,
  documentId: string,
  dirtyDocumentIds: ReadonlySet<string>,
  force = false,
): ShellCloseDecision {
  const normalized = normalizeShellTabState(state);
  if (!normalized.openDocumentIds.includes(documentId)) return { state: normalized, requiresSavePrompt: false, closedDocumentId: null };
  if (dirtyDocumentIds.has(documentId) && !force) return { state: normalized, requiresSavePrompt: true, closedDocumentId: null };
  const openDocumentIds = normalized.openDocumentIds.filter((id) => id !== documentId);
  const stateAfter = normalizeShellTabState({
    ...normalized,
    openDocumentIds,
    pinnedDocumentIds: normalized.pinnedDocumentIds.filter((id) => id !== documentId),
    recentlyClosedDocumentIds: [documentId, ...normalized.recentlyClosedDocumentIds],
    activeDocumentId: normalized.activeDocumentId === documentId ? openDocumentIds[0] ?? null : normalized.activeDocumentId,
  });
  return { state: stateAfter, requiresSavePrompt: false, closedDocumentId: documentId };
}

export function reopenClosedShellDocument(state: ShellTabState): ShellTabState {
  const normalized = normalizeShellTabState(state);
  const documentId = normalized.recentlyClosedDocumentIds[0];
  if (!documentId) return normalized;
  return normalizeShellTabState({
    ...normalized,
    openDocumentIds: [...normalized.openDocumentIds, documentId],
    recentlyClosedDocumentIds: normalized.recentlyClosedDocumentIds.slice(1),
    activeDocumentId: documentId,
  });
}

export interface ShellCredentialSession {
  documentId: string;
  hasPin: boolean;
  hasPortablePassword: boolean;
}

export function projectCredentialIsolation(
  documentIds: readonly string[],
  pinDocumentIds: ReadonlySet<string>,
  passwordDocumentIds: ReadonlySet<string>,
): ShellCredentialSession[] {
  return uniqueBoundedIds(documentIds, SHELL_LIMITS.maxOpenDocuments).map((documentId) => ({
    documentId,
    hasPin: pinDocumentIds.has(documentId),
    hasPortablePassword: passwordDocumentIds.has(documentId),
  }));
}

export type ShellOpenIngressSource = 'file-picker' | 'drop' | 'file-association' | 'open-with' | 'deep-link';
export interface ShellOpenIngress {
  source: ShellOpenIngressSource;
  name: string;
  sizeBytes: number;
}

export function normalizeShellOpenIngress(input: ShellOpenIngress): ShellOpenIngress {
  const name = boundedShellText(input.name, 'Open file name', 255);
  if (/[\\/]/.test(name)) throw new Error('Open file name must be a leaf name');
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > SHELL_LIMITS.maxOpenIngressBytes) {
    throw new Error('Open file exceeds the shell boundary');
  }
  return { source: input.source, name, sizeBytes: input.sizeBytes };
}

export type ShellCommandScope = 'global' | 'document' | 'selection' | 'security' | 'navigation';
export interface ShellCommandContext {
  activeDocument: Pick<WorkspaceDocument, 'id' | 'kind'> | null;
  hasSelection: boolean;
  canSave: boolean;
  canInsertChart: boolean;
  vaultAvailable: boolean;
}
export interface ShellCommandDescriptor {
  id: string;
  title: string;
  description: string;
  category: string;
  scope: ShellCommandScope;
  shortcut?: string;
  enabled: boolean;
  disabledReason?: string;
}

const CREATE_COMMANDS: ReadonlyArray<[string, string, DocumentKind]> = [
  ['new-writer', 'New Writer document', 'Writer'], ['new-grid', 'New Grid spreadsheet', 'Grid'],
  ['new-present', 'New Present deck', 'Present'], ['new-notes', 'New Notes notebook', 'Notes'],
  ['new-pdf', 'Open PDF Studio document', 'PdfStudio'], ['new-draw', 'New Draw diagram', 'Draw'],
  ['new-whiteboard', 'New Whiteboard', 'Whiteboard'],
  ['new-publish', 'New Publish document', 'Publish'],
  ['new-insight', 'New Insight report', 'Insight'], ['new-tasks', 'New Tasks document', 'Tasks'],
  ['new-vault', 'New Vault', 'Vault'], ['new-connect', 'New Connect workspace', 'Connect'],
  ['new-automate', 'New Automate flow', 'Automate'], ['new-admin-policy', 'New Admin Policy document', 'AdminPolicy'],
];

export function buildShellCommandRegistry(context: ShellCommandContext): ShellCommandDescriptor[] {
  const commands: ShellCommandDescriptor[] = CREATE_COMMANDS.map(([id, title]) => ({
    id, title, description: `Create ${title.replace(/^New /, '').replace(/^Open /, '')}.`, category: 'Create', scope: 'global', enabled: true,
  }));
  commands.push(
    { id: 'save-vwc', title: 'Save encrypted container', description: 'Persist the active canonical document through the encrypted Workspace container.', category: 'File', scope: 'document', shortcut: 'Ctrl+S', enabled: Boolean(context.activeDocument && context.canSave), disabledReason: 'No active saveable document.' },
    { id: 'backup-workspace', title: 'Back up workspace', description: 'Bundle all loaded documents into one encrypted ZIP backup file.', category: 'File', scope: 'global', enabled: true },
    { id: 'restore-workspace', title: 'Restore workspace backup', description: 'Restore documents from a workspace backup; newer local documents are kept.', category: 'File', scope: 'global', enabled: true },
    { id: 'close-all', title: 'Close all documents', description: 'Close every clean document; dirty documents require explicit save first.', category: 'File', scope: 'global', enabled: Boolean(context.activeDocument), disabledReason: 'No open document.' },
    { id: 'reopen-closed', title: 'Reopen closed tab', description: 'Reopen the most recently closed local document.', category: 'File', scope: 'global', enabled: true },
    { id: 'open-search', title: 'Global search', description: 'Open the canonical Workspace Search hub.', category: 'Navigate', scope: 'navigation', shortcut: 'Ctrl+Alt+F', enabled: true },
    { id: 'open-explorer', title: 'Open Workspace Explorer', description: 'Browse and organize documents in the Workspace Library.', category: 'Navigate', scope: 'navigation', shortcut: 'Ctrl+Alt+E', enabled: true },
    { id: 'open-vault', title: 'Open KeyVault', description: 'Open document protection and KeyVault controls.', category: 'Security', scope: 'security', enabled: context.vaultAvailable, disabledReason: 'KeyVault provider is unavailable.' },
    { id: 'open-netgate', title: 'Open NetGate', description: 'Inspect network policy and capability state.', category: 'Security', scope: 'security', enabled: true },
    { id: 'open-fabric', title: 'Open Workspace Fabric', description: 'Inspect canonical live-object links.', category: 'Fabric', scope: 'global', enabled: true },
    { id: 'insert-chart', title: 'Insert chart', description: 'Insert a chart only when the active document exposes a chart operation.', category: 'Insert', scope: 'selection', enabled: Boolean(context.activeDocument && context.canInsertChart), disabledReason: 'The active context has no chart insertion operation.' },
    { id: 'toggle-privacy', title: 'Toggle privacy mode', description: 'Toggle the explicit local privacy projection.', category: 'Privacy', scope: 'global', enabled: true },
  );
  return commands.slice(0, SHELL_LIMITS.maxCommands);
}

function normalizeShortcut(raw: string): string {
  const parts = raw.split('+').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2 || raw.length > SHELL_LIMITS.maxShortcutLength) throw new Error('Shortcut binding is invalid');
  return parts.map((part) => part.toLowerCase()).join('+');
}

export function diagnoseCommandShortcutConflicts(commands: readonly ShellCommandDescriptor[]): Array<{ shortcut: string; commandIds: string[] }> {
  const reverse = new Map<string, string[]>();
  for (const command of commands) {
    if (!command.shortcut) continue;
    const shortcut = normalizeShortcut(command.shortcut);
    reverse.set(shortcut, [...(reverse.get(shortcut) ?? []), command.id]);
  }
  return [...reverse.entries()].filter(([, ids]) => ids.length > 1).map(([shortcut, commandIds]) => ({ shortcut, commandIds }));
}

export type ShellToolbarCapability = 'format-text' | 'format-cell' | 'insert-chart' | 'insert-shape';
export function contextualToolbarCapabilities(input: {
  documentKind: DocumentKind;
  selectionType: 'text' | 'cell' | 'shape' | 'chart';
  handlers: Partial<Record<ShellToolbarCapability, boolean>>;
}): ShellToolbarCapability[] {
  const out: ShellToolbarCapability[] = [];
  if (input.handlers['format-text'] && (input.selectionType === 'text' || input.documentKind === 'Writer')) out.push('format-text');
  if (input.handlers['format-cell'] && (input.selectionType === 'cell' || input.documentKind === 'Grid')) out.push('format-cell');
  if (input.handlers['insert-chart']) out.push('insert-chart');
  if (input.handlers['insert-shape'] && (input.documentKind === 'Present' || input.documentKind === 'Writer' || input.documentKind === 'Draw')) out.push('insert-shape');
  return out;
}

export type ShellSaveState = 'saved' | 'saved-with-warning' | 'saving' | 'unsaved' | 'error';
export type ShellSyncState = 'local-only' | 'synced' | 'syncing' | 'conflict' | 'error';
export type ShellVerifiedBadge = 'Encrypted container authenticated' | 'PQC provider operational' | 'Top Secret provider ready';
/** **Warum** ein Speichern scheiterte (W-229) — der Grund reist mit der Projektion, damit die Leiste ihn zeigen kann. */
export interface ShellStatusProjection {
  save: ShellSaveState;
  saveFailure?: { readonly code: WorkspaceSaveFailureCode } | null;
  sync: ShellSyncState;
  protection: 'standard' | 'encrypted' | 'pqc' | 'top-secret';
  zoomPercent: number;
  view: string;
  verifiedBadges: ShellVerifiedBadge[];
}

export function deriveShellStatus(input: {
  save: ShellSaveState;
  saveFailure?: { readonly code: WorkspaceSaveFailureCode } | null;
  sync: ShellSyncState;
  securityProfile: 'STANDARD' | 'PQC' | 'VGT_TOP_SECRET';
  encryptedContainerAuthenticated: boolean;
  pqcOperational: boolean;
  topSecretProviderReady: boolean;
  zoomPercent: number;
  view: string;
}): ShellStatusProjection {
  const zoomPercent = Math.max(10, Math.min(500, Math.round(input.zoomPercent)));
  const view = boundedShellText(input.view, 'View state', 64);
  const verifiedBadges: ShellVerifiedBadge[] = [];
  let protection: ShellStatusProjection['protection'] = 'standard';
  if (input.securityProfile === 'STANDARD' && input.encryptedContainerAuthenticated) { protection = 'encrypted'; verifiedBadges.push('Encrypted container authenticated'); }
  if (input.securityProfile === 'PQC' && input.pqcOperational) { protection = 'pqc'; verifiedBadges.push('PQC provider operational'); }
  if (input.securityProfile === 'VGT_TOP_SECRET' && input.topSecretProviderReady) { protection = 'top-secret'; verifiedBadges.push('Top Secret provider ready'); }
  return { save: input.save, saveFailure: input.saveFailure ?? null, sync: input.sync, protection, zoomPercent, view, verifiedBadges };
}

export type ShellNativeCapability = 'dialog.open' | 'dialog.save' | 'clipboard.read' | 'clipboard.write' | 'notification.show';
export interface ShellNativePolicy { allowed: readonly ShellNativeCapability[]; }
export function assertShellNativeCapability(policy: ShellNativePolicy, capability: ShellNativeCapability): void {
  if (!policy.allowed.includes(capability)) throw new Error(`Native capability denied: ${capability}`);
}

export type ShellDesktopPlatform = 'windows' | 'linux' | 'macos' | 'astraeaos';
export interface ShellPlatformAdapterContract {
  platform: ShellDesktopPlatform;
  nativeDialogs: boolean;
  fileAssociations: boolean;
  clipboard: boolean;
  notifications: boolean;
  processBoundIpc: true;
}
export function platformAdapterContract(platform: ShellDesktopPlatform): ShellPlatformAdapterContract {
  return { platform, nativeDialogs: true, fileAssociations: true, clipboard: true, notifications: true, processBoundIpc: true };
}

export interface ShellDeepLink { documentId: string; objectId?: string; }
export function parseShellDeepLink(raw: string): ShellDeepLink {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > SHELL_LIMITS.maxDeepLinkLength) throw new Error('Deep link is invalid');
  const match = /^vgt:\/\/workspace\/document\/([A-Za-z0-9._:-]{1,256})(?:\/object\/([A-Za-z0-9._:-]{1,256}))?$/.exec(raw);
  if (!match) throw new Error('Deep link is outside the Workspace namespace');
  return { documentId: match[1], objectId: match[2] };
}

export interface ShellWindowState { x: number; y: number; width: number; height: number; maximized: boolean; }
export function normalizeWindowState(input: Partial<ShellWindowState>): ShellWindowState {
  const boundedCoord = (value: unknown, fallback: number) => Number.isFinite(value) ? Math.max(-SHELL_LIMITS.maxWindowCoordinate, Math.min(SHELL_LIMITS.maxWindowCoordinate, Math.round(value as number))) : fallback;
  const boundedSize = (value: unknown, min: number, max: number, fallback: number) => Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value as number))) : fallback;
  return {
    x: boundedCoord(input.x, 80), y: boundedCoord(input.y, 80),
    width: boundedSize(input.width, SHELL_LIMITS.minWindowWidth, SHELL_LIMITS.maxWindowWidth, 1280),
    height: boundedSize(input.height, SHELL_LIMITS.minWindowHeight, SHELL_LIMITS.maxWindowHeight, 820),
    maximized: Boolean(input.maximized),
  };
}

export function normalizeShellScale(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.max(100, Math.min(300, Math.round(value / 5) * 5));
}

export function contentSurfaceColorPolicy(kind: DocumentKind): 'content-owned' | 'shell-dark' {
  return new Set<DocumentKind>(['Writer', 'Grid', 'Present', 'PdfStudio', 'Draw', 'Whiteboard', 'Publish']).has(kind)
    ? 'content-owned' : 'shell-dark';
}

export interface ShellIngressMutationResult { accepted: number; rejected: number; }
export function fuzzBoundedShellIngress(inputs: readonly unknown[]): ShellIngressMutationResult {
  let accepted = 0; let rejected = 0;
  for (const item of inputs.slice(0, 4096)) {
    try {
      if (!item || typeof item !== 'object') throw new Error('invalid');
      normalizeShellOpenIngress(item as ShellOpenIngress);
      accepted += 1;
    } catch { rejected += 1; }
  }
  return { accepted, rejected };
}
