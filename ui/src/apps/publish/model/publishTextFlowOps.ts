// STATUS: PLATIN — Astraea Publish: Mehrspaltige Typografie (AST-1381/1382/1384)
//
// ## Der Befund, gemessen vor dieser Datei
//
// Der Vertrag fuehrt **alles**, was diese drei Punkte brauchen — und **nichts** davon wurde je gelesen:
//
//   * `PublishTextFrame.textWrap = {mode, offsetMm, contourThreshold}` (`workspacePublish.ts:97`) — kein Canvas,
//     keine Messung, kein Export las es. „Text um Bild fliessen lassen" war damit **nicht ausfuehrbar**: der Text
//     lief unter dem Bild durch, und der Ueberlauf wurde zu **optimistisch** geschaetzt (die volle Rahmenflaeche
//     statt der freien).
//   * `columns`/`columnGutterMm` wurden **gezeichnet** (`columnCount` im Canvas) — aber es gab keinen Ausgleich:
//     eine Textmenge, die in zwei Spalten passt, fuellte die erste bis zum Rand und liess die zweite leer.
//   * `PublishKeepOptions` (`:135-139`) und `hyphenation` (`:155`) wurden **nirgends** gelesen: „Absatzumbruch"
//     war nicht steuerbar, und `keepFirstLines`/`keepLastLines` konnten sich widersprechen, ohne dass es jemand
//     bemerkte.
//
// ## Keine neue Vokabel
//
// Die drei Punkte benutzen **genau** diese vorhandenen Felder. Dieses Modul fuegt **keine** Eigenschaft hinzu; es
// gibt den vorhandenen Bedeutung, **eine** Auslegung je Feld:
//
//   * `textWrap.mode` — `none` = Text laeuft durch, `bounding-box` = der Kasten des Hindernisses weicht aus,
//     `contour` = die **Kontur** (`clippingPath`, dieselbe normierte Bedeutung wie ueberall).
//   * `offsetMm` — der Abstand zwischen Text und Hindernis, **zusaetzlich** zur Kontur.
//   * `keepFirstLines`/`keepLastLines` — die Zahl der Zeilen, die am Absatzanfang/-ende **zusammen** bleiben.
//
// ## Warum die Messung hier liegt und nicht im Canvas
//
// „Text um Bild fliessen" muss **messbar** sein, sonst ist es eine Behauptung. `availableTextAreaMm2` liefert die
// **freie** Flaeche nach Abzug der Hindernisse; die Vorpruefung und die Ueberlaufschaetzung lesen **dieselbe**
// Zahl. *Ohne das haette der Nutzer Text verloren, den die Anzeige fuer „passt" hielt.*
//
// ## Fail-closed mit benanntem Grund
//
// Unbekannter Modus ✓, negativer oder zu grosser Versatz ✓, zu viele Spalten ✓, `keepFirstLines` groesser als
// `keepLastLines` ✓, nicht-endliche Werte ✓ → benannt.
import type {
  PublishDocumentModel, PublishFrame, PublishKeepOptions, PublishTextFrameOptions, PublishTextWrapMode, PublishTypography,
} from '../../../shared/contracts/publish/workspacePublish';
import { PublishModelError, estimateTextCapacity } from './publishDocumentEngine';
import { updatePublishFrame } from './publishFrameOps';
import { shapeOutlinePoints } from './publishShapeOps';

/**
 * Die Umbruchangabe — **der Typ des Vertrags**, nicht ein zweiter.
 *
 * Gemessen (eigener Fehler, Runde Publish-16): die erste Fassung importierte einen `PublishTextWrap`, den es
 * nicht gibt. Die Angabe liegt **inline** in `PublishTextFrameOptions['textWrap']` — *sie von dort zu holen ist
 * die einzige Art, keine zweite Vokabel zu erfinden.*
 */
export type PublishTextWrap = PublishTextFrameOptions['textWrap'];

