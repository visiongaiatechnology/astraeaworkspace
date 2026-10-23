// STATUS: PLATIN — localized rendering of persisted Present snapshot metric labels.
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { PresentDocumentModel, PresentSlide, PresentWorkspaceSceneObject } from '../../../../shared/contracts/workspace';
import { WORKSPACE_LOCALES, type WorkspaceLocale } from '../../../../shell/localization/workspaceLocaleTypes';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { PresentWorkspaceSnapshotView } from '../../canvas/rendering/PresentWorkspaceSnapshotView';
import { PresentObjectInspector } from '../../editor/inspector/PresentObjectInspector';
import { buildPresentSlideSvg } from '../../interchange/render/presentExport';
import { renderPresentWorkspaceSnapshotSvg } from '../../interchange/rendering/presentWorkspaceSnapshotSvg';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

const noop = (): void => undefined;

const uncategorizedSlide: PresentSlide = { id: 'uncategorized-slide', title: 'Authored title', subtitle: '', layout: 'blank' };
const slideModel: PresentDocumentModel = { slides: [uncategorizedSlide] };
const slideFallbacks: Readonly<Record<WorkspaceLocale, string>> = {
  'en-US': 'Slide',
  'de-DE': 'Folie',
  'ru-RU': 'Слайд',
  'it-IT': 'Diapositiva',
  'es-ES': 'Diapositiva',
  'ja-JP': 'スライド',
  'zh-CN': '幻灯片',
};

const writerLabels: Readonly<Record<WorkspaceLocale, readonly [string, string, string]>> = {
  'en-US': ['Document', 'Version', 'Paragraphs'],
  'de-DE': ['Dokument', 'Version', 'Absätze'],
  'ru-RU': ['Документ', 'Версия', 'Абзацы'],
  'it-IT': ['Documento', 'Versione', 'Paragrafi'],
  'es-ES': ['Documento', 'Versión', 'Párrafos'],
  'ja-JP': ['文書', 'バージョン', '段落'],
  'zh-CN': ['文档', '版本', '段落'],
};

const gridLabels: Readonly<Record<WorkspaceLocale, readonly [string, string, string, string]>> = {
  'en-US': ['Range', 'Values', 'Sum', 'Average'],
  'de-DE': ['Bereich', 'Werte', 'Summe', 'Durchschnitt'],
  'ru-RU': ['Диапазон', 'Значения', 'Сумма', 'Среднее'],
  'it-IT': ['Intervallo', 'Valori', 'Somma', 'Media'],
  'es-ES': ['Rango', 'Valores', 'Suma', 'Promedio'],
  'ja-JP': ['範囲', '値', '合計', '平均'],
  'zh-CN': ['范围', '数值', '总和', '平均值'],
};

const writerObject: PresentWorkspaceSceneObject = {
  id: 'writer-snapshot', kind: 'workspace', integrationKind: 'writer-section', mode: 'Frozen',
  sourceDocumentId: 'writer-document', sourceVersion: 7,
  uri: 'vgt://workspace/document/writer-document/present-reference?kind=writer-section',
  title: 'Authored presentation title',
  snapshot: { type: 'summary', metrics: [
    { label: 'Document', value: 'Authored document title' },
    { label: 'Version', value: '7' },
    { label: 'Paragraphs', value: '3' },
    { label: 'Authored field', value: 'untouched' },
  ], lines: ['Authored paragraph stays unchanged'] },
  xPercent: 10, yPercent: 20, widthPercent: 40, heightPercent: 30, rotation: 0, opacity: 1, zIndex: 1,
};

const gridObject: PresentWorkspaceSceneObject = {
  ...writerObject,
  id: 'grid-kpi-snapshot', integrationKind: 'grid-kpi', sourceDocumentId: 'grid-document',
  uri: 'vgt://workspace/document/grid-document/present-reference?kind=grid-kpi',
  snapshot: { type: 'summary', metrics: [
    { label: 'Range', value: 'A1:B2' },
    { label: 'Values', value: '4' },
    { label: 'Sum', value: '50' },
    { label: 'Average', value: '12.5' },
  ], lines: ['2 · 3', '5 · 6'] },
};

