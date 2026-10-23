// STATUS: PLATIN — Tasks quick-add wiring contract (AST-0916 / AST-0919).
//
// AST-0916 acceptance: "Titel tippen, Enter speichern, Fokus bleibt für nächste Aufgabe."
// The form cleared its title and due-date state but never returned the caret to the title field,
// so a click on "Add Task" left focus on the submit button. Comments are stripped
// (string-literal aware) so documentation is never mistaken for code.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const strip = (source) => {
  let out = '';
  let quote = '';
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (quote) {
      out += ch;
      if (ch === '\\') { out += next ?? ''; i += 1; continue; }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; out += ch; continue; }
    if (ch === '/' && next === '*') { const end = source.indexOf('*/', i + 2); i = end === -1 ? source.length : end + 1; continue; }
    if (ch === '/' && next === '/') { const end = source.indexOf('\n', i); i = end === -1 ? source.length : end; continue; }
    out += ch;
  }
  return out;
};

const view = strip(read('../../views/TasksView.tsx'));
const management = strip(read('../../app/TasksOnlyManagement.tsx'));
const runtime = strip(read('../../../../edition/open-core/runtime/TasksRuntime.tsx'));
const completionGate = strip(read('../../dependencies/taskCompletionGate.ts'));

/** Body of the quick-add submit handler, from its signature to the closing brace. */
function submitHandlerBody(source) {
  const start = source.indexOf('handleSubmitNewTask');
  expect(start, 'handleSubmitNewTask must exist').toBeGreaterThan(-1);
  const open = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') { depth -= 1; if (depth === 0) return source.slice(open, i + 1); }
  }
  throw new Error('unbalanced handleSubmitNewTask body');
}

describe('Tasks quick-add wiring', () => {
  it('stays reachable from the visible Tasks application surface', () => {
    // Edition runtime -> Tasks-only management -> TasksView. One chain, no second copy.
    expect(runtime).toContain('TasksOnlyManagement');
    expect(management).toContain('<TasksView');
    expect(view).toContain('data-vgt-app-guide-anchor="Tasks:first"');
    expect(view).toContain('data-vgt-app-guide-anchor="Tasks:second"');
  });

  it('binds the title field to a ref and returns focus to it after a successful add', () => {
    expect(view).toMatch(/const quickAddInputRef = useRef<HTMLInputElement \| null>\(null\)/);
    expect(view).toMatch(/ref=\{quickAddInputRef\}[^>]*aria-label="New task title"/);
    const body = submitHandlerBody(view);
    // The caret must be restored on the same path that clears the draft state.
    expect(body).toMatch(/setNewTaskTitle\(''\)/);
    expect(body).toMatch(/setNewTaskDueDate\(''\)/);
    expect(body).toMatch(/quickAddInputRef\.current\?\.focus\(\)/);
    expect(body.indexOf('quickAddInputRef.current?.focus()')).toBeGreaterThan(body.indexOf("setNewTaskTitle('')"));
  });

  it('never adds an empty or whitespace-only title', () => {
    const body = submitHandlerBody(view);
    expect(body).toMatch(/if \(!newTaskTitle\.trim\(\)\) return;/);
    expect(body).toMatch(/title: newTaskTitle\.trim\(\)/);
    // The submit control is disabled for an empty draft, so the guard is visible, not just internal.
    expect(view).toMatch(/type="submit" disabled=\{!newTaskTitle\.trim\(\)\}/);
  });

  it('keeps the entered priority and due date on the created task', () => {
    const body = submitHandlerBody(view);
    expect(body).toMatch(/priority: newTaskPriority/);
    expect(body).toMatch(/dueDate: newTaskDueDate \|\| undefined/);
    // The active organization selection decides inbox/list/my-day scope in exactly one place.
    expect(body).toMatch(/\.\.\.organizationPatchForSelection\(organizationSelection\)/);
  });

  it('keeps exactly one focus definition per capture surface', () => {
    // TasksView renders TaskCapturePanel, but each file owns its own field: the quick-add form
    // restores focus to its own title input and never reaches into the capture panel's ref.
    expect(view).toContain('<TaskCapturePanel');
    const viewFocusCalls = view.match(/\.focus\(\)/g) ?? [];
    expect(viewFocusCalls).toHaveLength(1);
    const panel = strip(read('../../capture/TaskCapturePanel.tsx'));
    expect(panel).toMatch(/const inputRef = useRef<HTMLInputElement \| null>\(null\)/);
    expect(panel).toMatch(/ref=\{inputRef\}/);
    // The two focus owners are distinct fields in distinct files.
    expect(view).not.toContain('inputRef');
  });
});

describe('Tasks completion gate wiring (AST-0974 / W-406)', () => {
  it('gates the checkbox completion on the dependency graph', () => {
    expect(management).toContain('evaluateTaskCompletionGate(');
    // Called with the next completion state, and refused before any mutation is persisted.
    expect(management).toMatch(/evaluateTaskCompletionGate\(current, taskData\.tasks, taskData\.dependencies, !current\.completed\)/);
    const toggleBody = management.slice(management.indexOf('const handleToggleTask'), management.indexOf('const handleAddTask'));
    expect(toggleBody).toMatch(/if \(!gate\.allowed\)/);
    expect(toggleBody.indexOf('gate.allowed')).toBeLessThan(toggleBody.indexOf('toggleTaskCompletion('));
  });

  it('gates the board move as well, so a drag is not a way around the rule', () => {
    expect(management).toMatch(/evaluateTaskCompletionGate\(moved, taskData\.tasks, taskData\.dependencies, target\?\.mapsTo === 'done'\)/);
    const moveBody = management.slice(management.indexOf('const handleMoveTaskToColumn'), management.indexOf('const handleToggleBoardTask'));
    expect(moveBody).toMatch(/if \(!gate\.allowed\)/);
  });

  it('delegates the board checkbox to the move handler instead of toggling twice', () => {
    const boardToggle = management.slice(management.indexOf('const handleToggleBoardTask'), management.indexOf('const handleRecurrenceOperation'));
    expect(boardToggle).toContain('handleMoveTaskToColumn(');
    expect(boardToggle).toContain('return;');
    // The generic toggle must be the fallback branch, not an unconditional follow-up call.
    expect(boardToggle.indexOf('handleMoveTaskToColumn(')).toBeLessThan(boardToggle.indexOf('handleToggleTask(id)'));
  });

  it('renders a refused action in text, not silently', () => {
    // A refusal the user cannot see is the same as a silent no-op.
    expect(management).toContain('data-task-action-notice={actionNotice.tone}');
    expect(management).toMatch(/role=\{actionNotice\.tone === 'error' \? 'alert' : 'status'\}/);
    expect(management).toMatch(/aria-live=\{actionNotice\.tone === 'error' \? 'assertive' : 'polite'\}/);
    expect(management).toContain('setActionNotice({ text: gate.reason');
  });

  it('keeps the edge-type semantics in exactly one place', () => {
    // FS/FF/SF are hard gates, SS is advisory; no second copy of that rule anywhere in Tasks.
    expect(completionGate).toContain("return type === 'SS' ? 'advisory' : 'blocking';");
    const otherFiles = [management, view].join('\n');
    expect(otherFiles).not.toContain("'SS' ? 'advisory'");
    expect(otherFiles).not.toMatch(/type === 'FF' \|\| type === 'SF'/);
  });

  it('never blocks reopening a completed task', () => {
    expect(completionGate).toMatch(/if \(!nextCompleted\) return ALLOWED;/);
  });
});