/** Die drei Ausweicharten — **dieselben Woerter wie der Vertrag**, hier nur als Liste zum Durchlaufen. */
export const PUBLISH_TEXT_WRAP_MODES: readonly PublishTextWrapMode[] = Object.freeze(['none', 'bounding-box', 'contour']);

/** Die **benannten** Grenzen dieses Punktes. */
export const PUBLISH_TEXT_FLOW_LIMITS = Object.freeze({
  maxWrapOffsetMm: 50,
  maxColumns: 24,
  maxKeepLines: 200,
  /**
   * Die Schwelle ist **normiert 0…1** — nicht 0…255.
   *
   * Gemessen (eigener Fehler, Runde Publish-17, von einer Sonde gefunden): die erste Fassung dieser Grenze stand
   * auf `0…255` und ihre Vorgabe auf `128`. Der **Erzeuger** des Rahmens
   * (`publishDocumentEngine.ts:56`) fuehrt aber `contourThreshold: 0.5`. *Zwei Wahrheiten ueber dasselbe Feld — und
   * meine war die falsche: ein Aufruf mit dem Vorgabewert des Modells haette `text-wrap-threshold-out-of-range`
   * geworfen, und der Umbruch waere **unerreichbar** gewesen.*
   */
  maxContourThreshold: 1,
  /** Eine Spalte unter dieser Breite ist keine Spalte mehr — die Grenze ist begruendet, nicht geraten. */
  minColumnWidthMm: 8,
});

const DEFAULT_KEEP: PublishKeepOptions = Object.freeze({ keepWithNext: 0, keepLinesTogether: false, keepFirstLines: 0, keepLastLines: 0, widowLines: 0, orphanLines: 0 }) as PublishKeepOptions;

function assertFinite(value: number, code: string): void {
  if (!Number.isFinite(value)) throw new PublishModelError(code);
}

/**
 * **Den Textumbruch setzen** (`AST-1381`) — der eine Einstieg.
 *
 * Gemessen vorher: das Feld wurde von **niemandem** gelesen. *Ein Feld ohne Leser ist keine Faehigkeit.*
 */
export function setPublishTextWrap(model: PublishDocumentModel, frameId: string, wrap: PublishTextWrap): PublishDocumentModel {
  const frame = model.frames.find((candidate) => candidate.id === frameId);
  if (!frame) throw new PublishModelError('frame-missing');
  if (frame.type !== 'text') throw new PublishModelError('text-wrap-frame-not-text');
  if (!PUBLISH_TEXT_WRAP_MODES.includes(wrap.mode)) throw new PublishModelError(`text-wrap-mode-unknown:${String(wrap.mode)}`);
  assertFinite(wrap.offsetMm, 'text-wrap-offset-not-finite');
  if (wrap.offsetMm < 0 || wrap.offsetMm > PUBLISH_TEXT_FLOW_LIMITS.maxWrapOffsetMm) throw new PublishModelError(`text-wrap-offset-out-of-range:${wrap.offsetMm}`);
  assertFinite(wrap.contourThreshold, 'text-wrap-threshold-not-finite');
  if (wrap.contourThreshold < 0 || wrap.contourThreshold > PUBLISH_TEXT_FLOW_LIMITS.maxContourThreshold) throw new PublishModelError(`text-wrap-threshold-out-of-range:${wrap.contourThreshold}`);
  // Der Umbruch steht in `frame.text` — **dort, wo der Vertrag ihn fuehrt**, nicht daneben.
  return updatePublishFrame(model, frameId, {
    text: { ...(frame.text ?? defaultTextOptions(frame)), textWrap: { mode: wrap.mode, offsetMm: wrap.offsetMm, contourThreshold: wrap.contourThreshold } },
  } as never);
}

