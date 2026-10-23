// STATUS: PLATIN — Publish: die Verdrahtung der sichtbaren Flaeche (ohne DOM gepinnt)
//
// Ein gerenderter Test der ganzen Ansicht braucht `localStorage` und ein DOM, das diese Umgebung nicht hat.
// Was **ohne** DOM pruefbar ist und trotzdem weh tut, ist die Verdrahtung: dass der neue Einstieg da ist,
// dass die Seitenleiste erreichbar ist, dass die Tastatur an der reinen Absicht haengt und dass die Ansicht
// keine Regel selbst nachbaut. Genau diese Faelle haben in diesem Projekt wiederholt gefehlt: eine getestete
// reine Schicht, die aus **keiner** Komponente erreichbar war.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
// Drei Ebenen hoch: editor → unit → testing → publish. Die neunte Wiederholung dieser Ebenenfalle im Projekt.
const publish = path.resolve(here, '../../..');
const read = (relative) => readFileSync(path.resolve(publish, relative), 'utf8');
const code = (relative) => read(relative).replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');

const view = code('PublishView.tsx');
const canvas = code('canvas/PublishCanvas.tsx');
const inspector = code('editor/PublishInspector.tsx');
const inspectorCommands = code('editor/publishInspectorCommands.ts');
const dialog = code('editor/PublishNewDocumentDialog.tsx');
const toolbar = code('editor/PublishToolbar.tsx');

describe('der neue Einstieg ist erreichbar und wirksam', () => {
  it('haengt den Dialog an die Ansicht', () => {
    expect(view).toContain("import { PublishNewDocumentDialog } from './editor/PublishNewDocumentDialog';");
    expect(view).toContain('<PublishNewDocumentDialog');
    expect(view).toContain('onCreate={handleCreateDocument}');
  });

  it('legt wirklich ein neues Dokument an, nicht nur einen Zustand um', () => {
    expect(view).toContain('const next = createPublishProject(spec);');
    expect(view).toContain('publishData: next,');
    expect(view).toContain('setHistory(createPublishHistory(next));');
    // Eine neue Dokumentidentitaet ist der Anlass, die Historie zurueckzusetzen.
    expect(view).toContain('id: `${document.id}#new-${Date.now()}`');
  });

  it('zeigt das Ergebnis als Text, nicht nur als Farbwechsel', () => {
    expect(view).toContain('describePublishCreation(next, spec.title ?? document.title ?? ');
    expect(view).toContain("publishWorkspaceFormat('created', locale, { summary: report.summary })");
  });
});

describe('die Seitenleiste ist erreichbar', () => {
  it('wird von der Ansicht gerendert und von der Toolbar geschaltet', () => {
    expect(view).toContain("import { PublishPagesPanel } from './editor/PublishPagesPanel';");
    expect(view).toContain('{pagesPanelOpen && (');
    expect(view).toContain('<PublishPagesPanel model={model} onUpdateModel={handleUpdateModel} />');
    expect(view).toContain('onTogglePagesPanel={() => setPagesPanelOpen(open => !open)}');
    expect(toolbar).toContain('onTogglePagesPanel');
    expect(toolbar).toContain("aria-label={pagesPanelOpen ? w('hidePages') : w('showPages')}");
  });
});

describe('die Tastatur haengt an der reinen Absicht, nicht an einer zweiten Regel', () => {
  it('fragt `resolvePublishKeyIntent` und fuehrt die Absicht aus', () => {
    expect(view).toContain('resolvePublishKeyIntent({ key: event.key');
    expect(view).toContain("if (intent.kind === 'nudge' && selected && intent.direction)");
    expect(view).toContain('nudgePublishFrame(prev, selected, intent.direction!, intent.coarse === true)');
    expect(view).toContain("if (intent.kind === 'delete-frame' && selected)");
    expect(view).toContain('removePublishFrame(prev, selected)');
    expect(view).toContain("if (intent.kind === 'deselect')");
  });

  it('laesst ein Eingabefeld in Ruhe — sonst waere Tippen unmoeglich', () => {
    expect(view).toContain("target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)");
    expect(view).toContain('editingText');
  });
});

