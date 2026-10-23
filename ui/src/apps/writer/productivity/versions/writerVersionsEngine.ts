// STATUS: DIAMANT VGT SUPREME — Bounded Named Writer Versions
import type { Paragraph, WriterDocumentModel, WriterNamedVersion } from '../../../../shared/contracts/workspace';

const MAX_NAMED_VERSIONS = 32;
const MAX_VERSION_NAME = 128;

function cleanVersionName(name: string): string {
  return name.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/gu, '').trim().slice(0, MAX_VERSION_NAME);
}

function snapshotWriterData(writerData: WriterDocumentModel): WriterNamedVersion['snapshot']['writerData'] {
  const clone = structuredClone(writerData) as WriterDocumentModel;
  delete clone.namedVersions;
  delete clone.protectionMode;
  delete clone.protectionPasswordHash;
  return clone;
}

export function createWriterNamedVersion(input: {
  name: string;
  paragraphs: readonly Paragraph[];
  writerData: WriterDocumentModel;
  documentVersion: number;
  now?: number;
}): WriterNamedVersion {
  const name = cleanVersionName(input.name);
  if (!name) throw new Error('Versionsname darf nicht leer sein.');
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: input.now ?? Date.now(),
    sourceDocumentVersion: Math.max(0, Math.trunc(input.documentVersion)),
    snapshot: { paragraphs: structuredClone([...input.paragraphs]), writerData: snapshotWriterData(input.writerData) },
  };
}

export function addWriterNamedVersion(
  existing: readonly WriterNamedVersion[],
  version: WriterNamedVersion,
): WriterNamedVersion[] {
  const withoutSameName = existing.filter((item) => item.name !== version.name && item.id !== version.id);
  return [version, ...withoutSameName].slice(0, MAX_NAMED_VERSIONS);
}

export function restoreWriterNamedVersion(
  version: WriterNamedVersion,
  currentWriterData: WriterDocumentModel,
): { paragraphs: Paragraph[]; writerData: WriterDocumentModel } {
  return {
    paragraphs: structuredClone(version.snapshot.paragraphs),
    writerData: {
      ...structuredClone(version.snapshot.writerData),
      namedVersions: structuredClone(currentWriterData.namedVersions ?? []),
      protectionMode: currentWriterData.protectionMode,
      protectionPasswordHash: currentWriterData.protectionPasswordHash,
    },
  };
}