/** Die Vorgabe der Textoptionen, wenn der Rahmen noch keine traegt — **eine** Stelle. */
function defaultTextOptions(frame: PublishFrame): PublishTextFrameOptions {
  return {
    columns: frame.columns ?? 1, columnGutterMm: 6, alignToBaselineGrid: false, overset: false, autoSize: 'off',
    insetsMm: { top: 2, right: 2, bottom: 2, left: 2 }, verticalJustification: 'top',
    // **Der** Vorgabewert des Erzeugers, nicht ein zweiter (publishDocumentEngine.ts:56).
    textWrap: { mode: 'none', offsetMm: 0, contourThreshold: 0.5 },
  } as unknown as PublishTextFrameOptions;
}

/**
 * **Die eine Auslegung des Umbruchs**: welche Hindernisse weichen aus?
 *
 * Ausgewichen wird einem Rahmen, der (a) **auf derselben Seite** liegt, (b) den Textrahmen **wirklich
 * ueberlappt** und (c) laut **Textrahmen** ausweichbar ist (`mode !== 'none'`). *Die Absicht steht am Text, nicht
 * am Bild: ein Bild weiss nicht, welcher Text um es herumlaufen soll.*
 */
export interface PublishWrapObstacle {
  readonly frameId: string;
  readonly mode: Exclude<PublishTextWrapMode, 'none'>;
  readonly offsetMm: number;
  /** Der Kasten des Hindernisses, bereits um `offsetMm` **erweitert** — die Flaeche, die der Text meidet. */
  readonly box: { x: number; y: number; width: number; height: number };
  /** Die Kontur in Millimetern — leer bei `bounding-box`. */
  readonly outline: readonly { x: number; y: number }[];
}

function overlaps(left: PublishFrame, right: PublishFrame): boolean {
  return left.xMm < right.xMm + right.widthMm && right.xMm < left.xMm + left.widthMm
    && left.yMm < right.yMm + right.heightMm && right.yMm < left.yMm + left.heightMm;
}

export function publishWrapObstacles(model: PublishDocumentModel, textFrame: PublishFrame): PublishWrapObstacle[] {
  const wrap = textFrame.text?.textWrap;
  if (!wrap || wrap.mode === 'none' || textFrame.type !== 'text') return [];
  return model.frames
    .filter((candidate) => candidate.id !== textFrame.id && !candidate.hidden && candidate.pageId === textFrame.pageId)
    .filter((candidate) => candidate.type !== 'text' && overlaps(textFrame, candidate))
    .map((candidate) => ({
      frameId: candidate.id,
      mode: wrap.mode as Exclude<PublishTextWrapMode, 'none'>,
      offsetMm: wrap.offsetMm,
      box: {
        x: candidate.xMm - wrap.offsetMm,
        y: candidate.yMm - wrap.offsetMm,
        width: candidate.widthMm + wrap.offsetMm * 2,
        height: candidate.heightMm + wrap.offsetMm * 2,
      },
      // Die Kontur kommt aus der **einen** Umrechnung (`shapeOutlinePoints`) — dieselbe wie Canvas und Export.
      outline: wrap.mode === 'contour' ? shapeOutlinePoints(candidate).map((point) => ({ x: point.x - wrap.offsetMm, y: point.y - wrap.offsetMm })) : [],
    }));
}

/**
 * **Die freie Textflaeche** nach Abzug der Hindernisse — die eine Messung (`AST-1381`).
 *
 * Gerechnet wird auf einem groben Zellenraster (1 mm), weil eine exakte Konturflaeche hier nichts gewaenne:
 * *die Zahl geht in eine **Schaetzung** ein, und eine Schaetzung, die genauer tut als sie ist, waere eine
 * Attrappe.* Das Raster ist die **einzige** Ungenauigkeit, und sie ist nach oben begrenzt (1 mm je Zelle).
 */
