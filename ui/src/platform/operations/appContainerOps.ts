// STATUS: PLATIN — stable compatibility facade for container, KeyVault, and NetGate operation owners.

export {
  executeOpenFile,
  executeSaveVwc,
  resolveVwcSaveFailureMessage,
  extensionForDocumentKind,
} from '../containers/containerFileOps';
export type { OpenContainerResult, SaveContainerOptions } from '../containers/containerFileOps';

export {
  createSoftwareKeyProvider,
  enrollTopSecretAccess,
  fetchKeyVaultRuntimeStatus,
  lockKeyVaultRuntime,
  unlockTopSecretAccess,
  unlockSoftwareKeyProvider,
} from '../keyvault/keyVaultRuntimeOps';
export type { KeyVaultRuntimeStatus, TopSecretAccessResult } from '../keyvault/keyVaultRuntimeOps';

export { evaluateNetGatePolicy } from '../netgate/netGateEvaluation';
export type { NetGateEvaluationContext } from '../netgate/netGateEvaluation';
