#!/usr/bin/env node
// STATUS: DIAMANT — Statischer Import-Zyklus-Scanner für die native TDZ-Crash-Klasse.
//
// Hintergrund (2026-10-18): Der native "Modul wurde sicher angehalten"-Crash beim frischen
// Grid war ein Bundle-Init-TDZ: `ReferenceError: Cannot access 'g' before initialization`
// im Chunk `vaultIntegrity-*.js`, verursacht durch den Import-Zyklus
// `vaultIntegrity → vaultFileSystemEngine → vaultNames → vaultIntegrity`.
// Rollup ordnet die Modulinitialisierung bei solchen Zyklen anders als Vite/ESM im
// Quellcode; ein Wert-Zyklus ist die statische Wurzel der Klasse. Reine Typ-Zyklen sind
// dagegen harmlos, weil `import type` beim Build verschwindet.
//
// Dieses Skript baut den statischen Import-Graph über `ui/src/**/*.{ts,tsx}`:
//   * relative statische Imports/Re-Exports; Paket-Imports und dynamische Imports zählen nicht,
//   * `import type`/`export type` und reine `{ type X }`-Spezifizierer werden ignoriert,
//   * Tarjan/Kosaraju-SCC; jede SCC mit >1 Knoten (oder Selbstkante) ist ein Zyklus,
//   * Ausgabe: Länge, Beteiligte und kürzester Pfad; Wert-Zyklen markiert.
//
// Exitcode 1 nur, wenn mindestens ein Zyklus eine Wert-Import-Kante enthält.
// Aufruf:
//   cd ui && node scripts/import-cycle-smoke.mjs
//   cd ui && npm run cycles:smoke
//   node ui/scripts/import-cycle-smoke.mjs --root src [--max-print 200]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SRC_ROOT = path.join(UI_ROOT, 'src');

function parseArgs(argv) {
  let root = DEFAULT_SRC_ROOT;
  let maxPrint = 200;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') {
      root = path.resolve(argv[index + 1] ?? root);
      index += 1;
    } else if (arg === '--max-print') {
      maxPrint = Math.max(0, Number.parseInt(argv[index + 1] ?? '200', 10) || 0);
      index += 1;
    }
  }
  return { root, maxPrint };
}

function collectFiles(root) {
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
        stack.push(absolute);
      } else if (entry.isFile() && /\.(ts|tsx)$/u.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        files.push(path.normalize(absolute));
      }
    }
  }
  return files.sort();
}

/** Block-/Zeilenkommentare entfernen, damit Beispiele in Kommentaren keine Kanten erzeugen. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .replace(/\/\/[^\n\r]*/gu, ' ');
}

function splitSpecifierList(list) {
  return list
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function namedListIsTypeOnly(list) {
  const items = splitSpecifierList(list);
  return items.length > 0 && items.every((item) => /^type\s+/u.test(item) || /^type$/u.test(item));
}

function importClauseKind(statement) {
  const match = /\bimport\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/u.exec(statement);
  if (!match) return statement.startsWith('import type') ? 'type' : 'value';
  if (/^type\b/u.test(match[1].trim())) return 'type';
  const clause = match[1].trim();
  const named = /\{([\s\S]*)\}/u.exec(clause);
  if (named) {
    const outside = clause.replace(/\{[\s\S]*\}/u, '').replace(/,/gu, '').trim();
    if (outside === '' && namedListIsTypeOnly(named[1])) return 'type';
    return 'value';
  }
  return clause.length > 0 ? 'value' : 'type';
}

function exportClauseKind(statement) {
  if (/^export\s+type\b/u.test(statement.trim())) return 'type';
  const braces = /\{([\s\S]*?)\}\s+from\s+['"][^'"]+['"]/u.exec(statement);
  if (braces) {
    return namedListIsTypeOnly(braces[1]) ? 'type' : 'value';
  }
  return 'value';
}

/** Extrahiert relative statische Imports/Re-Exports mit Wert/Typ-Klassifikation. */
function extractImports(source) {
  const text = stripComments(source);
  const edges = [];
  const patterns = [
    {
      regex: /\bimport\s+(?:type\s+)?[\s\S]*?\s+from\s+['"]([^'"]+)['"]/gu,
      kind: (statement) => importClauseKind(statement),
    },
    {
      regex: /\bimport\s+['"]([^'"]+)['"]/gu,
      kind: () => 'value',
    },
    {
      regex: /\bexport\s+(?:type\s+)?(?:\*|\{[\s\S]*?\})\s+from\s+['"]([^'"]+)['"]/gu,
      kind: (statement) => exportClauseKind(statement),
    },
    {
      regex: /\bexport\s+\*\s+as\s+\w+\s+from\s+['"]([^'"]+)['"]/gu,
      kind: () => 'value',
    },
  ];

  for (const { regex, kind } of patterns) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const statement = match[0];
      const specifier = match[1];
      if (!specifier.startsWith('.')) continue;
      edges.push({
        specifier,
        kind: kind(statement),
        line: text.slice(0, match.index).split('\n').length,
      });
    }
  }
  return edges;
}

