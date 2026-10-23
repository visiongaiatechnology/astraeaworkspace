// @vitest-environment happy-dom
// STATUS: PLATIN — Release 0.1: Wächter für die in der VGT-100-Runde behobenen Befunde.
//
// FIND-007 (CSP-Loopback-Origin), FIND-008 (mutierbare Action-Tags), VGT-051/052 (Dependency-Policy/
// SBOM) und VGT-014 (keine ungeprüften HTML-Sinks) waren reale Auditbefunde. Ohne Regressionstest
// können sie beim nächsten Konfigurations-Edit lautlos zurückkehren — genau die Fehlerart, die der
// Release-Audit als "behoben behauptet, nicht bewacht" markieren würde.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildTaskPrintDocument } from '../../apps/tasks/interchange/taskPrintExport';

function findRepoRoot(startDirectory: string): string {
  let current = startDirectory;
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(path.join(current, 'Cargo.toml')) && existsSync(path.join(current, 'crates'))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error('Repository root (Cargo.toml + crates/) not found');
}

const repoRoot = findRepoRoot(process.cwd());
const tauriConfig = JSON.parse(readFileSync(path.join(repoRoot, 'crates/vgt-desktop/tauri.conf.json'), 'utf8')) as {
  app: { security: { csp: string } };
};

describe('Release 0.1 security hardening contract (VGT audit findings)', () => {
  it('keeps the production CSP free of loopback/remote origins while keeping the required deny directives', () => {
    const csp = tauriConfig.app.security.csp;
    // FIND-007: the CSP once allowed http://127.0.0.1:5042 although only the unshipped dev CLI uses it.
    expect(csp).not.toMatch(/127\.0\.0\.1|https?:\/\/localhost|ws:|wss:/u);
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("'unsafe-eval'");
    for (const directive of ["object-src 'none'", "base-uri 'none'", "frame-src 'none'", "form-action 'none'", "frame-ancestors 'none'"]) {
      expect(csp, `CSP must keep ${directive}`).toContain(directive);
    }
    expect(csp).toMatch(/connect-src 'self' ipc: http:\/\/ipc\.localhost/u);
  });

  it('pins every CI action to an immutable commit SHA and keeps the workflow least-privileged', () => {
    const workflow = readFileSync(path.join(repoRoot, '.github/workflows/open-core.yml'), 'utf8');
    const usesLines = workflow.split(/\r?\n/u).filter((line) => /^\s*-?\s*uses:/u.test(line));
    expect(usesLines.length).toBeGreaterThanOrEqual(4);
    for (const line of usesLines) {
      const match = line.match(/uses:\s*([^#\s]+)/u);
      expect(match, `uses line has no reference: ${line}`).not.toBeNull();
      const ref = match![1]!;
      // Local actions ("./…") carry their own code in this repository; remote actions must be SHA-pinned.
      if (ref.startsWith('./')) continue;
      expect(ref, `FIND-008 regression: ${ref} is not pinned to a 40-hex commit`).toMatch(/@[0-9a-f]{40}$/u);
    }
    expect(workflow).toMatch(/permissions:\s*\r?\n\s*contents:\s*read/u);
    expect(workflow).not.toMatch(/\$\{\{\s*secrets\./u);
  });

  it('keeps the dependency/advisory policy and the local SBOM inventories in place', () => {
    const deny = readFileSync(path.join(repoRoot, 'deny.toml'), 'utf8');
    expect(deny).toMatch(/\[advisories\]/u);
    expect(deny).toMatch(/\[licenses\]/u);
    expect(deny).toMatch(/\[sources\][\s\S]*unknown-registry\s*=\s*"deny"/u);
    expect(deny).toContain('RUSTSEC-2024-0370');

    for (const [file, format] of [
      ['audit/sbom-cargo.json', 'astraea.sbom.cargo/1'],
      ['audit/sbom-npm.json', 'astraea.sbom.npm/1'],
    ] as const) {
      const sbom = JSON.parse(readFileSync(path.join(repoRoot, file), 'utf8')) as { format: string; packageCount: number };
      expect(sbom.format).toBe(format);
      expect(sbom.packageCount).toBeGreaterThan(100);
    }
  });

  it('escapes untrusted print content instead of writing it as raw HTML (VGT-014)', () => {
    const documentHtml = buildTaskPrintDocument(
      [{
        id: 'task<script>', title: '<img src=x onerror=alert(1)>', status: 'todo', priority: 'high',
        dueDate: '" onmouseover="alert(1)', assignee: "O'Brien & Co", tags: ['<script>alert(1)</script>'],
        completed: false,
      } as never],
      'Titel <script>alert(1)</script>',
    );
    expect(documentHtml).not.toContain('<script>');
    expect(documentHtml).not.toContain('<img src=x');
    expect(documentHtml).toContain('&lt;script&gt;');
    expect(documentHtml).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('keeps production code free of unescaped HTML injection sinks outside the reviewed print path', () => {
    const roots = [path.join(repoRoot, 'ui/src')];
    const offenders: string[] = [];
    const allowlisted = new Set([
      'ui/src/apps/notes/interchange/notesCanvasPrint.ts',
      'ui/src/apps/tasks/interchange/taskPrintExport.ts',
    ]);
    const sink = /dangerouslySetInnerHTML|\.innerHTML\s*=|document\.write\(|insertAdjacentHTML|eval\(|new Function\(/u;
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === 'dist') continue;
          walk(absolute);
          continue;
        }
        if (!/\.(?:ts|tsx|js|mjs)$/u.test(entry.name)) continue;
        const relative = path.relative(repoRoot, absolute).split(path.sep).join('/');
        if (allowlisted.has(relative)) continue;
        if (/(?:^|\/)(?:testing|tests)\//u.test(relative) || /\.test\.[^/]+$/u.test(relative)) continue;
        const code = readFileSync(absolute, 'utf8')
          // comments cannot execute; only count real code lines
          .split(/\r?\n/u)
          .filter((line) => !/^\s*(?:\/\/|\*|\/\*)/u.test(line));
        if (code.some((line) => sink.test(line))) offenders.push(relative);
      }
    };
    roots.forEach(walk);
    expect(offenders).toEqual([]);
  });
});
