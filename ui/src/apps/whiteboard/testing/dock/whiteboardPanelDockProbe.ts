// STATUS: DIAMANT VGT SUPREME
//
// Ergänzung 7 §4 — „Whiteboard hat keine überlappenden oder unzugänglichen Werkzeugleisten."
//
// ## Was dieser Test entscheidet — und was nicht
//
// **Es gibt kein jsdom in dieser Umgebung** (kein `jsdom` / `happy-dom` / `@testing-library` in einer
// `package.json`, `ui/vite.config.ts` setzt nur `testTimeout`). Gerendert wird mit
// `renderToStaticMarkup` — eine Zeichenkette ohne Kastenmodell. **Echte Überlappung ist hier nicht
// messbar.** Was messbar ist, steht hier:
//
// 1. **Der Anker-/z-Vertrag, aus den Quelldateien gelesen.** Jede Panel-Wurzel trägt
//    `data-whiteboard-dock="<id>"`; ihre Klassen nennen Anker (`top-20` / `bottom-6`) und z-Zahl
//    (`z-30` … `z-50`). Der Test liest beides mit `fs.readFileSync` und vergleicht es mit dem
//    Dock-Vertrag. Zwei Panels mit demselben Anker **und** derselben z-Zahl sind ein Verstoss — genau
//    die zwei Paare, die vor der Reparatur von der JSX-Reihenfolge entschieden wurden, werden als
//    Regressionsfall nachgestellt.
// 2. **Der Erreichbarkeits-Vertrag der Sichtsteuerung, geometrisch.** Die Unterkante der Objektliste
//    liegt über der Oberkante der Sichtsteuerung; die Erreichbarkeit folgt daraus rechnerisch.
// 3. **Die Ableitung des Panel-Ankers aus der echten Toolbarhöhe** — `--wb-dock-top` gegen
//    `inset-block-start` + die Höhenbindung der Wurzelschicht.
//
// **Dieser Test ist eine Falsifikationsmaschine, kein Beweis.** Er sieht keine gerenderte Höhe, keine
// `line-height`, keinen Umbruch, keine Kaskade und kein `z-index`-Stapeln. Er fängt Verstösse — er
// beweist **keine** Überlappungsfreiheit. Das verlangte `document.elementFromPoint` in der Mitte jedes
// Bedienelements bei **vereinbarten** Viewports; die Anforderung nennt keinen.
//
// Jede Zusicherung ist mutationsgeprüft: ein absichtlich verstossender Wert macht sie rot.

import type { WhiteboardDockRegion } from '../../state/whiteboardPanelDock';

/** Anchor and z-index a panel root declares in its class list. */
export interface DockDeclaration {
  readonly id: string;
  /** `top-20` / `bottom-6` — the vertical anchor the dock area owns. */
  readonly vertical: string;
  /** `right-5` / `left-4` / `right-6` — the horizontal offset the panel owns. */
  readonly horizontal: string;
  readonly z: number;
}

/** A panel, as the contract sees it: declared anchor, declared z-index, assigned dock area. */
export interface DockContractPanel {
  readonly id: string;
  readonly vertical: string;
  readonly horizontal: string;
  readonly z: number;
  readonly region: WhiteboardDockRegion;
}

/** Two panels that would paint into the same declared position. */
export interface DockCollision {
  readonly a: string;
  readonly b: string;
  readonly vertical: string;
  readonly horizontal: string;
  readonly z: number;
  readonly sameRegion: boolean;
}

/**
 * Violations of „gleicher Anker ⇒ ungleiches z (oder andere Position), nie beides gleich".
 *
 * A collision is: **same vertical anchor, same horizontal offset and same z-index** — the two
 * rectangles start at the same declared corner and neither is lifted above the other. Reporting is
 * deliberately **not** restricted to one dock area, so a panel left outside the table stays visible;
 * the `sameRegion` field tells the cases apart. `sameAreaOnly` narrows the sweep to the pairs the area
 * exclusion is responsible for.
 */