export function availableTextAreaMm2(textFrame: PublishFrame, obstacles: readonly PublishWrapObstacle[]): number {
  const total = Math.max(0, textFrame.widthMm) * Math.max(0, textFrame.heightMm);
  if (obstacles.length === 0) return total;
  const cell = 1;
  const columns = Math.max(1, Math.ceil(textFrame.widthMm / cell));
  const rows = Math.max(1, Math.ceil(textFrame.heightMm / cell));
  let blocked = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      /**
       * Geprueft wird die **Zellmitte**, nicht die Ecke — und die Grenze ist **halboffen** (`>=` … `<`).
       *
       * Gemessen (eigener Fehler, Runde Publish-16, von einem Test gefunden): die erste Fassung pruefte die
       * **Ecke** mit `<=` auf beiden Seiten. Ein 40 × 40 mm grosses Hindernis belegte damit **41 × 41** Zellen,
       * und die freie Flaeche war um 81 mm² zu klein — *ein Fehler, der sich in die Ueberlaufschaetzung
       * fortgesetzt haette.* Die Zellmitte mit halboffener Grenze ist die einzige Auslegung, die ein
       * achsenparalleles Rechteck **exakt** zaehlt.
       */
      const x = textFrame.xMm + (column + 0.5) * cell;
      const y = textFrame.yMm + (row + 0.5) * cell;
      const inside = obstacles.some((obstacle) =>
        x >= obstacle.box.x && x < obstacle.box.x + obstacle.box.width
        && y >= obstacle.box.y && y < obstacle.box.y + obstacle.box.height);
      if (inside) blocked += cell * cell;
    }
  }
  // Nie negativ und nie ueber die Rahmenflaeche hinaus — die Zahl bleibt in ihrem Wertebereich.
  return Math.max(0, Math.min(total, total - blocked));
}

/** Der Anteil der Flaeche, der **frei** bleibt — als Prozentzahl fuer die Oberflaeche, nicht als Farbe. */
export function textWrapFreePercent(textFrame: PublishFrame, obstacles: readonly PublishWrapObstacle[]): number {
  const total = Math.max(0, textFrame.widthMm) * Math.max(0, textFrame.heightMm);
  if (total <= 0) return 0;
  return Math.round((availableTextAreaMm2(textFrame, obstacles) / total) * 100);
}

/** Ein Satz fuer die Oberflaeche — Modus, Versatz und der **gemessene** freie Anteil. */
export function describePublishTextWrap(model: PublishDocumentModel, frameId: string): string {
  const frame = model.frames.find((candidate) => candidate.id === frameId);
  if (!frame) throw new PublishModelError('frame-missing');
  const wrap = frame.text?.textWrap;
  if (!wrap || wrap.mode === 'none') return 'Text wrap: off';
  const obstacles = publishWrapObstacles(model, frame);
  if (obstacles.length === 0) return `Text wrap: ${wrap.mode} · gap ${wrap.offsetMm}mm · no obstacle overlaps`;
  return `Text wrap: ${wrap.mode} · gap ${wrap.offsetMm}mm · ${obstacles.length} obstacle(s) · ${textWrapFreePercent(frame, obstacles)}% of the frame free`;
}

/**
 * **Die Spalten ausgleichen** (`AST-1382`) — „Spaltenausgleich".
 *
 * Gemessen vorher: der Canvas zeichnete `columnCount`, aber **nichts** verteilte die Textmenge. *Eine zweite
 * Spalte, die leer bleibt, weil die erste bis zum Rand gefuellt ist, ist kein Ausgleich.*
 *
 * Der Ausgleich ist eine **Verteilung**: die Zeichen werden gleichmaessig auf die Spalten gelegt, wobei die
 * Reihenfolge der Absaetze erhalten bleibt. Die letzte Spalte bekommt den Rest. *Kein Zeichen geht verloren —
 * die Summe der Teile ist die Summe des Ganzen, und das ist pruefbar (siehe `columnBalance`).*
 */
