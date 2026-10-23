// STATUS: PLATIN — Publish: Vorpruefungsbericht und Ausgabevorgaben aus dem Dokument (AST-1403, AST-1428)
//
// **AST-1403** — Akzeptanzsatz: „Fehlender Font/Bildaufloesung/Anschnitt als navigierbaren Fehler listen".
// Gemessen vorher: der Inspektor rief `runPublishPreflight(model)` **ohne** Profil, also immer mit der Vorgabe.
// Das **gewaehlte** Profil wurde nirgends festgehalten — nach Speichern und Wiedereroeffnen lief die Pruefung mit
// der Vorgabe, und **dieselben Nutzdaten ergaben andere Befunde**.
//
// **AST-1428** — Akzeptanzsatz: „Einen Artikel als reflow-faehiges EPUB/HTML mit Bild-Alttext ausgeben".
// Gemessen vorher: `model.exportPresets` stand im Vertrag, und **kein** Exportweg las es.
import { describe, expect, it } from 'vitest';
import { createPublishProject } from '../../../model/publishDocumentFactory';
import { PublishModelError, addFrameToPublish } from '../../../model/publishDocumentEngine';
import {
  activePublishPreflightProfile, buildPublishPreflightReport, createDefaultExportPreset,
  describePublishExportPreset, publishPresetLayout, resolvePublishExportPreset, setPublishPreflightProfile,
  upsertPublishExportPreset,
} from '../../../model/publishPresetOps';
import { verifyPublishPayloadRoundtrip } from '../../../model/publishPersistence';
import { buildPublishExport } from '../../../interchange/publishExportDelivery';

const codes = (run: () => unknown): string => {
  try { run(); return 'no-error'; } catch (error) { return error instanceof PublishModelError ? error.code : `not-a-model-error:${String(error)}`; }
};

/** Ein Dokument mit **echten** Befunden: kein Anschnitt, ein Bild ohne Alternativtext, ein Ueberlauf. */
function documentWithFindings() {
  const project = createPublishProject({ pages: 2, bleedMm: 0 });
  const withImage = addFrameToPublish(project, 'image', { name: 'Bild', altText: '' });
  const withText = addFrameToPublish(withImage, 'text', { content: 'x'.repeat(40_000), name: 'Ueberlauf' });
  return withText;
}

