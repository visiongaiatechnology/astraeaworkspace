import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const contractsSource = readFileSync(fileURLToPath(new URL('./contracts.ts', import.meta.url)), 'utf8');

it('keeps edition contracts independent from the aggregate Workspace schema barrel', () => {
  expect(contractsSource).toContain("../shared/contracts/documentKind");
  expect(contractsSource).not.toContain("../shared/contracts/workspace'");
});
