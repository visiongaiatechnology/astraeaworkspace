// STATUS: PLATIN — Bounded semantic interaction contracts; app execution adapters remain an open gate.
import type { DocumentKind, WorkspaceObject } from '../contracts/workspace';

export const WORKSPACE_DRAG_PAYLOAD_SCHEMA = 'astraea.workspace.drag' as const;
export const WORKSPACE_DRAG_PAYLOAD_VERSION = 1 as const;
export const WORKSPACE_DRAG_PAYLOAD_MAX_BYTES = 4_096;
export const WORKSPACE_DRAG_THRESHOLD_PX = 6;

export const WORKSPACE_DROP_INTENTS = [
  'MOVE',
  'COPY',
  'LIVE_REFERENCE',
  'FROZEN_SNAPSHOT',
] as const;

export type WorkspaceDropIntent = (typeof WORKSPACE_DROP_INTENTS)[number];
export type WorkspaceObjectKind = WorkspaceObject['type'];

export const WORKSPACE_OBJECT_KINDS: readonly WorkspaceObjectKind[] = [
  'TextBlock',
  'Table',
  'Shape',
  'Chart',
  'WorkspaceReference',
  'MediaAsset',
  'CommentReview',
  'WorkItemRef',
  'DataRecord',
  'PolicyMetadata',
  'ExtensionObject',
];

export const WORKSPACE_DOCUMENT_KINDS: readonly DocumentKind[] = [
  'Writer', 'Grid', 'Present', 'Notes', 'PdfStudio', 'Draw', 'Whiteboard',
  'Forms', 'Database', 'Publish', 'Insight', 'Tasks', 'Planner', 'Projects',
  'Vault', 'Spaces', 'Connect', 'Automate', 'AdminPolicy', 'GaiaCom',
];

export interface WorkspaceObjectDescriptor {
  readonly documentId: string;
  readonly objectId: string;
  readonly objectKind: WorkspaceObjectKind;
  readonly sourceApp: DocumentKind;
  readonly supportedIntents: readonly WorkspaceDropIntent[];
}

export interface WorkspaceDragPayload {
  readonly schema: typeof WORKSPACE_DRAG_PAYLOAD_SCHEMA;
  readonly version: typeof WORKSPACE_DRAG_PAYLOAD_VERSION;
  readonly descriptor: WorkspaceObjectDescriptor;
}

export type WorkspaceInteractionErrorCode =
  | 'payload_invalid'
  | 'payload_too_large'
  | 'payload_version_unsupported'
  | 'identifier_invalid'
  | 'intent_unknown'
  | 'object_kind_unknown'
  | 'app_unknown'
  | 'registry_unsealed'
  | 'registry_manifest_invalid'
  | 'registry_manifest_duplicate'
  | 'registry_manifest_missing'
  | 'registry_adapter_invalid'
  | 'registry_adapter_id_duplicate'
  | 'registry_adapter_route_duplicate'
  | 'registry_adapter_route_missing'
  | 'registry_read_only'
  | 'drop_target_document_missing'
  | 'drop_source_document_missing'
  | 'drop_source_object_missing'
  | 'drop_identity_mismatch'
  | 'drop_authorization_failed'
  | 'drop_intent_not_supported'
  | 'drop_intent_choice_required'
  | 'drop_move_transaction_unavailable'
  // **Paket 15** ✓: Ein Live-Verweis **ohne** gewählten Modus ist ein **benannter** Fehlschlag ✗ — *nie ein
  // heimlicher Default auf „Live" oder „Frozen"* ✓✓.
  | 'drop_live_mode_required'
  // **W-455** ✓✓: Die Zusage „Admin-Policy bei **jedem** Ablagevorgang" wird **durchgesetzt** — *fail-closed* ✓.
  // *Drei Gruende, weil drei Tatsachen:* **fehlend oder ungueltig** ist **derselbe** Grund ✗✓ (*fail-closed*),
  // **`Deny`** und **`RequireApproval`** sind **verschieden** ✓ — *eine Ablehnung ist keine Freigabe, und das
  // muss der Benutzer unterscheiden koennen* ✓✓. *Kein vierter Zustand: `Allow` ist kein Grund, sondern der Weg
  // **weiter wie bisher*** ✓. **Das Komma oben ist die Unterschrift ②** ✗✓✓: *nach `drop_live_mode_required`
  // folgt `drag_already_active` — jede eingefuegte Zeile braucht ihr eigenes Komma, sonst frisst die Vereinigung
  // die Nachbarzeile* ✗✓.
  | 'drop_policy_decision_required'
  | 'drop_policy_denied'
  | 'drop_policy_approval_required'
  | 'drag_already_active'
  | 'drag_pointer_invalid'
  | 'drag_point_invalid'
  | 'drag_threshold_invalid';

