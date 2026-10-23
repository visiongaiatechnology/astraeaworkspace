#!/usr/bin/env node
/**
 * Release 0.1 security lint (SAST-lite) for the UI renderer.
 *
 * Scope: production UI sources only (`ui/src`, excluding tests/testing dirs). It fails on new raw
 * HTML/code-execution sinks so the VGT-014 finding cannot silently return. The two reviewed print
 * paths are allowlisted because they escape every interpolated value (see the VGT-100 report and the
 * securityHardening contract test). This is a targeted guard, not a full SAST replacement.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '..', '..');
const uiSource = path.join(repoRoot, 'ui', 'src');
const allowlistPath = path.join(scriptDirectory, 'static-scan-allowlist.json');

const allowlist = new Map(
  JSON.parse(readFileSync(allowlistPath, 'utf8')).entries.map((entry) => [entry.path, entry.reason]),
);

const SINKS = [
  { id: 'dangerouslySetInnerHTML', pattern: /dangerouslySetInnerHTML/u },
  { id: 'innerHTML-assignment', pattern: /\.innerHTML\s*=/u },
  { id: 'insertAdjacentHTML', pattern: /insertAdjacentHTML/u },
  { id: 'document.write', pattern: /document\.write\s*\(/u },
  { id: 'eval', pattern: /(?<![.\w$])eval\s*\(/u },
  { id: 'new-Function', pattern: /new\s+Function\s*\(/u },
];

const findings = [];
const walk = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'testing', 'tests', '__snapshots__'].includes(entry.name)) continue;
      walk(absolute);
      continue;
    }
    if (!/\.(?:ts|tsx|js|mjs)$/u.test(entry.name)) continue;
    const relative = path.relative(repoRoot, absolute).split(path.sep).join('/');
    if (/\.test\.[^/]+$/u.test(relative)) continue;
    const lines = readFileSync(absolute, 'utf8').split(/\r?\n/u);
    lines.forEach((line, index) => {
      // Comments cannot execute; skip pure comment and block-comment body lines.
      if (/^\s*(?:\/\/|\*|\/\*)/u.test(line)) return;
      for (const sink of SINKS) {
        if (!sink.pattern.test(line)) continue;
        findings.push({ path: relative, line: index + 1, sink: sink.id, text: line.trim().slice(0, 160) });
      }
    });
  }
};

walk(uiSource);

const unallowlisted = findings.filter((finding) => {
  if (!allowlist.has(finding.path)) return true;
  // Allowlist is per file AND per sink id: a new sink in an allowlisted file still fails.
  const reason = allowlist.get(finding.path);
  return !reason.includes(`sink:${finding.sink}`);
});

const allowlistedHits = findings.length - unallowlisted.length;
console.log(`[security:static] scanned production UI sources (${uiSource})`);
console.log(`[security:static] findings: ${findings.length} (allowlisted reviewed: ${allowlistedHits}, blocking: ${unallowlisted.length})`);
for (const finding of unallowlisted) {
  console.error(`BLOCKING ${finding.path}:${finding.line} [${finding.sink}] ${finding.text}`);
}
if (unallowlisted.length > 0) {
  console.error('[security:static] RESULT: FAIL — new unchecked HTML/code-execution sink(s). Review, fix, or add a justified allowlist entry.');
  process.exit(1);
}
console.log('[security:static] RESULT: PASS — no unallowlisted raw HTML/code-execution sinks in production UI sources.');