export function findDockCollisions(
  panels: readonly DockContractPanel[],
  options: { readonly sameAreaOnly?: boolean } = {},
): readonly DockCollision[] {
  const collisions: DockCollision[] = [];
  for (let i = 0; i < panels.length; i += 1) {
    for (let j = i + 1; j < panels.length; j += 1) {
      const a = panels[i];
      const b = panels[j];
      if (a.vertical !== b.vertical || a.horizontal !== b.horizontal || a.z !== b.z) continue;
      const sameRegion = a.region === b.region;
      if (options.sameAreaOnly && !sameRegion) continue;
      collisions.push({
        a: a.id,
        b: b.id,
        vertical: a.vertical,
        horizontal: a.horizontal,
        z: a.z,
        sameRegion,
      });
    }
  }
  return collisions;
}

/** What the test reads out of one panel source file. */
export interface PanelSourceReading {
  readonly tag: string;
  readonly className: string;
  readonly id: string;
}

/** The opening tag that carries `data-whiteboard-dock`, from its first `<` to its closing bracket. */
export function readDockPanelTag(source: string): PanelSourceReading {
  const marker = source.indexOf('data-whiteboard-dock="');
  if (marker < 0) throw new Error('no docked root in this source');
  const start = source.lastIndexOf('<', marker);
  if (start < 0) throw new Error('no opening tag before the dock marker');
  const closeAngle = source.indexOf('>', marker);
  if (closeAngle < 0) throw new Error('unterminated opening tag');
  const tag = source.slice(start, closeAngle + 1);
  const id = /data-whiteboard-dock="([^"]+)"/.exec(tag)?.[1];
  if (!id) throw new Error('dock marker without a value');
  const className = /className="([^"]*)"/.exec(tag)?.[1];
  if (className === undefined) throw new Error(`dock root ${id} has no static className`);
  return { tag, className, id };
}

/** `top-20` / `bottom-6` — the vertical anchor utility of a class list. */
export function parseAnchor(className: string): string {
  const anchor = /(?:^|\s)((?:top|bottom)-[0-9a-z./[\]]+)(?:\s|$)/.exec(` ${className} `)?.[1];
  if (!anchor) throw new Error(`no vertical anchor utility in: ${className}`);
  return anchor;
}

/** `right-6` / `left-4` — the horizontal offset utility of a class list. */
export function parseHorizontal(className: string): string {
  const horizontal = /(?:^|\s)((?:left|right)-[0-9]+)(?:\s|$)/.exec(` ${className} `)?.[1];
  if (!horizontal) throw new Error(`no horizontal offset utility in: ${className}`);
  return horizontal;
}

/** The whole declaration of one docked root: vertical anchor, horizontal offset, z-index. */
export function parseDeclaration(tag: string, className: string, id: string): DockDeclaration {
  return { id, vertical: parseAnchor(className), horizontal: parseHorizontal(className), z: parseZ(tag, className) };
}

/**
 * The declared z-index. The panels keep their `z-*` utility (the dock area states the same number in
 * `whiteboardDock.css`); an inline `--wb-dock-z` would win and is read first, so a panel that switches
 * to the variable form stays readable.
 */
export function parseZ(tag: string, className: string): number {
  const variable = /--wb-dock-z:\s*([0-9]+)/.exec(tag)?.[1];
  if (variable) return Number(variable);
  const utility = /(?:^|\s)z-([0-9]+)(?:\s|$)/.exec(` ${className} `)?.[1];
  if (utility) return Number(utility);
  throw new Error('no z-index declared on the docked root');
}

/** The `px` value of a custom property, read from the stylesheet that declares it. */
export function parseCssPx(source: string, property: string): number {
  const value = new RegExp(`${property}\\s*:\\s*([0-9]+)px`).exec(source)?.[1];
  if (value === undefined) throw new Error(`no px value for ${property}`);
  return Number(value);
}

/** The `rem` value of a custom property, converted to px at the CSS default of 16 px. */
export function parseCssRem(source: string, property: string): number {
  const value = new RegExp(`${property}\\s*:\\s*([0-9.]+)rem`).exec(source)?.[1];
  if (value === undefined) throw new Error(`no rem value for ${property}`);
  return Number(value) * 16;
}
