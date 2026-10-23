// @vitest-environment happy-dom
// STATUS: DIAMANT VGT SUPREME — die fuenfte DoD-Eigenschaft, im DOM gemessen.
//
// WARUM DIESE DATEI EXISTIERT
// M06-Z1274 verlangt: "Tastaturbedienung, Screenreader-Semantik, High-Contrast, Fokusfuehrung
// und skalierbare UI gehoeren zum Definition-of-Done." Die ersten vier sind in den
// Schwesterdateien belegt (`views/taskViewsAccessibilityRuntime.test.tsx` und
// `accessibility/taskAccessibilityStylesheet.test.tsx`).
//
// DIE FUENFTE FEHLTE, und sie ist die einzige, die keine Werkzeuggrenze war, sondern eine
// echte Luecke. GEMESSEN am 2026-10-16 in `ui/src/apps/tasks/**/*.tsx`:
//
//     text-[9px]   40x        text-[10px]  85x        text-[11px]  57x
//     ==> 182 feste Pixelgroessen in 16 Dateien.
//
// Eine feste px-Schriftgroesse folgt der Wurzel-Schriftgroesse des Nutzers NICHT. Wer im
// Betriebssystem oder Browser die Schrift vergroessert, bekommt hier weiterhin 9, 10 oder 11
// Pixel. Sie sind jetzt `text-[0.5625rem]`, `text-[0.625rem]` und `text-[0.6875rem]` — bei
// einer Wurzel von 16px rendert das exakt gleich, aber es folgt der Wurzel.
//
// UND EIN BEFUND UEBER DEN BEFUND: das Wort "scalable controls" steht in
// `design-system/styles/module-accessibility.css` NUR IN KOMMENTAREN (:123, :167, :190, :208,
// :227). Es gibt dort KEINE CSS-Regel, die skaliert. Wer den Kommentar als Beleg liest,
// liest ein Etikett. Deshalb prueft dieser Test nicht den Kommentar, sondern die Klassen, die
// am gerenderten Element WIRKLICH ankommen.
// UND EINE GRENZE, DIE GEMESSEN IST UND NICHT VERMUTET — sie steht hier, weil sie den
// Unterschied zwischen dem ausmacht, was dieser Test belegt, und dem, was er zu belegen
// SCHEINT. Ein Schwesteragent hat sie mit einer eigenen Sonde gemessen:
//
//     happy-dom MERKT die Aufloesung von `rem`. Bei einer Wurzel von 200 % stieg nur die
//     Wurzel selbst (16px -> 64px); ein `rem`-Kind blieb bei 16px und ein `px`-Kind bei 11px.
//
// Das heisst: unter happy-dom ist NICHT messbar, ob die Nachfahren der Wurzel folgen. Die
// Umstellung von 182 `text-[Npx]` auf `rem` ist darum die RICHTIGE Einheit — in einem echten
// Browser skaliert `rem` und `px` nicht —, aber dieser Test kann nur die VORBEDINGUNG
// belegen: dass keine feste Pixelgroesse mehr am DOM ankommt. Dass die Schrift bei
// vergroesserter Wurzel wirklich mitwaechst, braucht echtes Layout und bleibt ein NATIVE
// Release-Gate (Paragraf 2: technische Verifikation und native Abnahme getrennt).
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspaceCommon';
import type { TaskItem } from '../../../../shared/contracts/work-management/workspaceWork';
import { TasksOnlyManagement } from '../../app/TasksOnlyManagement';
import { DEFAULT_TASK_ORGANIZATION } from '../../state/taskOrganization';
import { DEFAULT_TASK_VIEW_PREFERENCES } from '../../views/taskViews';

// Ohne dieses Kennzeichen warnt React bei jedem `act`. Kein Cast: die Deklaration des globalen
// Kennzeichens steht direkt darunter.
declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function task(overrides: Partial<TaskItem> & Pick<TaskItem, 'id' | 'title'>): TaskItem {
  const { id, title, ...rest } = overrides;
  return { id, title, completed: false, priority: 'medium', ...rest };
}

