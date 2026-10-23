import type { WorkspaceDocument, ShapeObject, WhiteboardCollaborationState, WhiteboardCustomTemplate, WhiteboardFacilitationState, WhiteboardViewConfig } from '../../../shared/contracts/workspace';
import { WhiteboardItem, WhiteboardItemType, StickyColor, STICKY_COLORS } from '../types';
import { validateAndNormalizeWhiteboardItems } from '../viewport/whiteboardViewportEngine';

/**
 * Canonical load path for `whiteboardData.items`.
 *
 * A board without `whiteboardData.items` is **empty** — an infinite, blank drawing surface, as the
 * package "Leere unendliche Zeichenfläche" requires. Earlier builds returned an eleven-object sample
 * diagram here, so a new board was never empty and the acceptance "start a new board and sketch
 * immediately" began on top of foreign content. That sample content is available where it belongs: as
 * a builtin template (`model/whiteboardTemplateEngine.ts`).
 *
 * Structural payload problems (not an array, above the object ceiling, duplicated or empty ids) are
 * rejected with a named reason instead of loading a partially corrupt board.
 */
export function loadWhiteboardItemsFromDocument(
  document: WorkspaceDocument,
): { ok: true; items: WhiteboardItem[] } | { ok: false; reason: string } {
  const raw = document.whiteboardData?.items;
  if (raw !== undefined && !Array.isArray(raw)) {
    return { ok: false, reason: 'Whiteboard payload does not contain a canonical item array.' };
  }
  const items = getInitialItemsFromDoc(document);
  const validated = validateAndNormalizeWhiteboardItems(items);
  return validated.ok ? { ok: true, items: validated.items } : { ok: false, reason: validated.reason };
}

export function getInitialItemsFromDoc(document: WorkspaceDocument): WhiteboardItem[] {
  if (Array.isArray(document.whiteboardData?.items)) {
    return document.whiteboardData.items.map((item) => ({ ...item }));
  }

  const parsed: WhiteboardItem[] = [];
  const shapeObjects = Object.values(document.objects).filter((obj) => obj.type === 'Shape');

  if (shapeObjects.length > 0) {
    for (const obj of shapeObjects) {
      const s = obj.data as ShapeObject;
      let type: WhiteboardItemType = 'process';
      let color: StickyColor | undefined = undefined;

      if (s.fill === '#fef9c3' || s.fill === '#fef08a') {
        type = 'sticky';
        color = 'yellow';
      } else if (s.fill === '#cffafe' || s.fill === '#a5f3fc') {
        type = 'sticky';
        color = 'cyan';
      } else if (s.fill === '#f3e8ff' || s.fill === '#e9d5ff') {
        type = 'sticky';
        color = 'purple';
      } else if (s.shape_type === 'callout') {
        type = 'terminal';
      } else if (s.shape_type === 'ellipse' || s.rotation === 45) {
        type = 'decision';
      } else if (s.shape_type === 'arrow') {
        type = 'connector';
      } else {
        type = 'process';
      }

      parsed.push({
        id: s.id,
        type,
        x: s.x,
        y: s.y,
        width: s.width || 180,
        height: s.height || 100,
        text: s.text || '',
        color,
      });
    }
    return parsed;
  }

  // No canonical items and no legacy Shape objects: a new, genuinely empty board.
  return [];
}

export function syncWhiteboardItemsToDocument(
  currentItems: WhiteboardItem[],
  document: WorkspaceDocument
): WorkspaceDocument {
  const previousWhiteboardIds = new Set(document.whiteboardData?.items.map((item) => item.id) || []);
  const currentWhiteboardIds = new Set(currentItems.map((item) => item.id));
  const updatedObjects = { ...document.objects };
  for (const id of previousWhiteboardIds) delete updatedObjects[id];

  const rootIds = [...new Set(document.root_object_ids.filter(
    (id) => !previousWhiteboardIds.has(id) && !currentWhiteboardIds.has(id),
  ))];
  const rootIdSet = new Set(rootIds);
  for (const item of currentItems) {
    let shapeType: ShapeObject['shape_type'] = 'rectangle';
    let fill = '#1e293b';
    let stroke = '#3b82f6';
    let strokeWidth = 2;
    let rotation = 0;

    if (item.type === 'sticky') {
      const color = STICKY_COLORS[item.color || 'yellow'];
      fill = color.bg;
      stroke = color.border;
      strokeWidth = 1;
    } else if (item.type === 'decision') {
      shapeType = 'ellipse';
      fill = '#0f172a';
      stroke = '#f59e0b';
      rotation = 45;
    } else if (item.type === 'terminal') {
      shapeType = 'callout';
      fill = '#0f172a';
      stroke = '#10b981';
    } else if (item.type === 'connector') {
      shapeType = 'arrow';
      fill = 'transparent';
      stroke = '#94a3b8';
    } else if (item.type === 'frame') {
      shapeType = 'rectangle';
      fill = 'transparent';
      stroke = '#64748b';
      strokeWidth = 1;
    } else if (item.type === 'text') {
      shapeType = 'rectangle';
      fill = 'transparent';
      stroke = 'transparent';
      strokeWidth = 0;
    } else if (item.type === 'image') {
      // Canonical image bytes live in whiteboardData. The WOM Shape is only an interoperable geometry placeholder.
      shapeType = 'rectangle';
      fill = '#111827';
      stroke = '#475569';
      strokeWidth = 1;
    } else if (item.type === 'ink') {
      // Vector points remain canonical in whiteboardData; WOM keeps interoperable bounds/style without duplicating geometry.
      shapeType = 'rectangle';
      fill = 'transparent';
      stroke = item.ink?.color || '#60a5fa';
      strokeWidth = Math.max(1, Math.min(48, item.ink?.width || 2));
    } else if (['shape', 'icon', 'table', 'card', 'document', 'chart', 'code', 'media', 'reaction'].includes(item.type)) {
      // Rich Whiteboard semantics stay canonical in whiteboardData; WOM receives stable interoperable geometry/style.
      shapeType = 'rectangle';
      fill = item.type === 'shape' ? (item.shape?.fill || '#0f172a') : '#0f172a';
      stroke = item.type === 'shape' ? (item.shape?.stroke || '#38bdf8') : '#475569';
      strokeWidth = item.type === 'shape' ? Math.max(1, Math.min(24, item.shape?.strokeWidth || 2)) : 1;
    } else {
      shapeType = 'rectangle';
      fill = '#0f172a';
      stroke = '#3b82f6';
    }

    const shapeObj: ShapeObject = {
      id: item.id,
      shape_type: shapeType,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      rotation,
      fill,
      stroke,
      stroke_width: strokeWidth,
      text: item.type === 'image' ? (item.name || 'Whiteboard image') : item.type === 'ink' ? 'Whiteboard vector ink' : item.text,
    };
    updatedObjects[item.id] = { type: 'Shape', data: shapeObj };
    if (!rootIdSet.has(item.id)) {
      rootIdSet.add(item.id);
      rootIds.push(item.id);
    }
  }

  return {
    ...document,
    objects: updatedObjects,
    root_object_ids: rootIds,
    whiteboardData: {
      ...document.whiteboardData,
      items: currentItems.map((item) => ({ ...item })),
    },
    modified_at: Date.now(),
    version: document.version + 1,
  };
}


