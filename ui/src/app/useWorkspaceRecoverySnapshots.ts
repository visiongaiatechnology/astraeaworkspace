// STATUS: PLATIN — coordinates recovery snapshot lifecycle without making snapshots authoritative document state.
import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  listRecoverySnapshots,
  recoverySupported,
} from '../platform/recovery/recovery';
import type { RecoverySnapshotInfo } from '../platform/recovery/recovery';
import { beginWorkspaceSession } from '../shell/lifecycle/workspaceRecoverySession';
import { clearEmergencySnapshot, clearRecoverySnapshotsFromStorage } from '../platform/workspace/persistence/workspaceStorage';

interface WorkspaceRecoverySnapshotsOptions {
  readonly recoverySession: ReturnType<typeof beginWorkspaceSession>;
  readonly setIsStartCenterOpen: Dispatch<SetStateAction<boolean>>;
}

export function useWorkspaceRecoverySnapshots({
  recoverySession,
  setIsStartCenterOpen,
}: WorkspaceRecoverySnapshotsOptions) {
  const [recoverySnapshots, setRecoverySnapshots] = useState<RecoverySnapshotInfo[]>([]);

  const refreshRecoverySnapshots = useCallback(async () => {
    if (!recoverySupported()) return;
    try {
      const snapshots = await listRecoverySnapshots();
      setRecoverySnapshots(snapshots);
      if (recoverySession.abnormalPreviousTermination && snapshots.length > 0) setIsStartCenterOpen(true);
    } catch {
      setRecoverySnapshots([]);
    }
  }, [recoverySession.abnormalPreviousTermination, setIsStartCenterOpen]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (recoverySession.previousCleanTermination) {
        await clearRecoverySnapshotsFromStorage();
        clearEmergencySnapshot();
      }
      if (!cancelled) await refreshRecoverySnapshots();
    })().catch(() => {
      if (!cancelled) setRecoverySnapshots([]);
    });
    return () => { cancelled = true; };
  }, [recoverySession.previousCleanTermination, refreshRecoverySnapshots]);

  return { recoverySnapshots, refreshRecoverySnapshots };
}
