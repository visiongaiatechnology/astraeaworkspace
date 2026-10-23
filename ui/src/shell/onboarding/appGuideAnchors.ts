import type { OpenCoreAppKind } from '../../edition/contracts';
import type { AppGuideTarget } from './AppGuidePanel';

export interface AppGuideAnchorStep {
  readonly app: OpenCoreAppKind;
  readonly id: string;
}

const APP_ANCHORS: Readonly<Record<OpenCoreAppKind, readonly [string, string]>> = {
  Writer: ['Writer:first', 'Writer:second'],
  Grid: ['Grid:first', 'Grid:second'],
  Present: ['Present:first', 'Present:second'],
  Notes: ['Notes:first', 'Notes:second'],
  PdfStudio: ['PdfStudio:first', 'PdfStudio:second'],
  Tasks: ['Tasks:first', 'Tasks:second'],
  Whiteboard: ['Whiteboard:first', 'Whiteboard:second'],
  Draw: ['Draw:first', 'Draw:second'],
  Vault: ['Vault:first', 'Vault:second'],
  AdminPolicy: ['AdminPolicy:first', 'AdminPolicy:second'],
  Publish: ['Publish:first', 'Publish:second'],
  Insight: ['Insight:first', 'Insight:second'],
  Connect: ['Connect:first', 'Connect:second'],
  Automate: ['Automate:first', 'Automate:second'],
};

const CONNECTED_ANCHORS: readonly AppGuideAnchorStep[] = [
  { app: 'Grid', id: 'Grid:first' },
  { app: 'Writer', id: 'Writer:embed' },
  { app: 'Writer', id: 'Writer:embed-mode' },
  { app: 'Grid', id: 'Grid:second' },
  { app: 'Writer', id: 'Writer:live-refresh' },
  { app: 'Present', id: 'Present:second' },
];

/**
 * **Nur die ersten beiden Schritte eines App-Rundgangs tragen einen Coachmark-Anker.**
 *
 * Der Rundgang erklärt jetzt sieben Punkte je App. Die Apps stellen aber weiterhin genau zwei
 * `data-vgt-app-guide-anchor`-Steuerelemente bereit (`<App>:first`/`<App>:second`). Die Schritte 3–7 sind
 * erklärende Punkte **ohne** Einzelsteuerungs-Anker: Sie markieren bewusst kein fremdes Steuerelement,
 * sondern sagen im Popover offen, dass sie eine Funktion erklären. Ein Anker auf einen unpassenden Knopf
 * wäre eine falsche Zeiger-Aussage.
 *
 * Der verbundene Grid→Writer-Rundgang behält seine sechs echten Anker unverändert.
 */
export function appGuideAnchorStep(target: AppGuideTarget, stepIndex: number): AppGuideAnchorStep | null {
  if (target.type === 'connected-workspace') {
    return CONNECTED_ANCHORS[stepIndex] ?? CONNECTED_ANCHORS[0];
  }

  // Nur Schritt 0 und 1 haben einen echten Anker; alles andere ist ein erklärender Schritt.
  if (!Number.isSafeInteger(stepIndex) || stepIndex < 0 || stepIndex > 1) return null;
  const anchors = APP_ANCHORS[target.kind];
  return { app: target.kind, id: anchors[stepIndex] };
}

/** Die zwei geprüften Anker einer App — für Tests und Diagnose (nicht für erfundene Schritt-Anker). */
export function appGuideAnchorIds(kind: OpenCoreAppKind): readonly [string, string] {
  return APP_ANCHORS[kind];
}

export function appGuideAnchorSelector(id: string): string {
  return `[data-vgt-app-guide-anchor="${id}"]`;
}
