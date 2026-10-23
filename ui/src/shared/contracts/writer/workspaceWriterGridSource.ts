// STATUS: DIAMANT VGT SUPREME — Shared Writer Grid source contract
export interface WriterGridSourceReference {
  documentId: string;
  objectId: string;
  range: string;
  uri: string;
  mode: 'Live' | 'Frozen';
  sourceVersion: number;
}
