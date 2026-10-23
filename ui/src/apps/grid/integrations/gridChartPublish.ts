// STATUS: DIAMANT VGT SUPREME
// Canonical zero-network live publishing of Grid chart objects into local Writer and Present documents.

import type { ChartObject, ReferenceMode, WorkspaceDocument, WorkspaceObject } from '../../../shared/contracts/workspace';
import { appendWriterWorkspaceEmbed, createWriterWorkspaceEmbed } from '../../../platform/workspace/integrations/writerWorkspaceIntegration';
import { createGridSecureId } from '../security/gridWebCryptoIntegrity';

export type GridChartPublishTargetKind = 'Writer' | 'Present';

export interface GridChartPublishTarget {
  id: string;
  title: string;
  kind: GridChartPublishTargetKind;
}

/** One selectable destination slide of a Present target. */
export interface GridChartPublishSlide {
  index: number;
  label: string;
}

export interface GridChartPublishOutcome {
  document: WorkspaceDocument;
  targetId: string;
  targetKind: GridChartPublishTargetKind;
  mode: ReferenceMode;
  /** Set for Present targets: the slide that received the element. */
  slideIndex?: number;
  referenceId?: string;
  summary: string;
}

export function listGridChartPublishTargets(
  documents: Record<string, WorkspaceDocument>,
  sourceDocumentId: string,
): GridChartPublishTarget[] {
  return Object.values(documents)
    .filter((doc): doc is WorkspaceDocument & { kind: GridChartPublishTargetKind } =>
      doc.id !== sourceDocumentId
      && (doc.kind === 'Writer' || doc.kind === 'Present')
      && isGridChartPublishTargetWritable(doc))
    .slice(0, 256)
    .map((doc) => ({ id: doc.id, title: doc.title.slice(0, 256), kind: doc.kind }));
}

/**
 * Lists the slides of a Present target so the user can pick the destination slide instead of the
 * publisher silently writing to slide 1.
 */
export function listGridChartPublishSlides(target: WorkspaceDocument): GridChartPublishSlide[] {
  if (target.kind !== 'Present') return [];
  return (target.presentData?.slides ?? []).slice(0, 512).map((slide, index) => ({
    index,
    label: `${index + 1}. ${(slide.title || slide.layout || 'Folie').slice(0, 96)}`,
  }));
}

function requireSlideIndex(target: WorkspaceDocument, slideIndex: number | undefined): number {
  const slides = target.presentData?.slides ?? [];
  if (!slides.length) throw new Error('chart_publish_present_model_missing');
  if (slideIndex === undefined) return 0;
  if (!Number.isInteger(slideIndex) || slideIndex < 0 || slideIndex >= slides.length) {
    throw new Error('chart_publish_slide_index_invalid');
  }
  return slideIndex;
}

function isGridChartPublishTargetWritable(target: WorkspaceDocument): boolean {
  if (target.protection?.locked || target.protection?.readOnly) return false;
  // This surface has no authenticated principal with which to evaluate document grants.
  if (target.permissions) return false;
  // Writer's app-level modes restrict embeds as well as ordinary text editing.
  if (target.kind === 'Writer' && target.writerData?.protectionMode && target.writerData.protectionMode !== 'none') return false;
  return true;
}

function sourceChart(source: WorkspaceDocument, chartId: string): ChartObject {
  if (source.kind !== 'Grid') throw new Error('chart_publish_source_not_grid');
  const object = source.objects[chartId];
  if (!object || object.type !== 'Chart') throw new Error('chart_publish_source_missing');
  return object.data;
}

function firstWriterParagraphId(document: WorkspaceDocument): string {
  for (const id of document.root_object_ids) {
    const object = document.objects[id];
    if (object?.type === 'TextBlock' && object.data.paragraphs[0]?.id) return object.data.paragraphs[0].id;
  }
  for (const object of Object.values(document.objects)) {
    if (object.type === 'TextBlock' && object.data.paragraphs[0]?.id) return object.data.paragraphs[0].id;
  }
  throw new Error('chart_publish_writer_anchor_missing');
}