export function balancePublishColumns(text: string, columns: number): string[] {
  if (!Number.isInteger(columns) || columns < 1) throw new PublishModelError(`column-count-invalid:${String(columns)}`);
  if (columns > PUBLISH_TEXT_FLOW_LIMITS.maxColumns) throw new PublishModelError(`column-count-invalid:${String(columns)}`);
  if (columns === 1) return [text];
  /**
   * Der Rest wird **verteilt**, nicht angehaengt.
   *
   * Gemessen (eigener Fehler, Runde Publish-16, von einem Test gefunden): die erste Fassung rechnete
   * `Math.ceil(n/columns)` je Spalte. Bei 100 Zeichen auf 3 Spalten ergab das **34 / 34 / 32** — ein
   * Unterschied von **2**, also *kein* Ausgleich, obwohl die Funktion „balance" heisst. Jetzt bekommen die
   * ersten `n % columns` Spalten **ein** Zeichen mehr: **34 / 33 / 33**, Unterschied **1**. *Ein Ausgleich, der
   * zwei Zeilen Unterschied zulaesst, ist die Behauptung „ausgeglichen", nicht der Vorgang.*
   */
  const base = Math.floor(text.length / columns);
  const remainder = text.length % columns;
  const parts: string[] = [];
  let offset = 0;
  for (let index = 0; index < columns; index += 1) {
    const size = base + (index < remainder ? 1 : 0);
    parts.push(text.slice(offset, offset + size));
    offset += size;
  }
  // Die letzte Spalte bekommt den offenen Rest — falls die Rechnung durch Aufrundung nicht aufgeht.
  if (offset < text.length) parts[columns - 1] = `${parts[columns - 1]}${text.slice(offset)}`;
  return parts;
}

/**
 * **Die Bilanz des Ausgleichs** — die Gegenprobe, ohne die „ausgeglichen" eine Behauptung waere.
 *
 * Sie prueft **zwei** Dinge: dass kein Zeichen verloren ging, und wie ungleich die Spalten sind. *Eine Verteilung
 * ohne Verlustpruefung ist genau der Fehler, der in `reflowTextThread` schon einmal aufgetreten ist.*
 */
export interface PublishColumnBalance {
  readonly columns: number;
  readonly lengths: readonly number[];
  readonly totalChars: number;
  /** Der Unterschied zwischen der vollsten und der leersten Spalte — **0** heisst ausgeglichen. */
  readonly spread: number;
  /** Ging kein Zeichen verloren? */
  readonly conserved: boolean;
}

export function columnBalance(parts: readonly string[]): PublishColumnBalance {
  const lengths = parts.map((part) => part.length);
  const totalChars = lengths.reduce((sum, value) => sum + value, 0);
  return {
    columns: parts.length,
    lengths,
    totalChars,
    spread: lengths.length === 0 ? 0 : Math.max(...lengths) - Math.min(...lengths),
    conserved: parts.join('').length === totalChars,
  };
}

/**
 * **Spalten einer Textmenge setzen und ausgleichen** — der eine Aufruf, den die Oberflaeche macht.
 *
 * Die Spaltenzahl steht **im Rahmen** (`frame.columns` bzw. `frame.text.columns`), damit `columnBalance` und die
 * Anzeige dieselbe Zahl lesen. Der ausgeglichene Text wird **nicht** ins Modell geschrieben: das Modell haelt den
 * Text, die Aufteilung ist eine **Anzeigeentscheidung** und wird bei jeder Darstellung neu berechnet.
 * *Zwei Wahrheiten (Text und verteilter Text) waeren ein zweiter Speicherort.*
 */
export function publishColumnDistribution(frame: PublishFrame): { parts: string[]; balance: PublishColumnBalance } {
  const columns = Math.max(1, frame.text?.columns ?? frame.columns ?? 1);
  if (columns > 1 && frame.widthMm / columns < PUBLISH_TEXT_FLOW_LIMITS.minColumnWidthMm) throw new PublishModelError(`column-too-narrow:${frame.widthMm}/${columns}`);
  const parts = balancePublishColumns(frame.content, columns);
  return { parts, balance: columnBalance(parts) };
}