describe('der Canvas baut keine Regeln nach', () => {
  it('schiebt ueber die kanonische Funktion, mit Rasterung', () => {
    expect(canvas).toContain("import { setFrameRect } from '../model/publishDocumentEngine';");
    expect(canvas).toContain('return setFrameRect(prev, drag.frameId,');
  });

  it('schreibt Text ueber die kanonische Funktion', () => {
    expect(canvas).toContain("import { setPublishFrameContent } from '../model/publishFrameOps';");
    expect(canvas).toContain('setPublishFrameContent(prev, frame.id, event.target.value)');
    // Kein contentEditable mehr: `innerText` normalisierte Leerzeichen und Zeilenumbrueche.
    expect(canvas).not.toContain('contentEditable');
  });

  it('prueft ein abgelegtes Bild vor dem Lesen und nennt den Grund', () => {
    expect(canvas).toContain('checkPublishImageDrop(frame, { type: file.type, size: file.size })');
    expect(canvas).toContain('if (!check.accepted) { onRejectImage?.(check); return; }');
    expect(canvas).toContain('presentPublishImage(model, frame)');
  });

  it('kennt Maus, Tastatur und Ablegen', () => {
    for (const wire of ['onPointerDown', 'onPointerMove', 'onPointerUp', 'onDragOver', 'onDrop']) {
      expect(canvas, wire).toContain(wire);
    }
    expect(canvas).toContain('tabIndex={0}');
  });

  it('setzt die Groesse des Bildes aus dem Anpassungsmodus, nicht fest', () => {
    expect(canvas).toContain("frame.fitMode === 'fill' ? 'cover' : frame.fitMode === 'stretch' ? 'fill' : 'contain'");
  });
});