describe('AST-1403 — die Vorpruefungsvorgabe gehoert ins Dokument', () => {
  it('benutzt ohne Wahl die Vorgabe', () => {
    const project = createPublishProject({ pages: 1 });
    expect(project.preflightProfiles).toEqual([]);
    expect(activePublishPreflightProfile(project).id).toBe('preflight-FOGRA51');
  });

  it('haelt die Wahl fest und liest sie danach', () => {
    const chosen = setPublishPreflightProfile(createPublishProject({ pages: 1 }), 'FOGRA39');
    expect(chosen.preflightProfiles).toHaveLength(1);
    expect(activePublishPreflightProfile(chosen).id).toBe('preflight-FOGRA39');
    // Die Grenze des Profils kommt mit — FOGRA39 erlaubt 330 % TIC, FOGRA51 nur 300 %.
    expect(activePublishPreflightProfile(chosen).maxTicPercent).toBe(330);
  });

  it('haelt **genau eine** Vorgabe vorn und wirft die alte nicht weg', () => {
    const first = setPublishPreflightProfile(createPublishProject({ pages: 1 }), 'FOGRA39');
    const second = setPublishPreflightProfile(first, 'GRACOL_2013');
    expect(activePublishPreflightProfile(second).id).toBe('preflight-GRACOL_2013');
    expect(second.preflightProfiles).toHaveLength(2);
    expect(second.preflightProfiles.some((profile) => profile.id === 'preflight-FOGRA39')).toBe(true);
    // Dieselbe Wahl zweimal ist idempotent, keine zweite Kopie.
    expect(setPublishPreflightProfile(second, 'GRACOL_2013').preflightProfiles).toHaveLength(2);
  });

  it('lehnt eine unbekannte Kennung benannt ab', () => {
    expect(codes(() => setPublishPreflightProfile(createPublishProject({ pages: 1 }), 'CMYK_DRAFT' as never))).toBe('preflight-profile-unknown:CMYK_DRAFT');
  });

  it('liefert den Bericht **mit** seinem Profil — ein Befund ohne Profil ist nicht nachvollziehbar', () => {
    const report = buildPublishPreflightReport(documentWithFindings());
    expect(report.profileId).toBe('preflight-FOGRA51');
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.summary).toContain('error(s)');
    expect(report.summary).toContain('navigable');
  });

  it('listet die Befunde als **navigierbar** — mit Sprungziel', () => {
    const report = buildPublishPreflightReport(documentWithFindings());
    expect(report.navigableFindings.length).toBeGreaterThan(0);
    for (const finding of report.navigableFindings) {
      // `navigable` heisst: es gibt ein Ziel. Genau das verlangt der Akzeptanzsatz.
      expect(finding.navigable).toBe(true);
      expect(Boolean(finding.frameId) || Boolean(finding.pageId) || Boolean(finding.assetId)).toBe(true);
    }
    // Und die Zahl der Navigierbaren ist die Zahl der Befunde mit `navigable`.
    expect(report.navigableFindings).toHaveLength(report.findings.filter((finding) => finding.navigable).length);
  });

  it('**dieselben Nutzdaten ergeben dieselben Befunde** — nach Speichern und Wiedereroeffnen', () => {
    const chosen = setPublishPreflightProfile(documentWithFindings(), 'FOGRA39');
    const before = buildPublishPreflightReport(chosen);
    const { reopened, diff } = verifyPublishPayloadRoundtrip(chosen, 0);
    expect(diff.identical).toBe(true);
    const after = buildPublishPreflightReport(reopened);
    // Genau der Befund, der vorher fehlte: ohne die gespeicherte Wahl haette die Vorgabe geprueft.
    expect(after.profileId).toBe(before.profileId);
    expect(after.findings.map((finding) => finding.id)).toEqual(before.findings.map((finding) => finding.id));
    expect(after.errorCount).toBe(before.errorCount);
    expect(after.summary).toBe(before.summary);
  });

  it('unterscheidet sich messbar, wenn die Vorgabe nicht gespeichert waere', () => {
    // Der Gegenbeweis zur Behauptung „es aendert sich nichts": die Vorgabe prueft mit 300 %, FOGRA39 mit 330 %.
    const withoutChoice = buildPublishPreflightReport(documentWithFindings());
    const withChoice = buildPublishPreflightReport(setPublishPreflightProfile(documentWithFindings(), 'FOGRA39'));
    expect(withoutChoice.profile.maxTicPercent).toBe(300);
    expect(withChoice.profile.maxTicPercent).toBe(330);
  });
});

