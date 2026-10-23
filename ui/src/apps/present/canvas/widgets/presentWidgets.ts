import { probeMediaBoundary } from '../../../../platform/media/index';
// STATUS: DIAMANT VGT SUPREME — Present widget model, validation and deterministic defaults
import type {
  PresentWidgetGalleryItem,
  PresentWidgetItem,
  PresentObjectGeometry,
  PresentWidgetSceneObject,
  PresentWidgetType,
} from '../../../../shared/contracts/workspace';
import { preflightIsolatedImageDecode } from '../../../../platform/import-sandbox/importExportSandbox';

export const PRESENT_WIDGET_MAX_ITEMS = 12;
export const PRESENT_WIDGET_MAX_GALLERY_ITEMS = 6;
export const PRESENT_WIDGET_MAX_GALLERY_FILE_BYTES = 8 * 1024 * 1024;
export const PRESENT_WIDGET_MAX_GALLERY_TOTAL_BYTES = 24 * 1024 * 1024;

export const PRESENT_WIDGET_DEFINITIONS: ReadonlyArray<{ key: PresentWidgetType; label: string }> = [
  { key: 'kpi', label: 'KPI / Metric Card' },
  { key: 'progress', label: 'Progress Bar' },
  { key: 'progress-ring', label: 'Progress Ring' },
  { key: 'gauge', label: 'Percentage Gauge' },
  { key: 'milestone', label: 'Timeline / Milestone Strip' },
  { key: 'roadmap', label: 'Process / Roadmap' },
  { key: 'comparison', label: 'Comparison Card' },
  { key: 'quote', label: 'Quote / Profile / Testimonial' },
  { key: 'status', label: 'Status / Badge Matrix' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'icon-stat', label: 'Icon / Stat Block' },
  { key: 'device', label: 'Device / Browser Mockup' },
  { key: 'gallery', label: 'Gallery' },
  { key: 'rating', label: 'Rating Scale' },
] as const;

const finite = (value: number | undefined, fallback: number): number =>
  Number.isFinite(value) ? Number(value) : fallback;

export const clampWidgetPercent = (value: number | undefined): number =>
  Math.max(0, Math.min(100, finite(value, 0)));