describe('der Inspektor kennt jeden Befehl, den die Ansicht anbietet', () => {
  it('hat genau einen Befehlssatz statt eines langen Props-Riegels', () => {
    expect(inspector).toContain('commands: PublishInspectorCommands;');
    expect(view).toContain('commands={{');
  });

  it('benutzt fuer jede Aenderung einen Befehl, kein direktes Schreiben in das Modell', () => {
    // Kein `frames: prev.frames.map(...)` mehr im Inspektor: Positionen, Groessen und Texte laufen ueber Befehle.
    expect(inspector).not.toContain('frames: prev.frames.map');
    for (const command of ['commands.setFrameRect', 'commands.updateFrame', 'commands.removeFrame', 'commands.setTracking', 'commands.setBaselineGrid', 'commands.assignStyle', 'commands.assignSwatch', 'commands.insertTable', 'commands.updateGeometry', 'commands.setMaster', 'commands.setRotation', 'commands.updateMaster', 'commands.nudgeFrame', 'commands.linkThread', 'commands.unlinkThread', 'commands.appendThreadFrame', 'commands.resolveOverflow', 'commands.addPage']) {
      expect(inspector, command).toContain(command);
    }
  });

  it('macht jeden Preflight-Befund anklickbar', () => {
    expect(inspector).toContain('const navigateToFinding = (issue: PreflightIssue) =>');
    expect(inspector).toContain('onClick={() => navigateToFinding(issue)}');
    expect(inspector).toContain("selectedFrameId: issue.frameId && prev.frames.some(frame => frame.id === issue.frameId)");
  });

  it('die mehrspaltige Typografie ist erreichbar und **gemessen** (AST-1381/1382/1384)', () => {
    // Gemessen vorher las **niemand** `textWrap`, `PublishTypography.keep` oder `hyphenation`; `columns` wurde
    // nur gezeichnet. Jetzt gibt es je einen Befehl — und die angezeigten Zahlen kommen aus denselben Funktionen,
    // die Canvas und Ueberlaufschaetzung benutzen.
    for (const command of ['commands.setTextWrap', 'commands.setColumns', 'commands.setParagraphBreak']) {
      expect(inspector, command).toContain(command);
      expect(view, command).toContain(command.slice('commands.'.length) + ':');
    }
    // Der Befehlssatz fuehrt sie.
    expect(inspectorCommands).toContain('setTextWrap: (frameId: string, mode: PublishTextWrapMode, offsetMm: number) => void;');
    expect(inspectorCommands).toContain('setColumns: (frameId: string, columns: number) => void;');
    expect(inspectorCommands).toContain('setParagraphBreak: (frameId: string, value: PublishParagraphBreak) => void;');
    // Und die Anzeige liest die **gemessenen** Werte, statt sie nachzurechnen.
    expect(inspector).toContain('describePublishTextWrap(model, textFrame.id)');
    expect(inspector).toContain('publishColumnDistribution(textFrame)');
    expect(inspector).toContain('publishParagraphBreakOf(textFrame)');
    // Der Umbruch geht in **dieselbe** Kapazitaetsregel ein — keine zweite Formel.
    expect(inspector).toContain('estimateTextCapacity(textFrame, availableTextAreaMm2(textFrame, textObstacles))');
  });

  it('der Canvas zeichnet den Umbruch und die Spalten, statt sie nur zu behaupten', () => {
    expect(canvas).toContain('publishWrapObstacles(model, frame)');
    expect(canvas).toContain('publishColumnDistribution(frame)');
    expect(canvas).toContain("data-publish-text-wrap={frame.text?.textWrap?.mode ?? 'none'}");
    expect(canvas).toContain('shapeOutside');
  });

  it('der Dialog schirmt die Tastatur wirklich ab (AST-1449)', () => {
    // Gemessen vorher: `aria-modal="true"` stand da, aber **nichts** hielt den Fokus — mit `Tab` wanderte er in
    // die Seite hinter dem Dialog. *Ein Zustand, der behauptet und nicht gilt, ist eine Unwahrheit.*
    expect(dialog).toContain("if (event.key !== 'Tab') return;");
    expect(dialog).toContain("'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex=\"-1\"])'");
    expect(dialog).toContain('last.focus();');
    expect(dialog).toContain('first.focus();');
    expect(dialog).toContain('aria-modal="true"');
    expect(dialog).toContain('ref={dialogRef}');
    // Und der Fokus **kehrt zurueck**, woher er kam.
    expect(dialog).toContain('returnFocusRef.current?.focus();');
  });

  it('die Verschiebung per Tastatur haengt an der reinen Absicht und an einer echten Wirkung (AST-1449)', () => {
    // Der Akzeptanzsatz lautet „nudge selected frame precisely by keyboard". Beides ist geprueft: die Absicht in
    // `publishFrameOps.test.ts`, die Verdrahtung hier — und die Schrittweite ist **eine** Zahl.
    expect(view).toContain('nudgePublishFrame(prev, selected, intent.direction!, intent.coarse === true)');
    expect(view).toContain('editingText');
    // Eine Ablehnung oder ein Ergebnis ist **sichtbar und angekuendigt** — nicht nur farbig.
    expect(view).toContain("role={notice.kind === 'error' ? 'alert' : 'status'}");
  });

  it('der Export liest die **Vorschau**, und die Vorschau zeigt dieselbe Funktion (AST-1441/1442)', () => {
    // Der Kern des Punktes: *wenn die Vorschau etwas anderes zeigt als der Export tut, ist er nicht erfuellt.*
    // Deshalb fragt der Export **dieselbe** Funktion, bevor er Bytes erzeugt.
    expect(view).toContain('const preview = buildPublishExportPreview(model, { target });');
    expect(view).toContain('if (preview.blocking) {');
    expect(view).toContain('const reasons = publishPreviewBlockingReasons(preview);');
    // Und die Sperre nennt ihre Gruende — eine Sperre ohne Grund zwingt zum Raten.
    expect(view).toContain('setExportState({ kind: \'error\', message: reasons[0] ?? ');
    // Das Ausgabeprofil des Exports kommt aus der **Vorschau**, nicht aus einer zweiten Konstante.
    expect(view).toContain('profileId: preview.profileId');
    expect(view).not.toContain("profileId: 'FOGRA51' });");
    // Der Inspektor zeigt **dieselbe** Funktion.
    expect(inspector).toContain('const preview = buildPublishExportPreview(model);');
    expect(inspector).toContain('data-publish-preview-warning={warning.kind}');
    expect(inspector).toContain('data-publish-preview-severity={warning.severity}');
    // **Ohne Farbe unterscheidbar** (`AST-1444`): der Zustand steht als Wort da.
    expect(inspector).toContain("data-publish-preview-state={preview.blocking ? 'blocked' : 'allowed'}");
    expect(inspector).toContain("{warning.severity} · {warning.kind}");
  });

  it('zeigt den Ueberlauf als Zahl, nicht nur als Warnfarbe', () => {
    expect(inspector).toContain('data-publish-overset={lostChars > 0 ? String(lostChars) : \'none\'}');
    expect(inspector).toContain("t('oversetWarning').replace('{count}', String(lostChars))");
  });

  it('zeigt den Seitenzustand und den Threadzustand als Text', () => {
    expect(inspector).toContain('data-publish-thread={threadInfo?.linked ? \'linked\' : \'standalone\'}');
    expect(inspector).toContain("t('threadLinked').replace('{count}', `${threadInfo.position}/${threadInfo.length}`)");
    expect(inspector).toContain("t('threadUnlinked')");
  });

  it('laedt keine Vorgaben selbst nach', () => {
    // Zwei Saetze Vorgaben waeren zwei Wahrheiten: der Inspektor benutzt die Funktionen des Dokumentmodells.
    expect(inspector).toContain('return createDefaultPublishTypography();');
    expect(inspector).toContain('return createDefaultTextOptions();');
  });
});
