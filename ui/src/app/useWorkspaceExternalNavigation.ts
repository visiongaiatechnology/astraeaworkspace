// STATUS: PLATIN — routes external navigation through the workspace NetGate policy boundary.
import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { NetworkAuditEntry, NetworkCapability, WorkspaceDocument } from '../shared/contracts/workspace';
import { evaluateNetGatePolicy } from '../platform/operations/appContainerOps';
import { securityPolicyForDocument } from '../platform/security/securityProfiles';

interface WorkspaceExternalNavigationOptions {
  readonly documents: Record<string, WorkspaceDocument>;
  readonly activeDocumentId: string;
  readonly networkCapability: NetworkCapability;
  readonly setAuditLogs: Dispatch<SetStateAction<NetworkAuditEntry[]>>;
  readonly showToast: (message: string) => void;
}

export function useWorkspaceExternalNavigation({
  documents,
  activeDocumentId,
  networkCapability,
  setAuditLogs,
  showToast,
}: WorkspaceExternalNavigationOptions) {
  return useCallback(async (rawUrl: string) => {
    let popup: Window | null = null;
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== 'https:' || url.username || url.password || url.toString().length > 2048) {
        throw new Error('External URL rejected before NetGate evaluation.');
      }
      popup = window.open('about:blank', '_blank');
      if (popup) {
        popup.opener = null;
        popup.document.title = 'Astraea NetGate';
        const meta = popup.document.createElement('meta');
        meta.name = 'referrer';
        meta.content = 'no-referrer';
        popup.document.head.appendChild(meta);
      }
      const profile = documents[activeDocumentId]
        ? securityPolicyForDocument(documents[activeDocumentId]).profile
        : 'STANDARD';
      const { entry, message } = await evaluateNetGatePolicy(url.hostname, networkCapability, profile);
      setAuditLogs((previous) => [entry, ...previous]);
      if (entry.verdict !== 'Allowed') {
        popup?.close();
        showToast(message);
        return;
      }
      if (!popup) throw new Error('External window was blocked by the browser/runtime.');
      popup.location.replace(url.toString());
      showToast(`NetGate allowed ${url.hostname}.`);
    } catch (error) {
      popup?.close();
      showToast(error instanceof Error ? error.message : 'External URL could not be opened through NetGate.');
    }
  }, [activeDocumentId, documents, networkCapability, setAuditLogs, showToast]);
}
