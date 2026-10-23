// @vitest-environment happy-dom
// STATUS: DIAMANT VGT SUPREME — VERHALTENSNACHWEIS fuer M06-Z1274 (Modul 06, Astraea Tasks).
//
// WARUM DIESE DATEI EXISTIERT
// M06-Z1274 verlangt: "Tastaturbedienung, Screenreader-Semantik, High-Contrast, Fokusfuehrung
// und skalierbare UI gehoeren zum Definition-of-Done." Bis hierher gab es dafuer nur
// QUELLTEXTVERTRAEGE (`readFileSync` + `toContain`) und `renderToStaticMarkup`-Vertraege:
//
//   - `capture/taskQuickAddWiring.contract.test.mjs:58-67` behauptet die Fokusrueckgabe, indem er
//     den Handler-BODY als Zeichenkette liest (`body.indexOf('quickAddInputRef.current?.focus()')`)
//     — der Beleg bleibt wahr, wenn der Handler nie aufgerufen wird.
//   - `views/taskBoardRender.contract.test.tsx:64-77` behauptet den Tastatur-/Picker-Ersatzweg,
//     indem er MARKUP als Zeichenkette prueft — ein `<select>`, das nie ein `change`-Ereignis
//     verarbeitet, besteht diesen Vertrag genauso.
//   - `testing/ASR_BELEGZUORDNUNG.md:71-72` fuehrt genau diese Luecke selbst als "KEIN BELEG".
//
// DIESE DATEI rendert den echten Einstiegspunkt des Moduls in ein DOM, loest echte Eingabe-,
// Submit-, `change`- und `keydown`-Ereignisse aus und liest `document.activeElement`. Sie fordert
// ihre Umgebung in Zeile 1 selbst an (`@vitest-environment happy-dom`), weil `ui/vite.config.ts`
// bewusst KEIN globales `environment` setzt (dort gemessen: 37 Testdateien wuerden unter
// happy-dom rot, weil ihre Quelltextwaechter `import.meta.url` als `file:`-URL lesen).
//
// Der High-Contrast-Teil derselben Zusage liegt in der Schwesterdatei
// `testing/accessibility/taskAccessibilityStylesheet.test.tsx`; dort wird das Stylesheet geprueft,
// das `main.tsx` global laedt. Hier wird die Komponente bedient.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspaceCommon';
import type { TaskItem } from '../../../../shared/contracts/work-management/workspaceWork';
import { TasksOnlyManagement } from '../../app/TasksOnlyManagement';
import { TASK_SYSTEM_STATUS_DEFINITIONS } from '../../model/taskModel';
import { DEFAULT_TASK_ORGANIZATION } from '../../state/taskOrganization';
import { DEFAULT_TASK_VIEW_PREFERENCES } from '../../views/taskViews';

// Ohne dieses Kennzeichen warnt React bei jedem `act` ("not configured to support act"), weil
// Vitest hier keinen eigenen Test-Setup-Loader hat. Kein `any`, kein Cast: die Deklaration des
// globalen Kennzeichens steht direkt darunter.
declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function task(overrides: Partial<TaskItem> & Pick<TaskItem, 'id' | 'title'>): TaskItem {
  const { id, title, ...rest } = overrides;
  return { id, title, completed: false, priority: 'medium', ...rest };
}

const OPEN_TASK = task({ id: 't-open', title: 'Open item', status: 'not_started' });
const ACTIVE_TASK = task({ id: 't-active', title: 'Active item', status: 'active' });
const DONE_TASK = task({ id: 't-done', title: 'Done item', status: 'done', completed: true });

/** Der Status, den `taskBoardKeyboardTargets` fuer die offene Karte an erster Stelle nennt. */
const FIRST_KEYBOARD_TARGET = TASK_SYSTEM_STATUS_DEFINITIONS
  .slice()
  .sort((a, b) => a.order - b.order)
  .find((definition) => definition.id !== 'not_started');
