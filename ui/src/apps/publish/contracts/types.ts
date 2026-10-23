// STATUS: DIAMANT VGT SUPREME — Astraea Publish canonical type facade
export * from '../../../shared/contracts/publish/workspacePublish';
import type { PublishDocumentModel, PublishPreflightFinding } from '../../../shared/contracts/publish/workspacePublish';
import { createEmptyPublishDocument } from '../model/publishDocumentEngine';

export type PaperStandard = 'A4' | 'A3' | 'Letter' | 'Tabloid' | 'Custom';
export type PageOrientation = 'portrait' | 'landscape';
export type PreflightIssue = PublishPreflightFinding;
export const DEFAULT_PUBLISH_MODEL:PublishDocumentModel=createEmptyPublishDocument();