export function syncWhiteboardViewToDocument(
  view: WhiteboardViewConfig,
  document: WorkspaceDocument
): WorkspaceDocument {
  return {
    ...document,
    whiteboardData: {
      ...document.whiteboardData,
      items: (document.whiteboardData?.items ?? getInitialItemsFromDoc(document)).map((item) => ({ ...item })),
      view: {
        backgroundStyle: view.backgroundStyle,
        gridSize: view.gridSize,
        showRulers: view.showRulers,
        guides: view.guides.map((guide) => ({ ...guide })),
        bookmarks: view.bookmarks.map((bookmark) => ({ ...bookmark })),
        presentationPath: [...view.presentationPath],
        snapToGrid: view.snapToGrid,
        snapToGuides: view.snapToGuides,
      },
    },
    modified_at: Date.now(),
    version: document.version + 1,
  };
}


export function syncWhiteboardTemplatesToDocument(
  templates: WhiteboardCustomTemplate[],
  currentItems: WhiteboardItem[],
  document: WorkspaceDocument
): WorkspaceDocument {
  return {
    ...document,
    whiteboardData: {
      ...document.whiteboardData,
      items: currentItems.map((item) => ({ ...item })),
      templates: templates.map((template) => ({ ...template, items: template.items.map((item) => ({ ...item })) })),
    },
    modified_at: Date.now(),
    version: document.version + 1,
  };
}


export function syncWhiteboardFacilitationToDocument(
  facilitation: WhiteboardFacilitationState,
  currentItems: WhiteboardItem[],
  templates: WhiteboardCustomTemplate[],
  document: WorkspaceDocument
): WorkspaceDocument {
  return {
    ...document,
    whiteboardData: {
      ...document.whiteboardData,
      items: currentItems.map((item) => ({ ...item })),
      templates: templates.map((template) => ({ ...template, items: template.items.map((item) => ({ ...item })) })),
      facilitation: { ...facilitation, participants: facilitation.participants.map((participant) => ({ ...participant })), workshopFrameIds: [...facilitation.workshopFrameIds], lockedBackgroundIds: [...facilitation.lockedBackgroundIds], revealedAreaIds: [...facilitation.revealedAreaIds], voting: facilitation.voting ? { ...facilitation.voting, targetIds: [...facilitation.voting.targetIds], ballots: facilitation.voting.ballots.map((ballot) => ({ ...ballot })) } : undefined },
    },
    modified_at: Date.now(),
    version: document.version + 1,
  };
}


export function syncWhiteboardCollaborationToDocument(
  collaboration: WhiteboardCollaborationState,
  currentItems: WhiteboardItem[],
  document: WorkspaceDocument
): WorkspaceDocument {
  return {
    ...document,
    whiteboardData: {
      ...document.whiteboardData,
      items: currentItems.map((item) => ({ ...item })),
      collaboration: {
        ...collaboration,
        comments: collaboration.comments.map((comment) => ({ ...comment, mentions: [...comment.mentions] })),
        activity: collaboration.activity.map((entry) => ({ ...entry })),
        objectAuthors: Object.fromEntries(Object.entries(collaboration.objectAuthors).map(([id, author]) => [id, { ...author }])),
        objectVersions: Object.fromEntries(Object.entries(collaboration.objectVersions).map(([id, version]) => [id, { ...version }])),
        spaceBinding: collaboration.spaceBinding ? { ...collaboration.spaceBinding } : undefined,
        guestAccess: collaboration.guestAccess ? { ...collaboration.guestAccess } : undefined,
      },
    },
    modified_at: Date.now(),
    version: document.version + 1,
  };
}