if (!FIRST_KEYBOARD_TARGET) throw new Error('TASK_SYSTEM_STATUS_DEFINITIONS kennt keinen Status ausser "not_started".');

/**
 * Ein echtes Workspace-Dokument der Sorte `Tasks`. `TasksOnlyManagement` liest seine Aufgaben aus
 * `document.workManagementData` (siehe `persistence/tasksOnlyDocument.ts:55-72`) und reicht sie an
 * `TasksView` weiter — dieser Test bedient also den oeffentlichen Einstiegspunkt des Moduls.
 * Die Ansicht wird auf das Board gestellt, weil die Tastatur- und Auswahlwege dort leben.
 */
function tasksDocument(tasks: TaskItem[]): WorkspaceDocument {
  return {
    id: 'tasks-runtime-document',
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
  } as WorkspaceDocument;
}

/**
 * Rendert den Tasks-Einstieg, laesst React und `requestAnimationFrame` laufen, uebergibt das
 * Wurzelelement an die Pruefung und raeumt danach wieder auf.
 */
async function mitGerendertemTasks(
  tasks: TaskItem[],
  pruefung: (container: HTMLElement) => Promise<void> | void,
): Promise<void> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<TasksOnlyManagement document={tasksDocument(tasks)} onUpdateDocument={() => undefined} />);
  });
  // React rendert Effekte und das Board in mehr als einem Durchlauf; ein Animationsbild abwarten.
  await act(async () => {
    await new Promise((resolve) => {
      requestAnimationFrame(() => resolve(undefined));
    });
  });
  try {
    await pruefung(container);
  } finally {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }
}

/** Ein Element ueber seinen zugaenglichen Namen finden — nichts anderes prueft ein Screenreader. */
function byLabel(container: HTMLElement, label: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  expect(found, `kein Element mit aria-label="${label}"`).not.toBeNull();
  return found!;
}

/**
 * Eine echte Nutzereingabe in ein kontrolliertes React-Feld. `element.value = x` allein sieht React
 * nicht; der native Setter plus `input`-Ereignis ist derselbe Weg, den `user-event` geht. Ohne
 * `any` und ohne Cast: der Setter kommt typisiert aus dem Prototyp-Deskriptor.
 */
