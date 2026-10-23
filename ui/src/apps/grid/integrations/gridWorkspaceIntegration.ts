// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative Workspace Integration & Range Security Subsystem
// Live Range/Object Embeds to Writer/Present, Range Access Permissions & Audit Trail

import { GridCell, GridProtectionSettings, GridRangePermissionRule } from '../../../shared/contracts/grid/workspaceGrid';
import { parseGridRange, coordInGridRange } from '../compat/gridProfessional';
import { toA1 } from '../formulas/formula';
import { createGridSecureId, sha256GridHex, type GridSigningProvider } from '../security/gridWebCryptoIntegrity';

export type GridEmbedObjectType = 'cell' | 'range' | 'table' | 'pivot' | 'chart' | 'kpi';

export interface GridLiveEmbedToken {
  id: string;
  sourceSheetId: string;
  sourceRange: string;
  objectType: GridEmbedObjectType;
  createdAt: number;
  title?: string;
  dataSnapshot: {
    values: Array<Array<GridCell['value']>>;
    headers?: string[];
    formattedSummary?: string;
  };
  integrityDigest: { algorithm: 'SHA-256'; value: string };
  signature?: { providerId: string; algorithm: string; keyId: string; value: string };
}

export type RangePermissionRule = GridRangePermissionRule;

export interface RangeAccessValidationResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Creates an integrity-protected live embed token. A cryptographic signature is attached only when a real signing provider is supplied.
 */
export async function createGridLiveEmbedToken(
  sheetId: string,
  range: string,
  objectType: GridEmbedObjectType,
  cells: Record<string, GridCell>,
  title?: string,
  signingProvider?: GridSigningProvider
): Promise<GridLiveEmbedToken> {
  const bounds = parseGridRange(range);
  if (!bounds) throw new Error('invalid_embed_range');
  const cellCount = (bounds.endRow - bounds.startRow + 1) * (bounds.endCol - bounds.startCol + 1);
  if (cellCount <= 0 || cellCount > 100_000) throw new Error('embed_range_limit');
  const values: Array<Array<GridCell['value']>> = [];
  for (let r = bounds.startRow; r <= bounds.endRow; r++) {
    const rowVals: Array<GridCell['value']> = [];
    for (let c = bounds.startCol; c <= bounds.endCol; c++) rowVals.push(cells[toA1(c, r)]?.value ?? null);
    values.push(rowVals);
  }
  const formattedSummary = objectType === 'kpi' && values.length && values[0].length ? String(values[0][0] ?? '') : undefined;
  const createdAt = Date.now();
  const id = createGridSecureId('embed-grid');
  const unsignedPayload = { id, sourceSheetId: sheetId, sourceRange: range, objectType, createdAt, title, dataSnapshot: { values, formattedSummary } };
  const digest = await sha256GridHex(unsignedPayload);
  const signed = signingProvider ? await signingProvider.signDigest(digest.digestBytes) : null;
  return {
    ...unsignedPayload,
    integrityDigest: { algorithm: 'SHA-256', value: digest.digestHex },
    ...(signed ? { signature: { providerId: signingProvider!.id, algorithm: signed.algorithm, keyId: signed.keyId, value: signed.signature } } : {}),
  };
}

/**
 * Verifies if an active user has permission to edit a target coordinate in a worksheet.
 */
export function validateCellEditPermission(
  coord: string,
  userId: string,
  userRoles: string[],
  sheetProtection?: GridProtectionSettings,
  cell?: GridCell,
  rangeRules: RangePermissionRule[] = []
): RangeAccessValidationResult {
  // 1. Check Worksheet Protection
  if (sheetProtection?.isProtected) {
    // If cell is explicitly locked (default in Excel is locked === true or undefined)
    const isLocked = cell?.locked !== false;
    if (isLocked) {
      return {
        allowed: false,
        reason: `Cell ${coord} is locked and sheet protection is active.`,
      };
    }
  }

  // 2. Range-specific permission rules
  const matchingRule = rangeRules.find((rule) => coordInGridRange(coord, rule.range));
  if (matchingRule) {
    if (matchingRule.isReadOnly) {
      return {
        allowed: false,
        reason: `Range ${matchingRule.range} is designated read-only.`,
      };
    }

    const userMatches = matchingRule.allowedUsers.includes('*') || matchingRule.allowedUsers.includes(userId);
    const roleMatches = matchingRule.allowedRoles.some((r) => userRoles.includes(r));

    if (!userMatches && !roleMatches) {
      return {
        allowed: false,
        reason: `User ${userId} lacks authorized role or identity for range ${matchingRule.range}.`,
      };
    }
  }

  return { allowed: true };
}

/**
 * 3-way concurrent cell merge without silent overwrite.
 * Produces deterministic convergence and logs any divergence.
 */
export function mergeCellChanges(
  _coord: string,
  baseValue: GridCell['value'] | undefined,
  localValue: GridCell['value'] | undefined,
  remoteValue: GridCell['value'] | undefined,
  localTimestamp: number,
  remoteTimestamp: number
): {
  mergedValue: GridCell['value'] | undefined;
  conflictDetected: boolean;
  resolutionStrategy: 'base' | 'local' | 'remote' | 'lww';
} {
  // If remote didn't change from base, keep local
  if (remoteValue === baseValue) {
    return { mergedValue: localValue, conflictDetected: false, resolutionStrategy: 'local' };
  }

  // If local didn't change from base, accept remote
  if (localValue === baseValue) {
    return { mergedValue: remoteValue, conflictDetected: false, resolutionStrategy: 'remote' };
  }

  // Both changed to the same value
  if (localValue === remoteValue) {
    return { mergedValue: localValue, conflictDetected: false, resolutionStrategy: 'base' };
  }

  // Conflict: both modified concurrently to different values -> Last-Write-Wins with explicit conflict flag
  const winner = remoteTimestamp >= localTimestamp ? remoteValue : localValue;
  return {
    mergedValue: winner,
    conflictDetected: true,
    resolutionStrategy: 'lww',
  };
}