const liveObject: PresentWorkspaceSceneObject = { ...writerObject, id: 'writer-live-snapshot', mode: 'Live' };
const chartObject: PresentWorkspaceSceneObject = {
  ...writerObject, id: 'chart-snapshot', integrationKind: 'grid-chart',
  snapshot: { type: 'chart', title: '', categories: ['Authored category'], series: [{ name: 'Authored series', values: [9] }] },
};
const pdfPageObject: PresentWorkspaceSceneObject = {
  ...writerObject, id: 'pdf-page-snapshot', integrationKind: 'pdf-page',
  snapshot: { type: 'pdf-page', pageNumber: 4, title: 'Authored PDF title', subtitle: 'Authored PDF subtitle', sections: [{ id: 'section-1', type: 'heading', content: 'Authored PDF content' }] },
};
const pdfAnnotationObject: PresentWorkspaceSceneObject = {
  ...writerObject, id: 'pdf-annotation-snapshot', integrationKind: 'pdf-page',
  snapshot: { type: 'pdf-annotation', page: 5, annotationType: 'Authored annotation type', text: 'Authored annotation text', author: 'Authored reviewer' },
};
const vaultObject: PresentWorkspaceSceneObject = {
  ...writerObject, id: 'vault-snapshot', integrationKind: 'vault-asset',
  snapshot: { type: 'vault-asset', fileId: 'vault-file', name: 'Authored asset name', sizeBytes: 128, integrityState: 'unverified' },
};
const spaceObject: PresentWorkspaceSceneObject = {
  ...writerObject, id: 'space-snapshot', integrationKind: 'space-context',
  snapshot: { type: 'space-context', spaceId: 'space-id', name: 'Authored space name', description: 'Authored space description', role: 'Authored role', permissions: [], linkedDocumentIds: ['doc-a', 'doc-b'], activity: [], retainedWriterCommentIds: [] },
};

