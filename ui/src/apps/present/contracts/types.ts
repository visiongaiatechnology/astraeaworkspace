import { PresentSlide, PresentSection } from '../../../shared/contracts/workspace';

export const CARD_COLORS = [
  { name: 'Blue', key: 'blue', border: 'border-blue-500/30', text: 'text-blue-400', bg: 'bg-blue-500/10' },
  { name: 'Emerald', key: 'emerald', border: 'border-emerald-500/30', text: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  { name: 'Purple', key: 'purple', border: 'border-purple-500/30', text: 'text-purple-400', bg: 'bg-purple-500/10' },
  { name: 'Amber', key: 'amber', border: 'border-amber-500/30', text: 'text-amber-400', bg: 'bg-amber-500/10' },
  { name: 'Rose', key: 'rose', border: 'border-pink-500/30', text: 'text-pink-400', bg: 'bg-pink-500/10' },
] as const;

export const SHAPE_DEFINITIONS = [
  { key: 'rectangle', label: 'Rectangle' },
  { key: 'rounded-rectangle', label: 'Rounded Box' },
  { key: 'ellipse', label: 'Circle / Ellipse' },
  { key: 'triangle', label: 'Triangle' },
  { key: 'diamond', label: 'Diamond / Decision' },
  { key: 'arrow-right', label: 'Right Arrow' },
  { key: 'arrow-left', label: 'Left Arrow' },
  { key: 'star', label: 'Star' },
  { key: 'callout', label: 'Callout Bubble' },
  { key: 'line', label: 'Divider Line' },
] as const;

export { PRESENT_WIDGET_DEFINITIONS as WIDGET_DEFINITIONS } from '../canvas/widgets/presentWidgets';

export const DIAGRAM_DEFINITIONS = [
  { key: 'process', label: 'Process Pipeline' },
  { key: 'timeline', label: 'Milestone Timeline' },
  { key: 'matrix', label: '2x2 Strategic Matrix' },
  { key: 'hierarchy', label: 'Org / Hierarchy Tree' },
] as const;

export { PRESENT_TRANSITION_PRESETS as TRANSITION_EFFECTS } from '../presenter/transitions/presentTransitionEngine';

export const SLIDE_SIZES = [
  { key: '16:9', label: 'Widescreen (16:9)', ratio: 'aspect-video', width: 1920, height: 1080 },
  { key: '16:10', label: 'Modern (16:10)', ratio: 'aspect-[16/10]', width: 1920, height: 1200 },
  { key: '4:3', label: 'Standard (4:3)', ratio: 'aspect-[4/3]', width: 1440, height: 1080 },
  { key: 'A4', label: 'Print / Handout (A4)', ratio: 'aspect-[1.414/1]', width: 1414, height: 1000 },
] as const;

export const DEFAULT_PRESENT_SECTIONS: PresentSection[] = [
  { id: 'sec-overview', name: '01 · Executive Overview', color: '#3b82f6' },
  { id: 'sec-financials', name: '02 · Live Financials', color: '#10b981' },
  { id: 'sec-security', name: '03 · Sovereign Architecture', color: '#8b5cf6' },
];

export const DEFAULT_PRESENT_SLIDES: PresentSlide[] = [
  {
    id: 'slide-1',
    sectionId: 'sec-overview',
    title: 'Astraea Workspace · Board Review',
    subtitle: 'Local-first productivity with explicit network controls',
    category: 'Astraea Present Scene',
    layout: 'cards',
    cards: [
      {
        id: 'card-1',
        title: '01. Local-First',
        description: 'Core document editing is local-first and does not require a vendor cloud account.',
        colorTheme: 'blue',
      },
      {
        id: 'card-2',
        title: '02. Encrypted',
        description: 'Native VWC container security is handled by the authoritative Rust crypto boundary.',
        colorTheme: 'emerald',
      },
      {
        id: 'card-3',
        title: '03. Fabric Graph',
        description: 'Workspace Fabric keeps linked local objects connected across documents.',
        colorTheme: 'purple',
      },
    ],
    speakerNotes:
      'Explain the local-first architecture and distinguish editor-local behavior from native encryption and transport capabilities provided by the Workspace Core.',
  },
  {
    id: 'slide-2',
    sectionId: 'sec-financials',
    title: 'Financial Projections (Live Link)',
    subtitle: 'Dynamic Workspace Fabric synchronization with VGT Grid',
    category: 'Live Financials',
    layout: 'chart',
    chartReferenceId: 'ref-chart-present',
    speakerNotes:
      'Point out that the revenue chart updates dynamically in real-time when the underlying spreadsheet cells in Revenue-2026 change.',
  },
  {
    id: 'slide-3',
    sectionId: 'sec-security',
    title: 'Security Architecture Status',
    subtitle: 'Implemented controls, explicit boundaries and remaining native integrations',
    category: 'Security Status',
    layout: 'bullet-list',
    bulletPoints: [
      'Encrypted VWC container path is isolated behind the authoritative Rust crypto boundary',
      'Vault integrity verification hashes the actual stored document or attachment payload',
      'Network-sensitive capabilities remain denied unless an implemented transport explicitly requests access',
      'Native OS key storage and transport capabilities are tracked separately from web-preview behavior',
    ],
    speakerNotes:
      'Separate implemented controls from native integrations that still require platform-specific verification. Do not present planned capabilities as completed security guarantees.',
  },
];
