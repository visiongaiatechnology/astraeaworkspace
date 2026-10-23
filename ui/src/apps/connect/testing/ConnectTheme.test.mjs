// STATUS: PLATIN — theme regression contract for Connect-owned workspace chrome.
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('../components/connectTheme.css');
const view = read('../components/ConnectView.tsx');
const sidebar = read('../components/ConnectSidebar.tsx');
const mailList = read('../components/ConnectMailList.tsx');
const mailViewer = read('../components/ConnectMailViewer.tsx');
const calendar = read('../components/ConnectCalendarView.tsx');
const contacts = read('../components/ConnectContactsView.tsx');
const rules = [];
postcss.parse(css).walkRules((rule) => rules.push(rule));

describe('Connect Workspace theme contract', () => {
  it('scopes module chrome to Connect and maps fixed legacy surfaces to Workspace tokens', () => {
    expect(rules.length).toBeGreaterThan(10);
    for (const rule of rules) expect(rule.selector).toContain('[data-vgt-connect-root="true"]');
    expect(view).toContain("import './connectTheme.css';");
    expect(view).toContain('data-vgt-connect-root="true"');
    expect(css).toContain('background-color: var(--vgt-surface-z0');
    expect(css).toContain('background-color: var(--vgt-surface-z1');
    expect(css).toContain('background-color: var(--vgt-surface-z2');
    expect(css).toContain('background-color: var(--vgt-control-surface');
    expect(css).toContain('color: var(--vgt-accent-strong');
    expect(css).toContain('background-color: var(--vgt-accent-solid');
  });

  it('covers all Connect panes and adapts selected states, gradients, controls and focus', () => {
    expect(sidebar).toContain('viewMode ===');
    expect(mailList).toContain('isSelected');
    expect(mailViewer).toContain('data-connect-thread-latest="expanded"');
    expect(calendar).toContain('Connect Calendar');
    expect(contacts).toContain('Connect Contacts');
    expect(css).toContain('button[class*="from-purple-"]');
    expect(css).toContain('var(--vgt-control-primary-bg');
    expect(css).toContain('var(--vgt-control-primary-text');
    expect(css).toContain('var(--vgt-control-hover');
    expect(css).toContain('var(--vgt-focus');
    expect(css).toContain(':focus-visible');
  });

  it('stacks Connect panes and bounds the mail list at maximum Workspace scale', () => {
    const maxScaleRoot = rules.find((rule) => rule.selector === ':root[data-astraea-scale-band="maximum"] [data-vgt-connect-root="true"]');
    const mailList = rules.find((rule) => rule.selector === ':root[data-astraea-scale-band="maximum"] [data-vgt-connect-root="true"] > .w-80');
    expect(maxScaleRoot).toBeDefined();
    expect(maxScaleRoot.nodes.map((node) => node.toString()).join(' ')).toContain('flex-direction: column');
    expect(maxScaleRoot.nodes.map((node) => node.toString()).join(' ')).toContain('overflow: visible');
    expect(mailList).toBeDefined();
    expect(mailList.nodes.map((node) => node.toString()).join(' ')).toContain('max-block-size: 55vh');
    expect(css).toContain('> [role="toolbar"]');
  });

  it('keeps encrypted, verified, warning and destructive status colors semantic', () => {
    expect(sidebar).toContain('text-emerald-400');
    expect(mailViewer).toContain('text-emerald-400');
    expect(mailViewer).toContain('text-amber-300');
    expect(mailViewer).toContain('text-rose-200');
    expect(css).not.toContain('[class*="text-emerald-"]');
    expect(css).not.toContain('[class*="text-amber-"]');
    expect(css).not.toContain('[class*="text-rose-"]');
  });
});
