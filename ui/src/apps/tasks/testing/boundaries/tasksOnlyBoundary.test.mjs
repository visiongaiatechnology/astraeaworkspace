// STATUS: PLATIN — guard the Tasks-only entry's management runtime graph from Premium app engines.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const tasksAppDirectory = fileURLToPath(new URL('../../', import.meta.url));
const forbiddenModule = /(?:^|[\\/])(?:WorkManagement|KanbanPlannerView|ProjectsTimelineView|planner[^\\/]*|project[^\\/]*)\.(?:ts|tsx|js|jsx|mjs)$/i;

function resolveManagementImport(importerPath, specifier) {
  if (!specifier.startsWith('.')) return undefined;
  const base = path.resolve(path.dirname(importerPath), specifier);
  const candidates = path.extname(base) ? [base] : [`${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, `${base}.mjs`, base];
  return candidates.find((candidate) => existsSync(candidate) && candidate.startsWith(tasksAppDirectory));
}

function managementRuntimeGraph(entryPath, visited = new Set()) {
  const resolved = path.resolve(entryPath);
  if (visited.has(resolved)) return visited;
  visited.add(resolved);
  const source = readFileSync(resolved, 'utf8');
  const importSpecifiers = [
    ...[...source.matchAll(/^\s*import\b[^\n]*?['"]([^'"]+)['"]/gm)].map((match) => match[1]),
    ...[...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gm)].map((match) => match[1]),
  ];
  for (const specifier of importSpecifiers) {
    const dependencyPath = resolveManagementImport(resolved, specifier);
    if (dependencyPath) managementRuntimeGraph(dependencyPath, visited);
  }
  return visited;
}

describe('Tasks-only edition boundary', () => {
  it('resolves task UI and persistence without Planner or Projects implementation modules', () => {
    const graph = managementRuntimeGraph(path.join(tasksAppDirectory, 'app', 'TasksOnlyManagement.tsx'));
    const files = [...graph];
    expect(files.some((file) => file.endsWith(`${path.sep}TasksView.tsx`))).toBe(true);
    expect(files.some((file) => file.endsWith(`${path.sep}tasksOnlyDocument.ts`))).toBe(true);
    expect(files.filter((file) => forbiddenModule.test(file))).toEqual([]);
    expect(readFileSync(path.join(tasksAppDirectory, 'app', 'TasksOnlyManagement.tsx'), 'utf8'))
      .not.toMatch(/from\s+['"]\.\/WorkManagement['"]/);
  });
});