function resolveRelative(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [];
  if (/\.(?:js|jsx|mjs|cjs)$/u.test(base)) {
    const withoutExtension = base.replace(/\.(?:js|jsx|mjs|cjs)$/u, '');
    candidates.push(`${withoutExtension}.ts`, `${withoutExtension}.tsx`);
  }
  candidates.push(
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  );
  for (const candidate of candidates) {
    if (existsSync(candidate) && /\.(ts|tsx)$/u.test(candidate) && !candidate.endsWith('.d.ts')) {
      return path.normalize(candidate);
    }
  }
  return null;
}

function buildGraph(root) {
  const files = collectFiles(root);
  const nodes = new Set(files);
  const edgeMap = new Map(); // "from\u0000to" -> { from,to,kind,line }
  let parsedEdges = 0;
  for (const file of files) {
    let source;
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const edge of extractImports(source)) {
      const target = resolveRelative(file, edge.specifier);
      if (!target || !nodes.has(target)) continue;
      parsedEdges += 1;
      const key = `${file}\u0000${target}`;
      const existing = edgeMap.get(key);
      // Eine Wert-Kante gewinnt gegen eine reine Typ-Kante zwischen demselben Paar.
      if (!existing || (existing.kind === 'type' && edge.kind === 'value')) {
        edgeMap.set(key, { from: file, to: target, kind: edge.kind, line: edge.line });
      }
    }
  }
  const edges = [...edgeMap.values()];
  const adjacency = new Map(files.map((file) => [file, []]));
  const reverse = new Map(files.map((file) => [file, []]));
  const valueAdjacency = new Map(files.map((file) => [file, []]));
  const valueReverse = new Map(files.map((file) => [file, []]));
  for (const edge of edges) {
    adjacency.get(edge.from).push(edge);
    reverse.get(edge.to).push(edge);
    if (edge.kind === 'value') {
      valueAdjacency.get(edge.from).push(edge);
      valueReverse.get(edge.to).push(edge);
    }
  }
  return { files, edges, adjacency, reverse, valueAdjacency, valueReverse, parsedEdges };
}

/** Iteratives Kosaraju; liefert die SCCs in topologischer Reihenfolge. */
function stronglyConnectedComponents(files, adjacency, reverse) {
  const visited = new Set();
  const finishOrder = [];
  for (const start of files) {
    if (visited.has(start)) continue;
    const stack = [{ node: start, index: 0 }];
    visited.add(start);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const outgoing = adjacency.get(frame.node) ?? [];
      if (frame.index < outgoing.length) {
        const next = outgoing[frame.index].to;
        frame.index += 1;
        if (!visited.has(next)) {
          visited.add(next);
          stack.push({ node: next, index: 0 });
        }
      } else {
        finishOrder.push(frame.node);
        stack.pop();
      }
    }
  }

  const assigned = new Set();
  const components = [];
  for (let index = finishOrder.length - 1; index >= 0; index -= 1) {
    const start = finishOrder[index];
    if (assigned.has(start)) continue;
    const component = [];
    const stack = [start];
    assigned.add(start);
    while (stack.length > 0) {
      const node = stack.pop();
      component.push(node);
      for (const edge of reverse.get(node) ?? []) {
        if (!assigned.has(edge.from)) {
          assigned.add(edge.from);
          stack.push(edge.from);
        }
      }
    }
    components.push(component);
  }
  return components;
}

/** Kürzester Zyklus innerhalb einer SCC; annotiert jede Kante als value/type. */
function shortestCycle(component, adjacency) {
  const members = new Set(component);
  const local = new Map();
  for (const node of component) {
    local.set(node, (adjacency.get(node) ?? []).filter((edge) => members.has(edge.to)));
  }
  let best = null;

  const consider = (path) => {
    if (
      !best ||
      path.length < best.length ||
      (path.length === best.length && path.map((node) => pathLabel(node)).join('\0') < best.map((node) => pathLabel(node)).join('\0'))
    ) {
      best = path;
    }
  };

  for (const start of component) {
    for (const first of local.get(start) ?? []) {
      if (first.to === start) {
        consider([start, start]);
        continue;
      }
      const previous = new Map([[first.to, null]]);
      const queue = [first.to];
      let found = false;
      while (queue.length > 0 && !found) {
        const current = queue.shift();
        for (const edge of local.get(current) ?? []) {
          if (edge.to === start) {
            const path = [start];
            const reversed = [];
            let node = current;
            while (node !== null) {
              reversed.push(node);
              node = previous.get(node) ?? null;
            }
            path.push(...reversed.reverse(), start);
            consider(path);
            found = true;
            break;
          }
          if (!previous.has(edge.to)) {
            previous.set(edge.to, current);
            queue.push(edge.to);
          }
        }
      }
    }
  }
  return best;
}

function pathLabel(absolute) {
  const relative = path.relative(DEFAULT_SRC_ROOT, absolute).replaceAll(path.sep, '/');
  return relative.startsWith('..') ? absolute.replaceAll(path.sep, '/') : relative;
}

