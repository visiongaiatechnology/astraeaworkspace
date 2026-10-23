// STATUS: DIAMANT VGT SUPREME — Writer snapshot implementation installed through the neutral host port.
import { registerWorkspaceSnapshotProvider } from '../../../../platform/workspace/integrations/workspaceSnapshot';
import { extractWriterWorkspaceSnapshot } from '../../public/workspace/writerWorkspaceExtractors';

export function installWriterWorkspaceSnapshotHost(): () => void {
  return registerWorkspaceSnapshotProvider(extractWriterWorkspaceSnapshot);
}