const workspaceRenderCopy: Readonly<Record<WorkspaceLocale, Readonly<{
  chart: string; page4: string; page5: string; integrity: string; integrityStates: readonly [string, string, string, string];
  role: string; linkedDocuments2: string; vaultAsset: string; workspaceProperties: string; workspaceReference: string;
  objectTitle: string; source: string; uri: string; kind: string; version: string; writerSection: string; live: string; frozen: string;
}>>> = {
  'en-US': { chart: 'Chart', page4: 'Page 4', page5: 'Page 5', integrity: 'Integrity', integrityStates: ['unverified', 'verified', 'mismatch', 'unavailable'], role: 'Role', linkedDocuments2: '2 linked documents', vaultAsset: 'Vault asset', workspaceProperties: 'Workspace Properties', workspaceReference: 'Workspace Reference', objectTitle: 'Workspace object title', source: 'Source', uri: 'URI', kind: 'Kind', version: 'Version', writerSection: 'Writer section', live: 'Live', frozen: 'Frozen' },
  'de-DE': { chart: 'Diagramm', page4: 'Seite 4', page5: 'Seite 5', integrity: 'Integrität', integrityStates: ['nicht verifiziert', 'verifiziert', 'Abweichung', 'nicht verfügbar'], role: 'Rolle', linkedDocuments2: '2 verknüpfte Dokumente', vaultAsset: 'Tresorobjekt', workspaceProperties: 'Workspace-Eigenschaften', workspaceReference: 'Workspace-Verweis', objectTitle: 'Titel des Workspace-Objekts', source: 'Quelle', uri: 'URI', kind: 'Typ', version: 'Version', writerSection: 'Textabschnitt', live: 'Live', frozen: 'Eingefroren' },
  'ru-RU': { chart: 'Диаграмма', page4: 'Страница 4', page5: 'Страница 5', integrity: 'Целостность', integrityStates: ['не проверено', 'проверено', 'несоответствие', 'недоступно'], role: 'Роль', linkedDocuments2: '2 связанных документа', vaultAsset: 'Объект хранилища', workspaceProperties: 'Свойства Workspace', workspaceReference: 'Ссылка Workspace', objectTitle: 'Название объекта Workspace', source: 'Источник', uri: 'URI', kind: 'Тип', version: 'Версия', writerSection: 'Раздел документа', live: 'Актуальная ссылка', frozen: 'Снимок' },
  'it-IT': { chart: 'Grafico', page4: 'Pagina 4', page5: 'Pagina 5', integrity: 'Integrità', integrityStates: ['non verificato', 'verificato', 'non corrispondente', 'non disponibile'], role: 'Ruolo', linkedDocuments2: '2 documenti collegati', vaultAsset: 'Elemento archivio', workspaceProperties: 'Proprietà Workspace', workspaceReference: 'Riferimento Workspace', objectTitle: 'Titolo dell’oggetto Workspace', source: 'Origine', uri: 'URI', kind: 'Tipo', version: 'Versione', writerSection: 'Sezione documento', live: 'Live', frozen: 'Fissato' },
  'es-ES': { chart: 'Gráfico', page4: 'Página 4', page5: 'Página 5', integrity: 'Integridad', integrityStates: ['sin verificar', 'verificado', 'no coincide', 'no disponible'], role: 'Rol', linkedDocuments2: '2 documentos vinculados', vaultAsset: 'Elemento de bóveda', workspaceProperties: 'Propiedades de Workspace', workspaceReference: 'Referencia de Workspace', objectTitle: 'Título del objeto de Workspace', source: 'Origen', uri: 'URI', kind: 'Tipo', version: 'Versión', writerSection: 'Sección del documento', live: 'Live', frozen: 'Fijado' },
  'ja-JP': { chart: 'グラフ', page4: 'ページ 4', page5: 'ページ 5', integrity: '整合性', integrityStates: ['未検証', '検証済み', '不一致', '利用不可'], role: '役割', linkedDocuments2: '関連ドキュメント 2 件', vaultAsset: '保管庫アセット', workspaceProperties: 'Workspace のプロパティ', workspaceReference: 'Workspace 参照', objectTitle: 'Workspace オブジェクトのタイトル', source: 'ソース', uri: 'URI', kind: '種類', version: 'バージョン', writerSection: '文書セクション', live: 'Live', frozen: '固定' },
  'zh-CN': { chart: '图表', page4: '第 4 页', page5: '第 5 页', integrity: '完整性', integrityStates: ['未验证', '已验证', '不匹配', '不可用'], role: '角色', linkedDocuments2: '2 个关联文档', vaultAsset: '保险库资源', workspaceProperties: 'Workspace 属性', workspaceReference: 'Workspace 引用', objectTitle: 'Workspace 对象标题', source: '来源', uri: 'URI', kind: '类型', version: '版本', writerSection: '文档章节', live: '实时', frozen: '冻结' },
};

const integrityStates = ['unverified', 'verified', 'mismatch', 'unavailable'] as const;
const vaultStateObjects: readonly PresentWorkspaceSceneObject[] = integrityStates.map((integrityState, index) => ({
  ...vaultObject,
  id: `vault-snapshot-${index}`,
  snapshot: { ...vaultObject.snapshot, integrityState },
}));