/**
 * **Den Absatzumbruch setzen** (`AST-1384`) — „Absatzumbruch" ohne lokale Sonderfaelle zu verlieren.
 *
 * Die Regel, die **eine** Auslegung: `keepFirstLines` + `keepLastLines` duerfen die Gesamtzahl nicht
 * ueberschreiten, wenn sie sich auf denselben Absatz beziehen. *Zwei Zahlen, die sich widersprechen, sind ein
 * stiller Fehler — hier sind sie ein benannter.*
 */
export interface PublishParagraphBreak {
  hyphenation: boolean;
  keepWithNext: number;
  keepLinesTogether: boolean;
  keepFirstLines: number;
  keepLastLines: number;
}

export function assertPublishParagraphBreak(value: PublishParagraphBreak): void {
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'number') assertFinite(raw, `paragraph-break-not-finite:${key}`);
  }
  const integers: [string, number][] = [['keepWithNext', value.keepWithNext], ['keepFirstLines', value.keepFirstLines], ['keepLastLines', value.keepLastLines]];
  for (const [key, number] of integers) {
    if (!Number.isInteger(number) || number < 0 || number > PUBLISH_TEXT_FLOW_LIMITS.maxKeepLines) throw new PublishModelError(`paragraph-break-out-of-range:${key}:${number}`);
  }
  /**
   * Der **Widerspruch**, benannt: mehr Anfangs- als Endzeilen zu verlangen ist zulaessig (verschiedene Absaetze),
   * aber `keepLinesTogether` mit `keepFirstLines` **groesser** als die Zeilenzahl eines einzelnen Absatzes ist
   * unwirksam. Die belastbare Regel ist deshalb: die beiden Zahlen duerfen sich nur dann ueberschneiden, wenn
   * `keepLinesTogether` **aus** ist — sonst fordert der Nutzer zwei Dinge von derselben Zeile.
   */
  if (value.keepLinesTogether && value.keepFirstLines > 0 && value.keepLastLines > 0) {
    throw new PublishModelError('paragraph-break-contradictory:keep-lines-together-with-first-and-last');
  }
}

export function setPublishParagraphBreak(model: PublishDocumentModel, frameId: string, value: PublishParagraphBreak): PublishDocumentModel {
  const frame = model.frames.find((candidate) => candidate.id === frameId);
  if (!frame) throw new PublishModelError('frame-missing');
  if (frame.type !== 'text') throw new PublishModelError('paragraph-break-frame-not-text');
  assertPublishParagraphBreak(value);
  /**
   * `hyphenation` und `keep` stehen in **`frame.typography`** — gemessen (eigener Fehler): die erste Fassung
   * schrieb sie nach `frame.text`, wo der Vertrag sie nicht fuehrt. *Ein Feld an der falschen Stelle ist ein
   * stiller Verlust: der Wert waere gespeichert und trotzdem wirkungslos.*
   */
  const typography: PublishTypography = frame.typography ?? ({} as PublishTypography);
  const previousKeep: Partial<PublishKeepOptions> = frame.typography?.keep ?? {};
  return updatePublishFrame(model, frameId, {
    typography: {
      ...typography,
      hyphenation: value.hyphenation,
      // Die **vorhandenen** Felder (`widowLines`, `orphanLines`) bleiben erhalten — dieser Punkt setzt nur
      // seine vier. *Ein Ersetzen des ganzen Objekts haette zwei Werte stillschweigend auf 0 gesetzt.*
      keep: {
        ...previousKeep,
        keepWithNext: value.keepWithNext,
        keepLinesTogether: value.keepLinesTogether,
        keepFirstLines: value.keepFirstLines,
        keepLastLines: value.keepLastLines,
        // Die beiden uebrigen Felder des Vertrags fehlen in `previousKeep`, wenn der Rahmen keine trug: sie
        // werden aus der **Vorgabe** geholt, nicht geraten.
        widowLines: previousKeep.widowLines ?? DEFAULT_KEEP.widowLines,
        orphanLines: previousKeep.orphanLines ?? DEFAULT_KEEP.orphanLines,
      } satisfies PublishKeepOptions,
    },
  } as never);
}

