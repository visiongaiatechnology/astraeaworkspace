// AST-1001 (part 3b) — the chain that makes the control reachable.
//
// `.mjs` on purpose: this contract READS source files, and a `.tsx` test in this project has no
// Node type declarations (`node:fs` → TS2307). The rendered half lives in the sibling
// `taskTakeIntoNote.render.test.tsx`. Driving a real click needs a browser and is NOT claimed here.
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
    if (ch === '/' && next === '/') { const end = source.indexOf('\n', i); i = end === -1 ? source.length : end + 1; continue; }
    out += ch;
  }
  return out;
};

const runtime = strip(read('../../../../edition/open-core/runtime/TasksRuntime.tsx'));
const management = strip(read('../../app/TasksOnlyManagement.tsx'));
const view = strip(read('../../views/TasksView.tsx'));
const drawer = strip(read('../../details/TaskDetailDrawer.tsx'));
const panel = strip(read('../../collaboration/TaskCollaborationPanel.tsx'));
const builder = strip(read('../../interchange/taskDerivedDocuments.ts'));

/** Body of the take-into-note handler, from its signature to the next handler. */
function handlerBody() {
  const start = management.indexOf('const handleTakeTaskIntoNote');
  expect(start, 'handleTakeTaskIntoNote must exist').toBeGreaterThan(-1);
  const end = management.indexOf('const handleMoveTaskToColumn');
  expect(end, 'handleMoveTaskToColumn must follow it').toBeGreaterThan(start);
  return management.slice(start, end);
}

describe('take-task-into-note wiring chain', () => {
  it('stops dropping the callbacks the shell already passes', () => {
    // The measured defect: the runtime received these props and ignored them, so a capability
    // declared in EditionWorkManagementProps could never reach the Tasks surface. Assert the
    // forwarding itself rather than one particular destructuring style.
    for (const prop of ['onCreateDerivedDocument', 'documents', 'onOpenDocument']) {
      expect(runtime, `${prop} must be destructured`).toContain(prop);
      expect(runtime, `${prop} must be forwarded`).toContain(`${prop}={${prop}}`);
    }
    // The runtime must not accept fewer props than the contract declares.
    expect(runtime).not.toMatch(/\(\{ document, onUpdateDocument \}\)/);
    expect(runtime).not.toMatch(/\(\{ document, onUpdateDocument, onCreateDerivedDocument \}\)/);
  });

  it('carries the callback from the runtime to the drawer through every layer', () => {
    expect(management).toMatch(/onCreateDerivedDocument\?: \(document: WorkspaceDocument\) => void/);
    expect(management).toContain('handleTakeTaskIntoNote');
    expect(management).toContain('buildTaskNoteDocument(');
    expect(management).toContain('onTakeTaskIntoNote={handleTakeTaskIntoNote}');
    expect(view).toContain('onTakeTaskIntoNote={onTakeTaskIntoNote}');
    expect(drawer).toContain('onTakeTaskIntoNote={onTakeTaskIntoNote ? () => onTakeTaskIntoNote(selectedTask.id) : undefined}');
    expect(panel).toContain('onTakeTaskIntoNote');
  });

  it('actually creates the document instead of only reporting success', () => {
    // Guards the "success without an operation" pattern this project has been bitten by: the host
    // call must happen, and it must happen BEFORE the success notice is set.
    const handler = handlerBody();
    expect(handler).toContain('onCreateDerivedDocument(derived.document)');
    expect(handler.indexOf('onCreateDerivedDocument(derived.document)')).toBeLessThan(handler.indexOf("tone: 'info'"));
    // And the task link is persisted through the canonical patch path, not a raw object literal.
    expect(handler).toContain('taskPatchForDerivedNote(');
    expect(handler).toContain('applyTaskPatch(');
  });

  it('reports a named failure rather than a silent no-op', () => {
    const handler = handlerBody();
    expect(handler).toContain('This host cannot create a Notes document');
    expect(handler).toMatch(/tone: 'error'/);
    const takeIntoNote = panel.slice(panel.indexOf('const takeIntoNote'), panel.indexOf('const takeIntoNote') + 900);
    expect(takeIntoNote).toContain("setTakeIntoNoteState('failed')");
    expect(takeIntoNote).toContain('setTakeIntoNoteMessage(error)');
  });

  it('keeps one deep-link grammar and one document model', () => {
    // No second parser and no second document factory: the builder reuses the workspace's own.
    expect(builder).toContain("from '../../../edition/contracts/documentFactory'");
    expect(builder).toContain('createNewDocument(');
    expect(builder).not.toMatch(/function isWorkspaceDeepLink|WORKSPACE_DEEP_LINK_PATTERN/);
    expect(builder).toContain('export function taskWorkspaceUri(');
  });
});
