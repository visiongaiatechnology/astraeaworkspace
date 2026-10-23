// STATUS: PLATIN — Astraea Publish: die Bedienbefehle der sichtbaren Publish-Flaeche an einer Stelle
//
// Grund (gemessen, Runde Publish-9): Der Inspektor brauchte fuer jede Funktion einen eigenen Rueckruf. Das
// waren am Ende 17 Props, die PublishView durchreichen musste — und jede davon war eine Gelegenheit, einen
// Befehl zu vergessen. Statt eines langen Props-Riegels gibt es **einen** Vertrag. Er beschreibt die
// Befehle, die die Flaeche kennt; die Regeln selbst stehen im Dokumentmodell.
import type { PublishPageGeometry, PublishStyleKind, PublishSwatch, PublishTextWrapMode } from '../../../shared/contracts/publish/workspacePublish';
import type { PublishPageRotation } from '../model/publishPageRotation';
import type { PublishFramePatch, PublishNudgeDirection } from '../model/publishFrameOps';
import type { PublishShapeKind } from '../model/publishShapeOps';
import type { PublishParagraphBreak } from '../model/publishTextFlowOps';

export interface PublishFrameRectPatch {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotationDeg?: number;
}

/** Der Vertrag einer neuen Form — **der** Typ, den `insertPublishShape` nimmt. */
export interface PublishShapeRequest {
  kind: PublishShapeKind;
  strokeColor?: string;
  strokeWidthPt?: number;
  opacity?: number;
}

export interface PublishInspectorCommands {
  nudgeFrame: (frameId: string, direction: PublishNudgeDirection, coarse: boolean) => void;
  setFrameRect: (frameId: string, rect: PublishFrameRectPatch) => void;
  setFrameContent: (frameId: string, content: string) => void;
  updateFrame: (frameId: string, patch: PublishFramePatch) => void;
  removeFrame: (frameId: string) => void;
  setMaster: (pageId: string, masterPageId: string | null) => void;
  setRotation: (pageId: string, rotation: PublishPageRotation) => void;
  updateMaster: (masterId: string, patch: { name?: string; headerText?: string; footerText?: string; showPageNumbers?: boolean }) => void;
  linkThread: (fromFrameId: string, toFrameId: string) => void;
  unlinkThread: (frameId: string) => void;
  appendThreadFrame: (frameId: string) => void;
  resolveOverflow: (frameId: string, startFrameId?: string) => void;
  assignStyle: (frameId: string, styleId: string) => void;
  /**
   * **Einen Stil anlegen** (`AST-1386`) — vorher gab es nur Zuweisen, nicht Erzeugen: in einem leeren Dokument
   * stand die Stilliste deshalb **immer** leer.
   */
  createStyle: (name: string, kind: PublishStyleKind, fontSizePt?: number) => void;
  setBaselineGrid: (frameId: string, align: boolean) => void;
  setTracking: (frameId: string, tracking: number) => void;
  assignSwatch: (frameId: string, swatchId: string, role: 'fill' | 'stroke') => void;
  /**
   * **Ein Farbfeld anlegen** (`AST-1396`) — vorher waren nur die zwei Beispielwerte sichtbar, also in einem leeren
   * Dokument **gar keines**.
   */
  createSwatch: (spec: { name: string; space: PublishSwatch['space']; components: readonly number[]; spotName?: string }) => void;
  /** **Eine Form einfuegen** (`AST-1406`) — der Einstieg, den vorher nur die Toolbar hatte. */
  addShape: (request: PublishShapeRequest) => void;
  /** **Die Vorpruefungsvorgabe festhalten** (`AST-1403`) — vorher wurde immer mit der Vorgabe geprueft. */
  setPreflightProfile: (profileId: string) => void;
  /** **Textumbruch** (`AST-1381`) — vorher las das Feld `textWrap` niemand. */
  setTextWrap: (frameId: string, mode: PublishTextWrapMode, offsetMm: number) => void;
  /** **Spaltenzahl** (`AST-1382`) — die Zahl, nach der der Ausgleich rechnet. */
  setColumns: (frameId: string, columns: number) => void;
  /** **Absatzumbruch** (`AST-1384`) — Hyphenisierung und die vier Keep-Werte. */
  setParagraphBreak: (frameId: string, value: PublishParagraphBreak) => void;
  insertTable: (frameId: string, name: string, rows: number, columns: number) => void;
  updateGeometry: (patch: Partial<PublishPageGeometry>) => void;
  addPage: () => void;
}