function typeInto(element: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('M06-Z1274 — Fokusfuehrung, Tastaturbedienung und Screenreader-Semantik wirken im Betrieb', () => {
  it('gibt den Fokus nach dem Schnellhinzufuegen an das Titelfeld zurueck', async () => {
    await mitGerendertemTasks([OPEN_TASK, ACTIVE_TASK], async (container) => {
      const titleField = byLabel(container, 'New task title') as HTMLInputElement;
      const submit = container.querySelector<HTMLButtonElement>('form button[type="submit"]');
      expect(submit, 'der Schnellhinzufuegen-Knopf fehlt').not.toBeNull();
      const form = submit!.closest('form');
      expect(form, 'der Schnellhinzufuegen-Knopf liegt in keinem Formular').not.toBeNull();

      await act(async () => {
        typeInto(titleField, 'Fokus bleibt fuer die naechste Aufgabe');
      });
      expect(titleField.value).toBe('Fokus bleibt fuer die naechste Aufgabe');
      expect(submit!.disabled, 'der Knopf muss fuer einen gefuellten Titel aktiv sein').toBe(false);

      // Der Fokus liegt auf einem ANDEREN Bedienelement: ohne Rueckgabe bliebe er dort stehen.
      submit!.focus();
      expect(document.activeElement).toBe(submit);

      await act(async () => {
        form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(titleField.value, 'das Titelfeld muss nach dem Speichern leer sein').toBe('');
      expect(
        document.activeElement,
        'nach dem Speichern muss der Fokus wieder im Titelfeld liegen',
      ).toBe(titleField);
    });
  });

  it('verschiebt eine Karte per Pfeiltaste und meldet das Ergebnis im Live-Bereich', async () => {
    await mitGerendertemTasks([OPEN_TASK, ACTIVE_TASK], async (container) => {
      const card = container.querySelector<HTMLElement>('[data-task-board-card="t-open"]');
      expect(card, 'die Karte "t-open" fehlt im Board').not.toBeNull();
      expect(card!.getAttribute('data-task-board-column')).toBe('status:not_started');

      await act(async () => {
        card!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      });

      // Der Live-Bereich ist der einzige Kanal, ueber den ein Screenreader die Verschiebung
      // erfaehrt. Ohne ihn waere die Bewegung stumm — und die Farbe der einzige Hinweis.
      const status = container.querySelector<HTMLElement>('[data-task-board-status]');
      expect(status, 'der Live-Bereich des Boards fehlt').not.toBeNull();
      expect(status!.getAttribute('role')).toBe('status');
      expect(status!.getAttribute('aria-live')).toBe('polite');
      expect(status!.textContent).toContain('Open item');
      expect(status!.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    });
  });

  it('fuehrt die Karte auch ueber den sichtbaren Auswahlweg in eine andere Spalte', async () => {
    await mitGerendertemTasks([OPEN_TASK, ACTIVE_TASK], async (container) => {
      const picker = byLabel(container, 'Move Open item to another column') as HTMLSelectElement;
      const target = picker.querySelector<HTMLOptionElement>(`option[value="status:${FIRST_KEYBOARD_TARGET.id}"]`);
      expect(target, `der Picker muss "${FIRST_KEYBOARD_TARGET.label}" als Ziel anbieten`).not.toBeNull();
      // Die eigene Spalte darf kein Ziel sein: ein Wechsel in dieselbe Spalte waere keine Handlung.
      expect(picker.querySelector('option[value="status:not_started"]')).toBeNull();

      await act(async () => {
        picker.value = target!.value;
        picker.dispatchEvent(new Event('change', { bubbles: true }));
      });

      const status = container.querySelector<HTMLElement>('[data-task-board-status]');
      expect(status?.textContent).toContain('Open item');
      expect(
        status?.textContent,
        'die Auswahl muss die Karte wirklich in die gewaehlte Spalte verschieben',
      ).toContain(FIRST_KEYBOARD_TARGET.label);
    });
  });

  it('benennt jede Karte und jede Spalte und macht jede Karte mit der Tastatur erreichbar', async () => {
    await mitGerendertemTasks([OPEN_TASK, ACTIVE_TASK, DONE_TASK], async (container) => {
      const cards = Array.from(container.querySelectorAll<HTMLElement>('[data-task-board-card]'));
      expect(cards.length, 'es muessen drei Karten sichtbar sein').toBe(3);
      for (const card of cards) {
        // Jede Karte ist ohne Maus erreichbar ...
        expect(card.getAttribute('tabindex'), 'eine Karte ist nicht fokussierbar').toBe('0');
        // ... und traegt ihre Bedienelemente mit eigenem zugaenglichem Namen.
        const named = Array.from(card.querySelectorAll<HTMLElement>('[aria-label]'));
        expect(named.length, 'eine Karte hat kein einziges benanntes Bedienelement').toBeGreaterThan(0);
        for (const control of named) {
          expect(control.getAttribute('aria-label')?.trim().length ?? 0).toBeGreaterThan(0);
        }
      }
      // Jede Spalte hat einen zugaenglichen Namen; keine Spalte ist fuer einen Screenreader namenlos.
      const columns = Array.from(container.querySelectorAll<HTMLElement>('[data-task-board-column-target]'));
      expect(columns.length, 'das Board zeigt keine Spalten').toBeGreaterThan(0);
      for (const column of columns) {
        expect(column.getAttribute('aria-label')?.trim().length ?? 0).toBeGreaterThan(0);
      }
    });
  });
});