const ERROR_MESSAGES: Readonly<Record<WorkspaceInteractionErrorCode, string>> = {
  payload_invalid: 'The workspace drag payload is invalid.',
  payload_too_large: 'The workspace drag payload exceeds its size limit.',
  payload_version_unsupported: 'The workspace drag payload version is unsupported.',
  identifier_invalid: 'A workspace interaction identifier is invalid.',
  intent_unknown: 'The requested workspace drop intent is unknown.',
  object_kind_unknown: 'The workspace object kind is unknown.',
  app_unknown: 'The workspace app kind is unknown.',
  registry_unsealed: 'The workspace interaction registry is not sealed.',
  registry_manifest_invalid: 'The workspace interaction manifest is invalid.',
  registry_manifest_duplicate: 'The workspace interaction manifest is already registered.',
  registry_manifest_missing: 'A required workspace interaction manifest is unavailable.',
  registry_adapter_invalid: 'The workspace drop adapter is invalid.',
  registry_adapter_id_duplicate: 'The workspace drop adapter identifier is already registered.',
  registry_adapter_route_duplicate: 'The workspace drop adapter route is already registered.',
  registry_adapter_route_missing: 'No compatible workspace drop adapter is registered.',
  registry_read_only: 'The workspace interaction registry is read-only.',
  drop_target_document_missing: 'The workspace drop target is unavailable.',
  drop_source_document_missing: 'The workspace drop source is unavailable.',
  drop_source_object_missing: 'The workspace drag source object is unavailable.',
  drop_identity_mismatch: 'The workspace drag source identity could not be verified.',
  drop_authorization_failed: 'The workspace drop is not authorized.',
  drop_intent_not_supported: 'The requested workspace drop intent is not supported.',
  drop_intent_choice_required: 'A workspace drop intent must be selected.',
  drop_move_transaction_unavailable: 'Transactional workspace moves are not available.',
  drop_live_mode_required: 'A live workspace reference requires an explicit Live or Frozen mode.',
  // **W-455**: der sichtbare Satz kommt aus **dieser** einen Definition ✓ — *die zwei erschoepfenden Abbildungen
  // der Zonen tragen ihre deutschen Saetze getrennt, weil dort Deutsch die Sprache der Oberflaeche ist* ✓✓.
  drop_policy_decision_required: 'The workspace drop has no policy decision, or its policy decision is invalid.',
  drop_policy_denied: 'The workspace policy denies this drop.',
  drop_policy_approval_required: 'The workspace policy requires an approval for this drop.',
  drag_already_active: 'A workspace drag is already active.',
  drag_pointer_invalid: 'The workspace drag pointer is invalid.',
  drag_point_invalid: 'The workspace drag coordinates are invalid.',
  drag_threshold_invalid: 'The workspace drag threshold is invalid.',
};

export class WorkspaceInteractionError extends Error {
  readonly code: WorkspaceInteractionErrorCode;

  constructor(code: WorkspaceInteractionErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'WorkspaceInteractionError';
    this.code = code;
  }
}

export function isWorkspaceDropIntent(value: unknown): value is WorkspaceDropIntent {
  return typeof value === 'string' && (WORKSPACE_DROP_INTENTS as readonly string[]).includes(value);
}

export function isWorkspaceObjectKind(value: unknown): value is WorkspaceObjectKind {
  return typeof value === 'string' && (WORKSPACE_OBJECT_KINDS as readonly string[]).includes(value);
}

export function isWorkspaceDocumentKind(value: unknown): value is DocumentKind {
  return typeof value === 'string' && (WORKSPACE_DOCUMENT_KINDS as readonly string[]).includes(value);
}
