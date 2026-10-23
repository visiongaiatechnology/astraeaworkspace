import { secureRandomId } from '../../shared/crypto/secureRandom';
// STATUS: PLATIN
import type { DocumentKind, WorkspaceDocument } from '../../shared/contracts/workspace';
import { createNewDocument } from '../../edition/contracts/documentFactory';
import type { BetaTemplateId } from './templateCatalog';
export { BETA_TEMPLATES } from './templateCatalog';
export type { BetaTemplateDefinition, BetaTemplateId } from './templateCatalog';

function uniqueDocument(kind: DocumentKind, title: string): WorkspaceDocument {
  const doc = createNewDocument(kind);
  const now = Date.now();
  return { ...doc, id: secureRandomId(`template-${kind.toLowerCase()}`), title, created_at: now, modified_at: now, version: 1 };
}

export function createBetaTemplate(templateId: BetaTemplateId): WorkspaceDocument {
  if (templateId === 'writer-report') {
    const doc = uniqueDocument('Writer', 'Professional Report');
    const textId = doc.root_object_ids.find((id) => doc.objects[id]?.type === 'TextBlock');
    if (textId && doc.objects[textId]?.type === 'TextBlock') {
      doc.objects[textId] = {
        type: 'TextBlock',
        data: {
          id: textId,
          paragraphs: [
            { id: `${textId}-title`, style: { style_name: 'title', alignment: 'left', line_height: 1.2, space_before: 0, space_after: 12 }, spans: [{ text: 'Report Title', bold: true, font_size_pt: 26 }] },
            { id: `${textId}-sub`, style: { style_name: 'subtitle', alignment: 'left', line_height: 1.3, space_before: 0, space_after: 18 }, spans: [{ text: 'Prepared with Astraea Workspace Beta' }] },
            { id: `${textId}-h1`, style: { style_name: 'heading1', heading_level: 1, alignment: 'left', line_height: 1.3, space_before: 10, space_after: 6 }, spans: [{ text: 'Executive Summary', bold: true }] },
            { id: `${textId}-p1`, style: { style_name: 'normal', alignment: 'left', line_height: 1.55, space_before: 0, space_after: 8 }, spans: [{ text: 'Replace this paragraph with the key outcome, decision or recommendation.' }] },
            { id: `${textId}-h2`, style: { style_name: 'heading1', heading_level: 1, alignment: 'left', line_height: 1.3, space_before: 10, space_after: 6 }, spans: [{ text: 'Findings', bold: true }] },
            { id: `${textId}-p2`, style: { style_name: 'normal', alignment: 'left', line_height: 1.55, space_before: 0, space_after: 8 }, spans: [{ text: 'Add evidence, analysis and linked Workspace objects here.' }] },
            { id: `${textId}-h3`, style: { style_name: 'heading1', heading_level: 1, alignment: 'left', line_height: 1.3, space_before: 10, space_after: 6 }, spans: [{ text: 'Next Steps', bold: true }] },
          ],
        },
      };
    }
    return doc;
  }

  if (templateId === 'grid-budget') {
    const doc = uniqueDocument('Grid', 'Budget & Forecast');
    const firstSheet = doc.gridData?.sheets[0];
    const object = firstSheet ? doc.objects[firstSheet.tableObjectId] : undefined;
    if (object?.type === 'Table') {
      object.data.cells = {
        A1: { value: 'Metric', bold: true }, B1: { value: 'Q1', bold: true }, C1: { value: 'Q2', bold: true }, D1: { value: 'Q3', bold: true }, E1: { value: 'Q4', bold: true }, F1: { value: 'Total', bold: true },
        A2: { value: 'Revenue' }, B2: { value: 100000, format: 'currency' }, C2: { value: 120000, format: 'currency' }, D2: { value: 140000, format: 'currency' }, E2: { value: 160000, format: 'currency' }, F2: { value: 520000, formula: '=SUM(B2:E2)', format: 'currency', bold: true },
        A3: { value: 'Costs' }, B3: { value: 65000, format: 'currency' }, C3: { value: 70000, format: 'currency' }, D3: { value: 76000, format: 'currency' }, E3: { value: 82000, format: 'currency' }, F3: { value: 293000, formula: '=SUM(B3:E3)', format: 'currency', bold: true },
        A4: { value: 'Result', bold: true }, B4: { value: 35000, formula: '=B2-B3', format: 'currency', bold: true }, C4: { value: 50000, formula: '=C2-C3', format: 'currency', bold: true }, D4: { value: 64000, formula: '=D2-D3', format: 'currency', bold: true }, E4: { value: 78000, formula: '=E2-E3', format: 'currency', bold: true }, F4: { value: 227000, formula: '=F2-F3', format: 'currency', bold: true },
      };
    }
    return doc;
  }

  if (templateId === 'present-pitch') {
    const doc = uniqueDocument('Present', 'Pitch Deck');
    doc.presentData = {
      ...doc.presentData,
      theme: 'dark',
      aspectRatio: '16:9',
      slides: [
        { id: `pitch-1-${Date.now()}`, title: 'Company / Project', subtitle: 'One clear sentence explaining the value proposition', layout: 'blank', speakerNotes: '' },
        { id: `pitch-2-${Date.now()}`, title: 'Problem', subtitle: 'What is broken today?', layout: 'bullet-list', bulletPoints: ['Pain point one', 'Pain point two', 'Why existing solutions are insufficient'], speakerNotes: '' },
        { id: `pitch-3-${Date.now()}`, title: 'Solution', subtitle: 'How the product changes the outcome', layout: 'bullet-list', bulletPoints: ['Core capability', 'Differentiator', 'Measurable benefit'], speakerNotes: '' },
        { id: `pitch-4-${Date.now()}`, title: 'Roadmap', subtitle: 'From beta to production', layout: 'bullet-list', bulletPoints: ['Beta validation', 'Production hardening', 'Scale and interoperability'], speakerNotes: '' },
      ],
    };
    return doc;
  }

  if (templateId === 'project-plan') {
    const doc = uniqueDocument('Projects', 'Project Plan');
    const now = new Date();
    const iso = (offset: number) => new Date(now.getTime() + offset * 86400000).toISOString().slice(0, 10);
    doc.workManagementData = {
      tasks: [
        { id: `project-task-1-${Date.now()}`, title: 'Define scope and acceptance criteria', completed: false, priority: 'high', startDate: iso(0), dueDate: iso(3), projectId: 'project-template', phaseId: 'phase-plan', progress: 0 },
        { id: `project-task-2-${Date.now()}`, title: 'Implement validated scope', completed: false, priority: 'high', startDate: iso(4), dueDate: iso(10), projectId: 'project-template', phaseId: 'phase-build', progress: 0 },
        { id: `project-task-3-${Date.now()}`, title: 'Release verification', completed: false, priority: 'medium', startDate: iso(11), dueDate: iso(14), projectId: 'project-template', phaseId: 'phase-verify', progress: 0 },
      ],
      cards: [],
      milestones: [
        { id: `milestone-1-${Date.now()}`, name: 'Scope Approved', startDate: iso(3), endDate: iso(3), progress: 0, phaseId: 'phase-plan' },
        { id: `milestone-2-${Date.now()}`, name: 'Beta Candidate', startDate: iso(14), endDate: iso(14), progress: 0, phaseId: 'phase-verify' },
      ],
      project: { id: 'project-template', name: 'Project Plan', startDate: iso(0), endDate: iso(14), description: 'Replace this description with the project objective and constraints.' },
      phases: [
        { id: 'phase-plan', name: 'Plan', startDate: iso(0), endDate: iso(3) },
        { id: 'phase-build', name: 'Build', startDate: iso(4), endDate: iso(10) },
        { id: 'phase-verify', name: 'Verify', startDate: iso(11), endDate: iso(14) },
      ],
      dependencies: [],
    };
    return doc;
  }

  const doc = uniqueDocument('Whiteboard', 'Architecture Board');
  doc.whiteboardData = {
    items: [
      { id: 'frame-system', type: 'frame', x: 120, y: 100, width: 920, height: 520, text: 'System Context' },
      { id: 'node-client', type: 'process', x: 190, y: 260, width: 190, height: 90, text: 'Client' },
      { id: 'node-core', type: 'process', x: 485, y: 260, width: 190, height: 90, text: 'Workspace Core' },
      { id: 'node-storage', type: 'process', x: 780, y: 260, width: 190, height: 90, text: 'Encrypted Storage' },
      { id: 'link-1', type: 'connector', x: 0, y: 0, width: 0, height: 0, text: '', fromId: 'node-client', toId: 'node-core', lineLabel: 'IPC' },
      { id: 'link-2', type: 'connector', x: 0, y: 0, width: 0, height: 0, text: '', fromId: 'node-core', toId: 'node-storage', lineLabel: 'VWC' },
    ],
  };
  return doc;
}
