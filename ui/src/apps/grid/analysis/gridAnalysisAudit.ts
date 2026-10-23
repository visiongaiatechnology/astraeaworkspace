// STATUS: DIAMANT VGT SUPREME
// Persistable audit records for deterministic Grid analysis outputs.

import type { GridAnalysisAuditKind, GridAnalysisAuditRecord } from '../../../shared/contracts/workspace';
import { createGridSecureId, sha256GridHex } from '../security/gridWebCryptoIntegrity';

const MAX_SUMMARY = 512;
const ENGINE_VERSION = 'grid-analysis-v1';

export async function createGridAnalysisAuditRecord(
  kind: GridAnalysisAuditKind,
  input: unknown,
  result: unknown,
  summary: string,
  sheetId?: string,
): Promise<GridAnalysisAuditRecord> {
  const [inputHash, resultHash] = await Promise.all([sha256GridHex(input), sha256GridHex(result)]);
  return {
    id: createGridSecureId('grid-audit'),
    kind,
    createdAt: Date.now(),
    engineVersion: ENGINE_VERSION,
    sheetId,
    inputDigest: inputHash.digestHex,
    resultDigest: resultHash.digestHex,
    summary: summary.trim().slice(0, MAX_SUMMARY),
  };
}
