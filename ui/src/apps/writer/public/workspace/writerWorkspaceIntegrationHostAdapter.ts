// STATUS: PLATIN — installs Writer-owned workspace projection operations behind the neutral Core contract.
import { registerWriterWorkspaceIntegrationHost } from '../../../../platform/workspace/integrations/writerWorkspaceIntegration';
import {
  appendWriterWorkspaceEmbed as appendEmbed,
  createWriterWorkspaceEmbed as createEmbed,
} from './writerWorkspaceIntegration';

export function installWriterWorkspaceIntegrationHost(): () => void {
  return registerWriterWorkspaceIntegrationHost({ createEmbed, appendEmbed });
}
