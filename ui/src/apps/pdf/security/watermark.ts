// STATUS: DIAMANT VGT SUPREME — deterministic DLP security watermark policy shared by screen, print and export paths.

import type { PdfDocumentModel, PdfPageModel } from '../../../shared/contracts/workspace';

export type SecurityWatermarkClassification = 'standard' | 'sensitive' | 'confidential' | 'restricted';

export interface SecurityWatermarkContext {
  classification: SecurityWatermarkClassification;
  userName: string;
  documentId: string;
  timestampMs: number;
}

export interface SecurityWatermarkWorkspaceDocument {
  id: string;
  protection?: { classification?: SecurityWatermarkClassification };
  permissions?: {
    ownerId?: string;
    grants?: Array<{ principalId: string; role: 'owner' | 'editor' | 'commenter' | 'viewer' }>;
  };
}

export type SecurityWatermarkPageLike = PdfPageModel;
export type SecurityWatermarkPdfLike = PdfDocumentModel;

const MAX_USER = 128;
const MAX_DOCUMENT_ID = 192;
const MAX_WATERMARK = 512;
const HIGH_CLASSIFICATIONS = new Set<SecurityWatermarkClassification>(['confidential', 'restricted']);

function boundedIdentity(value: string, max: number, label: string): string {
  const normalized = value.trim().replace(/[\u0000-\u001f\u007f]+/gu, ' ').replace(/\s+/gu, ' ');
  if (!normalized || normalized.length > max) throw new Error(`${label} is missing or exceeds security watermark policy.`);
  return normalized;
}

export function requiresSecurityWatermark(classification: SecurityWatermarkClassification): boolean {
  return HIGH_CLASSIFICATIONS.has(classification);
}

export function createWorkspaceSecurityWatermarkContext(
  document: SecurityWatermarkWorkspaceDocument,
  timestampMs = Date.now(),
): SecurityWatermarkContext {
  const classification = document.protection?.classification ?? 'standard';
  const documentId = boundedIdentity(document.id, MAX_DOCUMENT_ID, 'Document ID');
  const ownerGrant = document.permissions?.grants?.find((grant) => grant.role === 'owner' && grant.principalId.trim());
  const userName = (document.permissions?.ownerId ?? ownerGrant?.principalId ?? '').trim();
  if (requiresSecurityWatermark(classification) && !userName) {
    throw new Error('Protected output requires an authenticated user identity for the security watermark.');
  }
  if (!Number.isFinite(timestampMs) || timestampMs < 0) throw new Error('Security watermark timestamp is invalid.');
  return {
    classification,
    userName: userName ? boundedIdentity(userName, MAX_USER, 'Watermark user') : 'local-user',
    documentId,
    timestampMs: Math.trunc(timestampMs),
  };
}

export function buildSecurityWatermarkText(context: SecurityWatermarkContext): string {
  const user = boundedIdentity(context.userName, MAX_USER, 'Watermark user');
  const documentId = boundedIdentity(context.documentId, MAX_DOCUMENT_ID, 'Document ID');
  if (!Number.isFinite(context.timestampMs) || context.timestampMs < 0) throw new Error('Security watermark timestamp is invalid.');
  const timestamp = new Date(Math.trunc(context.timestampMs)).toISOString();
  const text = `SECURITY ${context.classification.toUpperCase()} · ${user} · ${documentId} · ${timestamp}`;
  if (text.length > MAX_WATERMARK) throw new Error('Security watermark exceeds bounded output policy.');
  return text;
}

export function applySecurityWatermarkToPdf(
  model: SecurityWatermarkPdfLike,
  context: SecurityWatermarkContext,
): SecurityWatermarkPdfLike {
  if (!requiresSecurityWatermark(context.classification)) return model;
  const watermarkText = buildSecurityWatermarkText(context);
  return {
    ...model,
    pages: model.pages.map((page) => ({
      ...page,
      decorations: {
        ...(page.decorations ?? {}),
        watermarkText,
      },
    })),
  };
}