function collectCycles(components, adjacency, files) {
  const cycles = [];
  for (const component of components) {
    const members = new Set(component);
    const isCycle = component.length > 1 || (adjacency.get(component[0]) ?? []).some((edge) => members.has(edge.to));
    if (!isCycle) continue;
    const internalEdges = [];
    for (const node of component) {
      for (const edge of adjacency.get(node) ?? []) {
        if (members.has(edge.to)) internalEdges.push(edge);
      }
    }
    cycles.push({
      members: component.slice().sort(),
      size: component.length,
      internalEdges,
      valueEdges: internalEdges.filter((edge) => edge.kind === 'value'),
      shortest: shortestCycle(component, adjacency),
    });
  }
  return cycles;
}

function edgeKind(adjacency, from, to) {
  const edge = (adjacency.get(from) ?? []).find((candidate) => candidate.to === to);
  return edge?.kind === 'value' ? 'value' : 'type';
}

function describePath(adjacency, cycle) {
  if (!cycle) return '<kein Pfad>';
  const parts = [];
  for (let index = 0; index < cycle.length; index += 1) {
    const node = cycle[index];
    if (index === 0) parts.push(pathLabel(node));
    else parts.push(`${edgeKind(adjacency, cycle[index - 1], node) === 'value' ? '--value-->' : '--type-->'} ${pathLabel(node)}`);
  }
  return parts.join(' ');
}

async function main() {
  const { root, maxPrint } = parseArgs(process.argv.slice(2));
  if (!existsSync(root)) {
    console.error(`[import-cycle-smoke] source root not found: ${root}`);
    process.exitCode = 2;
    return;
  }

  const graph = buildGraph(root);
  const allComponents = stronglyConnectedComponents(graph.files, graph.adjacency, graph.reverse);
  const valueComponents = stronglyConnectedComponents(graph.files, graph.valueAdjacency, graph.valueReverse);
  const sourceCycles = collectCycles(allComponents, graph.adjacency, graph.files);
  // Nur ein Zyklus, der **ausschließlich** aus Wert-Kanten besteht, überlebt den Build und
  // kann die Rollup-Reihenfolge/TDZ auslösen. Eine Typ-Kante im Zyklus wird entfernt und
  // unterbricht den Laufzeit-Zyklus (mixed source cycle = harmlos).
  const valueCycles = collectCycles(valueComponents, graph.valueAdjacency, graph.files);
  const valueKeys = new Set(valueCycles.map((cycle) => cycle.members.join('\u0000')));
  const pureTypeCycles = sourceCycles.filter((cycle) => cycle.internalEdges.every((edge) => edge.kind === 'type'));
  const mixedCycles = sourceCycles.filter(
    (cycle) => !cycle.internalEdges.every((edge) => edge.kind === 'type') && !valueKeys.has(cycle.members.join('\u0000')),
  );

  console.log(`[import-cycle-smoke] root: ${root}`);
  console.log(`[import-cycle-smoke] files: ${graph.files.length}; relative import edges: ${graph.parsedEdges}; unique pairs: ${graph.edges.length}`);
  console.log(
    `[import-cycle-smoke] SCC cycles (all edges): ${sourceCycles.length} (value: ${valueCycles.length}, ` +
    `mixed source: ${mixedCycles.length}, pure type: ${pureTypeCycles.length})`,
  );

  const printCycle = (cycle, index, label, adjacency) => {
    console.log(
      `[import-cycle-smoke] ${label} #${index + 1} ` +
      `length=${cycle.size} nodes=[${cycle.members.map(pathLabel).join(', ')}]`,
    );
    console.log(`[import-cycle-smoke]   path: ${describePath(adjacency, cycle.shortest)}`);
  };

  valueCycles.forEach((cycle, index) => printCycle(cycle, index, 'VALUE CYCLE', graph.valueAdjacency));
  mixedCycles.slice(0, Math.max(0, maxPrint)).forEach((cycle, index) => {
    printCycle(cycle, index, 'mixed source cycle (type edge breaks runtime cycle)', graph.adjacency);
  });
  if (mixedCycles.length > maxPrint) {
    console.log(`[import-cycle-smoke] ... ${mixedCycles.length - maxPrint} weitere mixed source cycles nicht gedruckt (--max-print erhöhen)`);
  }
  pureTypeCycles.slice(0, Math.max(0, maxPrint)).forEach((cycle, index) => {
    printCycle(cycle, index, 'type-only cycle', graph.adjacency);
  });
  if (pureTypeCycles.length > maxPrint) {
    console.log(`[import-cycle-smoke] ... ${pureTypeCycles.length - maxPrint} weitere type-only Zyklen nicht gedruckt (--max-print erhöhen)`);
  }

  if (valueCycles.length > 0) {
    console.error(`[import-cycle-smoke] RESULT: FAIL (${valueCycles.length} Wert-Zyklus/-Zyklen; TDZ-Risiko im Rollup-Bundle)`);
    process.exitCode = 1;
    return;
  }
  console.log('[import-cycle-smoke] RESULT: PASS (keine Wert-Zyklen; mixed/type-only Zyklen sind build-harmlos)');
}

await main();
