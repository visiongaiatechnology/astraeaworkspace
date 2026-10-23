import { useEffect, useMemo, useRef } from 'react';
import type { WorkspaceDocument } from '../../../contracts/workspace';
import type { StoredVaultData } from '../../../contracts/vaultSpaces';
import { refreshVaultWorkspaceFile } from '../../../../platform/workspace-integration/vaultWorkspaceIntegrationEngine';
import { applyVaultVersionRetention, captureVaultFileVersion, normalizeVaultVersionRetention } from '../vaultVersionHistoryEngine';

export function useVaultAutomaticVersions(
  vaultData: StoredVaultData,
  documents: WorkspaceDocument[],
  runtimeLocked: boolean,
  persistVaultData: (updated: Partial<StoredVaultData>) => void,
) {
  const busy = useRef(false);
  const persistRef = useRef(persistVaultData);
  persistRef.current = persistVaultData;
  const signature = useMemo(() => vaultData.files
    .filter((file) => file.sourceType === 'workspace-document' && file.documentId)
    .map((file) => {
      const source = documents.find((document) => document.id === file.documentId);
      return `${file.id}:${file.documentVersion ?? 0}:${source?.version ?? -1}`;
    }).sort().join('|'), [vaultData.files, documents]);

  useEffect(() => {
    if (runtimeLocked || busy.current) return;
    const stale = vaultData.files.filter((file) => {
      if (file.sourceType !== 'workspace-document' || !file.documentId) return false;
      const source = documents.find((document) => document.id === file.documentId);
      return Boolean(source && source.version !== file.documentVersion);
    });
    if (!stale.length) return;
    busy.current = true;
    void (async () => {
      try {
        let versions = [...(vaultData.versions ?? [])];
        let files = [...vaultData.files];
        for (const file of stale) {
          const source = documents.find((document) => document.id === file.documentId);
          if (!source) continue;
          versions = await captureVaultFileVersion(file, documents, versions, { source: 'automatic', now: source.modified_at || Date.now() });
          const refreshed = await refreshVaultWorkspaceFile(file, source);
          files = files.map((candidate) => candidate.id === file.id ? refreshed : candidate);
        }
        versions = applyVaultVersionRetention(versions, normalizeVaultVersionRetention(vaultData.versionRetention));
        persistRef.current({ files, versions });
      } finally { busy.current = false; }
    })();
  }, [signature, runtimeLocked]);
}