function workspaceReference(
  source: WorkspaceDocument,
  chartId: string,
  chart: ChartObject,
  mode: ReferenceMode,
): { id: string; object: WorkspaceObject } {
  const id = createGridSecureId('grid-chart-ref');
  return {
    id,
    object: {
      type: 'WorkspaceReference',
      data: {
        id,
        uri: `vgt://workspace/document/${encodeURIComponent(source.id)}/object/${encodeURIComponent(chartId)}`,
        mode,
        cached_snapshot: { type: 'Chart', data: chart },
      },
    },
  };
}

function publishToWriter(source: WorkspaceDocument, chartId: string, target: WorkspaceDocument, mode: ReferenceMode): WorkspaceDocument {
  if (target.kind !== 'Writer' || !target.writerData) throw new Error('chart_publish_writer_model_missing');
  const embed = createWriterWorkspaceEmbed({
    writerDocument: target,
    sourceDocument: source,
    kind: 'grid-chart',
    mode: mode === 'Live' ? 'Live' : 'Snapshot',
    anchorParagraphId: firstWriterParagraphId(target),
    sourceObjectId: chartId,
  });
  return {
    ...target,
    version: target.version + 1,
    modified_at: Date.now(),
    writerData: {
      ...target.writerData,
      workspaceEmbeds: appendWriterWorkspaceEmbed(target.writerData.workspaceEmbeds ?? [], embed),
    },
  };
}

function publishToPresent(source: WorkspaceDocument, chartId: string, chart: ChartObject, target: WorkspaceDocument, mode: ReferenceMode, slideIndex: number): WorkspaceDocument {
  if (target.kind !== 'Present' || !target.presentData?.slides.length) throw new Error('chart_publish_present_model_missing');
  const reference = workspaceReference(source, chartId, chart, mode);
  return {
    ...target,
    version: target.version + 1,
    modified_at: Date.now(),
    root_object_ids: target.root_object_ids.includes(reference.id) ? target.root_object_ids : [...target.root_object_ids, reference.id],
    objects: { ...target.objects, [reference.id]: reference.object },
    presentData: {
      ...target.presentData,
      slides: target.presentData.slides.map((slide, index) => index === slideIndex ? { ...slide, layout: 'chart', chartReferenceId: reference.id } : slide),
    },
  };
}

export function publishGridChartToWorkspaceTarget(
  source: WorkspaceDocument,
  chartId: string,
  target: WorkspaceDocument,
  mode: ReferenceMode = 'Live',
): WorkspaceDocument {
  return publishGridChartToWorkspaceTargetDetailed(source, chartId, target, mode).document;
}

/**
 * Publishes a Grid chart into a Writer or Present document and reports exactly where it landed.
 * `slideIndex` selects the destination slide; omitting it keeps the historical slide-1 behaviour.
 */
export function publishGridChartToWorkspaceTargetDetailed(
  source: WorkspaceDocument,
  chartId: string,
  target: WorkspaceDocument,
  mode: ReferenceMode = 'Live',
  slideIndex?: number,
): GridChartPublishOutcome {
  if (!isGridChartPublishTargetWritable(target)) {
    throw new Error('Chart publish target is unavailable for editing.');
  }
  const chart = sourceChart(source, chartId);
  if (target.id === source.id) throw new Error('chart_publish_self_target');
  if (target.kind === 'Writer') {
    return {
      document: publishToWriter(source, chartId, target, mode),
      targetId: target.id, targetKind: 'Writer', mode,
      summary: `Diagramm "${chart.title}" als ${mode === 'Live' ? 'Live-Objekt' : 'Snapshot'} in Writer "${target.title}" eingefügt.`,
    };
  }
  if (target.kind === 'Present') {
    const resolvedSlide = requireSlideIndex(target, slideIndex);
    return {
      document: publishToPresent(source, chartId, chart, target, mode, resolvedSlide),
      targetId: target.id, targetKind: 'Present', mode, slideIndex: resolvedSlide,
      summary: `Diagramm "${chart.title}" als ${mode === 'Live' ? 'Live-Objekt' : 'Snapshot'} auf Folie ${resolvedSlide + 1} von "${target.title}" eingefügt.`,
    };
  }
  throw new Error('chart_publish_target_unsupported');
}