const TESTAUFGABEN: TaskItem[] = [
  task({ id: 't-open', title: 'Offene Aufgabe mit einer laengeren Beschreibung', status: 'not_started' }),
  task({ id: 't-active', title: 'Aktive Aufgabe', status: 'active' }),
  task({ id: 't-done', title: 'Erledigte Aufgabe', status: 'done', completed: true }),
];

function tasksDokument(tasks: TaskItem[]): WorkspaceDocument {
  return {
    id: 'tasks-skalierung-document',
    title: 'Tasks',
    kind: 'Tasks',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'cosmic-obsidian',
    root_object_ids: [],
    objects: {},
    workManagementData: {
      tasks,
      cards: [],
      milestones: [],
      dependencies: [],
      taskOrganization: DEFAULT_TASK_ORGANIZATION,
      taskViewPreferences: { ...DEFAULT_TASK_VIEW_PREFERENCES, mode: 'board', boardBy: 'status' },
    },
  };
}

/** Rendert den Modul-Einstieg, laesst React und `requestAnimationFrame` laufen und raeumt auf. */
async function mitGerendertemTasks(
  pruefung: (container: HTMLElement) => void,
): Promise<void> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <TasksOnlyManagement document={tasksDokument(TESTAUFGABEN)} onUpdateDocument={() => undefined} />,
    );
  });
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 80);
    });
  });
  try {
    pruefung(container);
  } finally {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }
}

/** Alle Klassennamen, die an gerenderten Elementen wirklich ankommen. */
function alleKlassen(container: HTMLElement): string {
  return Array.from(container.querySelectorAll<HTMLElement>('*'))
    .map((element) => element.getAttribute('class') ?? '')
    .join(' ');
}

describe('die Schrift des Tasks-Moduls traegt keine feste Pixelgroesse mehr', () => {
  it('traegt an keinem gerenderten Element eine feste Pixel-Schriftgroesse', async () => {
    await mitGerendertemTasks((container) => {
      const treffer: string[] = [];
      for (const element of container.querySelectorAll<HTMLElement>('*')) {
        const gefunden = (element.getAttribute('class') ?? '').match(/text-\[\d+px\]/gu);
        if (gefunden) {
          treffer.push(`<${element.tagName.toLowerCase()}> ${gefunden.join(', ')}`);
        }
      }
      expect(
        treffer,
        `feste Pixel-Schriftgroessen an gerenderten Elementen:\n${treffer.join('\n')}`,
      ).toEqual([]);
    });
  });

  it('traegt die rem-Fassung an den Elementen, die vorher px trugen', async () => {
    await mitGerendertemTasks((container) => {
      const klassen = alleKlassen(container);
      // Die drei Groessen, die vorher fest waren. Mindestens eine muss am DOM ankommen —
      // sonst wuerde dieser Test bestehen, weil gar nichts gerendert wurde.
      const remKlassen = ['text-[0.5625rem]', 'text-[0.625rem]', 'text-[0.6875rem]']
        .filter((klasse) => klassen.includes(klasse));
      expect(
        remKlassen.length,
        `keine der drei rem-Groessen kam am gerenderten DOM an; gefunden: ${klassen.slice(0, 200)}`,
      ).toBeGreaterThan(0);
    });
  });

  it('rendert ueberhaupt Inhalt, damit die Zusicherungen nicht leer bestehen', async () => {
    // Eine Zusicherung ueber eine leere Menge ist immer wahr. Diese hier belegt, dass
    // ueberhaupt Elemente mit Klassen im DOM stehen.
    await mitGerendertemTasks((container) => {
      const mitKlasse = Array.from(container.querySelectorAll<HTMLElement>('[class]'));
      expect(mitKlasse.length).toBeGreaterThan(10);
      expect(container.textContent ?? '').toContain('Offene Aufgabe');
    });
  });
});
