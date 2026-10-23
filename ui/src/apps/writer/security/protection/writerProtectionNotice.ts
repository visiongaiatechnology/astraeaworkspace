// STATUS: DIAMANT VGT SUPREME — User-facing protection state for Writer
import type { WriterProtectionMode } from '../../types';
import {
  canComment,
  canEditText,
  canFillForms,
  canFormat,
  canManageRevisions,
  requiresTrackedChanges,
} from './writerProtectionEngine';

/**
 * A capability the document protection can take away. The keys are semantic, so
 * the editor can render them in the user's language instead of shipping hardcoded
 * German strings from the engine.
 */
export type WriterProtectionCapability =
  | 'edit-text'
  | 'format'
  | 'comment'
  | 'fill-forms'
  | 'manage-revisions';

export interface WriterProtectionNotice {
  readonly mode: WriterProtectionMode;
  /** True when ordinary text editing is possible (unprotected or tracked changes). */
  readonly editable: boolean;
  /** True for every mode other than `none`; drives the visible blockade. */
  readonly restricted: boolean;
  readonly requiresTrackedChanges: boolean;
  /** Capabilities this mode blocks, in a stable order. Empty when unrestricted. */
  readonly blockedCapabilities: readonly WriterProtectionCapability[];
}

const CAPABILITY_ORDER: readonly WriterProtectionCapability[] = [
  'edit-text',
  'format',
  'comment',
  'fill-forms',
  'manage-revisions',
];

/**
 * Resolves the protection state once, from the engine's own predicates. The
 * notice never re-implements a permission rule — it only reports what the engine
 * decided, so a change to the rules cannot leave the visible blockade behind.
 */
export function resolveWriterProtectionNotice(mode?: WriterProtectionMode): WriterProtectionNotice {
  const resolvedMode: WriterProtectionMode = mode ?? 'none';
  const allowed: Record<WriterProtectionCapability, boolean> = {
    'edit-text': canEditText(resolvedMode),
    format: canFormat(resolvedMode),
    comment: canComment(resolvedMode),
    'fill-forms': canFillForms(resolvedMode),
    'manage-revisions': canManageRevisions(resolvedMode),
  };
  const blockedCapabilities = CAPABILITY_ORDER.filter((capability) => !allowed[capability]);
  return {
    mode: resolvedMode,
    editable: allowed['edit-text'],
    restricted: resolvedMode !== 'none',
    requiresTrackedChanges: requiresTrackedChanges(resolvedMode),
    blockedCapabilities,
  };
}