describe('AST-1428 — eine Ausgabevorgabe wird gelesen', () => {
  it('uebersetzt jede Art in ein Ziel und ein Layout', () => {
    expect(resolvePublishExportPreset({ ...createPublishProject({ pages: 1 }), exportPresets: [createDefaultExportPreset('pdfx', 'Druck-PDF', 'FOGRA51')] }, 'preset-pdfx').target).toBe('pdfx4');
    expect(resolvePublishExportPreset({ ...createPublishProject({ pages: 1 }), exportPresets: [createDefaultExportPreset('epub-reflow', 'EPUB')] }, 'preset-epub-reflow').target).toBe('epub');
    expect(resolvePublishExportPreset({ ...createPublishProject({ pages: 1 }), exportPresets: [createDefaultExportPreset('html-fixed', 'HTML fest')] }, 'preset-html-fixed').layout).toBe('fixed');
    expect(resolvePublishExportPreset({ ...createPublishProject({ pages: 1 }), exportPresets: [createDefaultExportPreset('epub-reflow', 'EPUB')] }, 'preset-epub-reflow').layout).toBe('reflow');
    expect(publishPresetLayout('html-reflow')).toBe('reflow');
    expect(publishPresetLayout('epub-fixed')).toBe('fixed');
    expect(publishPresetLayout('package')).toBe('reflow');
  });

  it('reicht das Ausgabeprofil durch, wenn es eine bekannte Kennung ist — und laesst es sonst weg', () => {
    const withProfile = upsertPublishExportPreset(createPublishProject({ pages: 1 }), createDefaultExportPreset('pdfx', 'Druck', 'FOGRA39'));
    expect(resolvePublishExportPreset(withProfile, 'preset-pdfx').profileId).toBe('FOGRA39');
    const unknown = upsertPublishExportPreset(createPublishProject({ pages: 1 }), { ...createDefaultExportPreset('pdfx', 'Druck'), outputProfileId: 'IRGENDWAS' });
    expect(resolvePublishExportPreset(unknown, 'preset-pdfx').profileId).toBeUndefined();
  });

  it('legt eine Vorgabe an und ersetzt sie an derselben Kennung', () => {
    const once = upsertPublishExportPreset(createPublishProject({ pages: 1 }), createDefaultExportPreset('pdfx', 'Druck-PDF', 'FOGRA51'));
    expect(once.exportPresets).toHaveLength(1);
    const twice = upsertPublishExportPreset(once, { ...createDefaultExportPreset('pdfx', 'Druck-PDF neu'), accessible: false });
    expect(twice.exportPresets).toHaveLength(1);
    expect(twice.exportPresets[0]!.name).toBe('Druck-PDF neu');
    expect(twice.exportPresets[0]!.accessible).toBe(false);
  });

  it('**verbietet Skript in der Ausgabe** — der Vertrag fuehrt `javascriptAllowed: false`', () => {
    // Eine Vorgabe, die Skript erlaubt, ist nicht darstellbar; dieses Modul erfindet keinen Weg daran vorbei.
    expect(codes(() => upsertPublishExportPreset(createPublishProject({ pages: 1 }), { ...createDefaultExportPreset('pdfx', 'X'), javascriptAllowed: true as never }))).toBe('export-preset-javascript-forbidden');
    expect(createDefaultExportPreset('pdfx', 'X').javascriptAllowed).toBe(false);
  });

  it('lehnt leeren Namen, unbekannte Art und eine fehlende Vorgabe benannt ab', () => {
    const project = createPublishProject({ pages: 1 });
    expect(codes(() => upsertPublishExportPreset(project, { ...createDefaultExportPreset('pdfx', 'X'), name: '  ' }))).toBe('export-preset-name-empty');
    expect(codes(() => resolvePublishExportPreset(project, 'preset-nope'))).toBe('export-preset-missing:preset-nope');
  });

  it('beschreibt die Vorgabe in Worten — Ziel und Behandlung', () => {
    const model = upsertPublishExportPreset(createPublishProject({ pages: 1 }), createDefaultExportPreset('epub-fixed', 'EPUB fest', 'FOGRA51'));
    const text = describePublishExportPreset(model, 'preset-epub-fixed');
    expect(text).toContain('EPUB fest');
    expect(text).toContain('epub-fixed → epub (fixed)');
    expect(text).toContain('accessible');
  });

  it('der Export **liest** die Vorgabe wirklich: Ziel, Layout und Dateiname kommen daraus', async () => {
    const model = upsertPublishExportPreset(
      addFrameToPublish(createPublishProject({ pages: 2, title: 'VGT Broschuere' }), 'image', { name: 'Bild', altText: 'Ein Balken' }),
      createDefaultExportPreset('epub-reflow', 'EPUB umbrechend'),
    );
    // Ohne `target` — nur die Vorgabe sagt, was entsteht.
    const artifact = await buildPublishExport(model, { presetId: 'preset-epub-reflow', title: 'VGT Broschuere' } as never);
    expect(artifact.target).toBe('epub');
    expect(artifact.mimeType).toBe('application/epub+zip');
    // Der Stamm nennt das **Ziel**, nicht die Vorgabe — dieselbe Regel wie bei jedem anderen Export.
    expect(artifact.fileName).toBe('VGT-Broschuere-epub.epub');
    // Reflow heisst: die Geometrie bleibt nicht erhalten — und das steht als Warnung da.
    expect(artifact.warnings).toContain('Reflow layout: page geometry is not preserved.');
  });

  it('die Vorgabe ueberlebt Speichern und Wiedereroeffnen', () => {
    const model = upsertPublishExportPreset(createPublishProject({ pages: 1 }), createDefaultExportPreset('html-fixed', 'HTML fest', 'FOGRA51'));
    const { reopened, diff } = verifyPublishPayloadRoundtrip(model, 0);
    expect(diff.identical).toBe(true);
    expect(resolvePublishExportPreset(reopened, 'preset-html-fixed').layout).toBe('fixed');
  });
});