export function sanitizeWidgetText(value: unknown, max = 160): string {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

export function normalizeWidgetItems(items: PresentWidgetItem[] | undefined): PresentWidgetItem[] {
  return (items || []).slice(0, PRESENT_WIDGET_MAX_ITEMS).map((item, index) => ({
    id: sanitizeWidgetText(item.id, 80) || `item-${index + 1}`,
    label: sanitizeWidgetText(item.label, 80) || `Item ${index + 1}`,
    value: sanitizeWidgetText(item.value, 80),
    subtitle: sanitizeWidgetText(item.subtitle, 120),
    color: /^#[0-9a-f]{6}$/i.test(item.color || '') ? item.color : undefined,
    status: ['neutral', 'good', 'warning', 'critical'].includes(item.status || '') ? item.status : 'neutral',
  }));
}

export function normalizePresentWidget(widget: PresentWidgetSceneObject): PresentWidgetSceneObject {
  const month = Math.max(0, Math.min(11, Math.trunc(finite(widget.calendarMonth, new Date().getMonth()))));
  const year = Math.max(1970, Math.min(9999, Math.trunc(finite(widget.calendarYear, new Date().getFullYear()))));
  return {
    ...widget,
    label: sanitizeWidgetText(widget.label, 120),
    value: sanitizeWidgetText(widget.value, 180),
    secondaryValue: sanitizeWidgetText(widget.secondaryValue, 120),
    progress: clampWidgetPercent(widget.progress),
    items: normalizeWidgetItems(widget.items),
    profileName: sanitizeWidgetText(widget.profileName, 80),
    profileRole: sanitizeWidgetText(widget.profileRole, 100),
    calendarYear: year,
    calendarMonth: month,
    highlightedDays: [...new Set((widget.highlightedDays || []).map((d) => Math.trunc(d)).filter((d) => d >= 1 && d <= 31))].slice(0, 31),
    iconKey: ['activity', 'shield', 'users', 'trend', 'clock', 'target'].includes(widget.iconKey || '') ? widget.iconKey : 'activity',
    deviceKind: ['browser', 'phone', 'tablet'].includes(widget.deviceKind || '') ? widget.deviceKind : 'browser',
    deviceUrlLabel: sanitizeWidgetText(widget.deviceUrlLabel, 120),
    galleryItems: (widget.galleryItems || []).slice(0, PRESENT_WIDGET_MAX_GALLERY_ITEMS).map((item, index) => ({
      id: sanitizeWidgetText(item.id, 80) || `gallery-${index + 1}`,
      name: sanitizeWidgetText(item.name, 100) || `Image ${index + 1}`,
      dataUrl: /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(item.dataUrl) ? item.dataUrl : '',
      caption: sanitizeWidgetText(item.caption, 120),
    })).filter((item) => item.dataUrl),
    ratingValue: Math.max(0, Math.min(10, finite(widget.ratingValue, 5))),
    ratingMax: Math.max(1, Math.min(10, Math.trunc(finite(widget.ratingMax, 5)))),
  };
}

const item = (id: string, label: string, value?: string, subtitle?: string, color?: string): PresentWidgetItem => ({
  id, label, value, subtitle, color, status: 'neutral',
});

export function createPresentWidgetDefaults(widgetType: PresentWidgetType): Omit<PresentWidgetSceneObject, keyof PresentObjectGeometry | 'id' | 'kind'> {
  const base = {
    widgetType,
    label: 'Metric',
    value: '89.4%',
    accentColor: '#22d3ee',
    progress: 76,
    secondaryValue: '',
    items: [] as PresentWidgetItem[],
    profileName: '',
    profileRole: '',
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth(),
    highlightedDays: [] as number[],
    iconKey: 'activity' as const,
    deviceKind: 'browser' as const,
    deviceUrlLabel: 'astraea.local/dashboard',
    galleryItems: [] as PresentWidgetGalleryItem[],
    ratingValue: 4,
    ratingMax: 5,
  };

  switch (widgetType) {
    case 'kpi': return { ...base, label: 'ARR Growth', value: '$2.4M', secondaryValue: '+42% YoY', iconKey: 'trend' };
    case 'progress': return { ...base, label: 'Deployment Progress', value: '76%', progress: 76 };
    case 'progress-ring': return { ...base, label: 'Completion', value: '76%', progress: 76 };
    case 'gauge': return { ...base, label: 'Security Score', value: '98/100', progress: 98, iconKey: 'shield' };
    case 'milestone': return { ...base, label: 'Delivery Timeline', value: 'Q3', items: [item('m1','Discover','Done','Week 1','#22d3ee'), item('m2','Build','Active','Week 2–4','#a78bfa'), item('m3','Ship','Next','Week 5','#10b981')] };
    case 'roadmap': return { ...base, label: 'Product Roadmap', value: '3 phases', items: [item('r1','Foundation','Complete','Core','#22d3ee'), item('r2','Scale','Current','Automation','#f59e0b'), item('r3','Launch','Planned','Release','#10b981')] };
    case 'comparison': return { ...base, label: 'Architecture Comparison', value: 'Sovereign wins', items: [item('c1','Cloud','External','Network dependency','#64748b'), item('c2','Astraea','Local-first','Controlled egress','#22d3ee')] };
    case 'quote': return { ...base, label: 'Customer Voice', value: '“The workspace finally behaves like the data belongs to us.”', profileName: 'Alex Morgan', profileRole: 'Security Lead' };
    case 'status': return { ...base, label: 'System Status', value: 'Operational', items: [
      { ...item('s1','Core','Healthy'), status: 'good' }, { ...item('s2','Sync','Healthy'), status: 'good' }, { ...item('s3','Export','Review'), status: 'warning' }, { ...item('s4','Network','Denied'), status: 'neutral' },
    ] };
    case 'calendar': return { ...base, label: 'Launch Calendar', value: 'Milestones', highlightedDays: [4, 12, 18, 27] };
    case 'icon-stat': return { ...base, label: 'Protected Objects', value: '14,280', secondaryValue: '+1,240 this week', iconKey: 'shield' };
    case 'device': return { ...base, label: 'Product Preview', value: 'Astraea Workspace', deviceKind: 'browser', deviceUrlLabel: 'astraea.local/workspace' };
    case 'gallery': return { ...base, label: 'Visual Gallery', value: 'Drop up to 6 images' };
    case 'rating': return { ...base, label: 'Audit Score', value: '4.6 / 5', ratingValue: 4.6, ratingMax: 5 };
  }
}

export async function validatePresentWidgetGalleryFile(file: File): Promise<void> {
  if (file.size <= 0 || file.size > PRESENT_WIDGET_MAX_GALLERY_FILE_BYTES) throw new Error('Gallery image must be between 1 byte and 8 MiB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const probe = probeMediaBoundary(bytes, file.type);
  if (!['image/png','image/jpeg','image/webp'].includes(probe.mimeType)) throw new Error('Gallery image MIME/signature mismatch or unsupported format.');
  const isolated = await preflightIsolatedImageDecode(file);
  if (!isolated.image_width || !isolated.image_height) throw new Error('Gallery image failed isolated decoder preflight.');
}

export async function fileToPresentWidgetGalleryItem(file: File, id: string): Promise<PresentWidgetGalleryItem> {
  await validatePresentWidgetGalleryFile(file);
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read gallery image.'));
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Gallery image read produced invalid data.'));
    reader.readAsDataURL(file);
  });
  return { id, name: sanitizeWidgetText(file.name, 100), dataUrl, caption: '' };
}
