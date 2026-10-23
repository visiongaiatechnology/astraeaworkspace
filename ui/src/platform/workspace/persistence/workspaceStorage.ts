// STATUS: DIAMANT VGT SUPREME — stable public Workspace storage facade.
export {
  deleteDocumentFromStorage,
  loadAllDocumentsFromStorage,
  loadDocumentFromStorage,
  saveAllDocumentsToStorage,
  saveDocumentToStorage,
} from './workspaceStorageDocuments';
export {
  listStoredDocumentIdPage,
  listStoredDocumentIds,
  scanStoredDocumentIds,
} from './workspaceStorageIndex';
export {
  clearEmergencySnapshot,
  getPersistedActiveDocId,
  loadEmergencySnapshot,
  persistActiveDocId,
  saveEmergencySnapshot,
} from './workspaceStorageEmergency';
export {
  clearRecoverySnapshotsFromStorage,
  createDocumentBackup,
  listDocumentBackups,
  loadLatestRecoverySnapshot,
  restoreDocumentBackup,
  saveRecoverySnapshot,
} from './workspaceStorageRecovery';
export {
  DEFAULT_STORED_DOCUMENT_ID_PAGE_SIZE,
  MAX_STORED_DOCUMENT_ID_PAGE_SCAN,
  MAX_STORED_DOCUMENT_ID_PAGE_SIZE,
  MAX_STORED_DOCUMENT_ID_SCAN,
  normalizeStoredDocumentIdKeys,
} from './workspaceStorageTypes';
export type {
  DocumentMetadataRecord,
  StorageBackupDescriptor,
  StorageBackupRecord,
  StorageCredentialOptions,
  StorageJournalRecord,
  StorageRecoveryRecord,
  StoredDocumentIdPage,
  StoredDocumentIdPageOptions,
  StoredDocumentIdScan,
} from './workspaceStorageTypes';
