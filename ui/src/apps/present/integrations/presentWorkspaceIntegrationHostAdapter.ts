// STATUS: PLATIN — installs Present-owned projection behind the neutral workspace integration port.
import {
  registerPresentWorkspaceIntegrationHost,
  type PresentWorkspaceIntegrationHost,
} from '../../../platform/workspace/integrations/presentWorkspaceIntegration';
import { createPresentWorkspaceObject } from './presentWorkspaceIntegration';

export function installPresentWorkspaceIntegrationHost(
  createObject: PresentWorkspaceIntegrationHost['createObject'] = createPresentWorkspaceObject,
): () => void {
  return registerPresentWorkspaceIntegrationHost({ createObject });
}