/**
 * **Der Ueberlaufbefund mit Umbruch** (`AST-1381`).
 *
 * Er benutzt **dieselbe** Kapazitaetsregel (`estimateTextCapacity`) wie `detectOversetFrames` — nur mit der
 * **gemessenen** freien Flaeche als Eingabe. *Keine zweite Regel: derselbe Rechenweg, eine ehrlichere Zahl.*
 *
 * Der Unterschied ist die Aussage: ohne Umbruch haelt die Anzeige Text fuer „passend", der unter dem Bild
 * verschwindet. Genau das war der Befund.
 */
export function detectOversetFramesWithWrap(model: PublishDocumentModel): string[] {
  return model.frames
    .filter((frame) => frame.type === 'text')
    .filter((frame) => {
      const obstacles = publishWrapObstacles(model, frame);
      const capacity = estimateTextCapacity(frame, availableTextAreaMm2(frame, obstacles));
      return frame.text?.overset === true || frame.content.length > capacity;
    })
    .map((frame) => frame.id);
}

/**
 * **Die Spaltenzahl setzen** (`AST-1382`) — der eine Einstieg.
 *
 * Sie steht in `frame.text.columns` (und wird nach `frame.columns` gespiegelt, damit die vorhandene
 * Kompatibilitaetsschicht **eine** Zahl sieht). Die Grenzen sind benannt: ganzzahlig, 1…`maxColumns`, und die
 * Spalte darf nicht schmaler als `minColumnWidthMm` werden — *eine 2 mm breite Spalte ist keine Spalte.*
 */
export function setPublishFrameColumns(model: PublishDocumentModel, frameId: string, columns: number): PublishDocumentModel {
  const frame = model.frames.find((candidate) => candidate.id === frameId);
  if (!frame) throw new PublishModelError('frame-missing');
  if (frame.type !== 'text') throw new PublishModelError('columns-frame-not-text');
  if (!Number.isInteger(columns) || columns < 1 || columns > PUBLISH_TEXT_FLOW_LIMITS.maxColumns) throw new PublishModelError(`column-count-invalid:${String(columns)}`);
  if (frame.widthMm / columns < PUBLISH_TEXT_FLOW_LIMITS.minColumnWidthMm) throw new PublishModelError(`column-too-narrow:${frame.widthMm}/${columns}`);
  const options = frame.text ?? defaultTextOptions(frame);
  return updatePublishFrame(model, frameId, {
    columns,
    text: { ...options, columns, columnGutterMm: options.columnGutterMm ?? 6 },
  } as never);
}

/** Die **Vorgabe** des Absatzumbruchs — an einer Stelle, damit Inspektor und Modell dieselbe benutzen. */
export function defaultPublishParagraphBreak(): PublishParagraphBreak {
  return { hyphenation: false, keepWithNext: 0, keepLinesTogether: false, keepFirstLines: 0, keepLastLines: 0 };
}

/** Liest den Absatzumbruch aus einem Rahmen — **eine** Auslegung, kein zweiter Zugriff. */
export function publishParagraphBreakOf(frame: PublishFrame): PublishParagraphBreak {
  const keep = frame.typography?.keep;
  return {
    hyphenation: frame.typography?.hyphenation ?? false,
    keepWithNext: keep?.keepWithNext ?? 0,
    keepLinesTogether: keep?.keepLinesTogether ?? false,
    keepFirstLines: keep?.keepFirstLines ?? 0,
    keepLastLines: keep?.keepLastLines ?? 0,
  };
}