it('localizes generated metric labels in the canvas and SVG while preserving snapshot data and values', () => {
  const originalWriterSnapshot = structuredClone(writerObject.snapshot);
  const originalGridSnapshot = structuredClone(gridObject.snapshot);

  for (const locale of WORKSPACE_LOCALES) {
    vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
    const writerMarkup = renderToStaticMarkup(<PresentWorkspaceSnapshotView object={writerObject} />);
    const gridMarkup = renderToStaticMarkup(<PresentWorkspaceSnapshotView object={gridObject} />);
    const writerSvg = renderPresentWorkspaceSnapshotSvg(writerObject, { x: 0, y: 0, w: 480, h: 240 }, locale);
    const gridSvg = renderPresentWorkspaceSnapshotSvg(gridObject, { x: 0, y: 0, w: 480, h: 240 }, locale);
    const slideSvg = buildPresentSlideSvg(uncategorizedSlide, slideModel, 480, 270, undefined, locale);

    for (const label of writerLabels[locale]) {
      expect(writerMarkup, `${locale} Writer canvas label`).toContain(label);
      expect(writerSvg, `${locale} Writer SVG label`).toContain(label);
    }
    for (const label of gridLabels[locale]) {
      expect(gridMarkup, `${locale} Grid canvas label`).toContain(label);
      expect(gridSvg, `${locale} Grid SVG label`).toContain(label);
    }
    expect(slideSvg, `${locale} localized slide fallback`).toContain(slideFallbacks[locale]);
    const authoredCategorySvg = buildPresentSlideSvg({ ...uncategorizedSlide, categoryTag: 'Quarterly update' }, slideModel, 480, 270, undefined, locale);
    expect(authoredCategorySvg, `${locale} preserves an authored slide category`).toContain('Quarterly update');
    for (const value of ['Authored document title', '7', '3', 'A1:B2', '4', '50', '12.5', 'untouched', 'Authored paragraph stays unchanged']) {
      expect(`${writerMarkup}${gridMarkup}${writerSvg}${gridSvg}`, `${locale} preserved value ${value}`).toContain(value);
    }
  }

  expect(writerObject.snapshot).toEqual(originalWriterSnapshot);
  expect(gridObject.snapshot).toEqual(originalGridSnapshot);
});

it('localizes Workspace mode and detail labels in canvas, inspector, and exported SVG without changing snapshot data', () => {
  const detailObjects = [chartObject, pdfPageObject, pdfAnnotationObject, ...vaultStateObjects, spaceObject];
  const originalObjects = [writerObject, liveObject, ...detailObjects].map((object) => structuredClone(object));

  for (const locale of WORKSPACE_LOCALES) {
    vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
    const expected = workspaceRenderCopy[locale];
    const modeObjects = [liveObject, writerObject];

    for (const object of modeObjects) {
      const modeLabel = object.mode === 'Live' ? expected.live : expected.frozen;
      const canvasMarkup = renderToStaticMarkup(<PresentWorkspaceSnapshotView object={object} />);
      const snapshotSvg = renderPresentWorkspaceSnapshotSvg(object, { x: 0, y: 0, w: 480, h: 240 }, locale);
      const exportSlide: PresentSlide = { ...uncategorizedSlide, sceneObjects: [object] };
      const exportedSvg = buildPresentSlideSvg(exportSlide, { slides: [exportSlide] }, 480, 270, undefined, locale);
      expect(canvasMarkup, `${locale} canvas mode`).toContain(modeLabel);
      expect(snapshotSvg, `${locale} SVG mode`).toContain(modeLabel);
      const alignedModeText = snapshotSvg.match(/<text x="([^"]+)" y="([^"]+)" text-anchor="end"[^>]*>([^<]*)<\/text>/);
      expect(alignedModeText?.[3], `${locale} SVG mode text`).toBe(modeLabel);
      expect(Number(alignedModeText?.[1]), `${locale} SVG mode right inset`).toBe(472);
      expect(Number(alignedModeText?.[1]), `${locale} SVG mode stays inside snapshot`).toBeLessThanOrEqual(480);
      expect(exportedSvg, `${locale} slide export mode`).toContain(modeLabel);
      expect(object.mode, `${locale} persisted mode`).toBe(object === liveObject ? 'Live' : 'Frozen');
    }

    for (const object of detailObjects) {
      const canvasMarkup = renderToStaticMarkup(<PresentWorkspaceSnapshotView object={object} />);
      const snapshotSvg = renderPresentWorkspaceSnapshotSvg(object, { x: 0, y: 0, w: 480, h: 240 }, locale);
      const exportSlide: PresentSlide = { ...uncategorizedSlide, sceneObjects: [object] };
      const exportedSvg = buildPresentSlideSvg(exportSlide, { slides: [exportSlide] }, 480, 270, undefined, locale);
      const rendered = `${canvasMarkup}${snapshotSvg}${exportedSvg}`;

      if (object.snapshot.type === 'chart') expect(rendered, `${locale} chart fallback`).toContain(expected.chart);
      if (object.snapshot.type === 'pdf-page' || object.snapshot.type === 'pdf-annotation') expect(rendered, `${locale} PDF page label`).toContain(object.snapshot.type === 'pdf-page' ? expected.page4 : expected.page5);
      if (object.snapshot.type === 'vault-asset') {
        expect(rendered, `${locale} Vault fallback`).toContain(expected.vaultAsset);
        expect(rendered, `${locale} integrity label`).toContain(expected.integrity);
        expect(rendered, `${locale} localized integrity state`).toContain(expected.integrityStates[integrityStates.indexOf(object.snapshot.integrityState || 'unverified')]);
      }
      if (object.snapshot.type === 'space-context') {
        expect(rendered, `${locale} role label`).toContain(expected.role);
        expect(rendered, `${locale} linked document count`).toContain(expected.linkedDocuments2);
        expect(rendered, `${locale} authored role`).toContain('Authored role');
      }
    }

    const inspectorMarkup = renderToStaticMarkup(
      <PresentObjectInspector
        selectedObject={liveObject}
        selectedImage={null}
        allObjects={[liveObject]}
        onPatchObject={() => undefined}
        onPatchImage={() => undefined}
        onUpdateAllObjects={() => undefined}
        onClose={noop}
      />,
    );
    expect(inspectorMarkup, `${locale} inspector properties heading`).toContain(expected.workspaceProperties);
    expect(inspectorMarkup, `${locale} inspector section heading`).toContain(expected.workspaceReference);
    expect(inspectorMarkup, `${locale} title accessible name`).toContain(`aria-label="${expected.objectTitle}"`);
    expect(inspectorMarkup, `${locale} live mode`).toContain(expected.live);
    expect(inspectorMarkup, `${locale} frozen mode`).toContain(expected.frozen);
    expect(inspectorMarkup, `${locale} kind label`).toContain(expected.kind);
    expect(inspectorMarkup, `${locale} integration kind display`).toContain(expected.writerSection);
    expect(inspectorMarkup, `${locale} source label`).toContain(expected.source);
    expect(inspectorMarkup, `${locale} version label`).toContain(expected.version);
    expect(inspectorMarkup, `${locale} URI label`).toContain(expected.uri);
    expect(inspectorMarkup, `${locale} URI value`).toContain(writerObject.uri);
    expect(inspectorMarkup, `${locale} authored object title`).toContain(writerObject.title);
  }

  expect([writerObject, liveObject, ...detailObjects]).toEqual(originalObjects);
  expect(writerObject.mode).toBe('Frozen');
  expect(liveObject.mode).toBe('Live');
  expect(writerObject.integrationKind).toBe('writer-section');
  expect(writerObject.uri).toBe('vgt://workspace/document/writer-document/present-reference?kind=writer-section');
  expect(pdfPageObject.snapshot).toMatchObject({ title: 'Authored PDF title', subtitle: 'Authored PDF subtitle', sections: [{ content: 'Authored PDF content' }] });
  expect(pdfAnnotationObject.snapshot).toMatchObject({ annotationType: 'Authored annotation type', text: 'Authored annotation text', author: 'Authored reviewer' });
  expect(spaceObject.snapshot).toMatchObject({ name: 'Authored space name', role: 'Authored role', linkedDocumentIds: ['doc-a', 'doc-b'] });
});
