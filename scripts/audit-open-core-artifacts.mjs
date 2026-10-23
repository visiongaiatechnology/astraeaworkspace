// STATUS: PLATIN — Fail-closed known-module artifact gate; source export remains a separate gate.
import { readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(workspaceRoot, 'ui', 'dist', 'open-core', 'assets');
const forbiddenModuleStems = Object.freeze([
  'FormsDatabase',
  'WorkManagement',
  'GaiaComVault',
  'gaiaComLocalTransport',
  'spaceModel',
  'spaceAccessPolicyEngine',
  'projectCriticalPathEngine',
  'DatabaseTableView',
  'DatabaseSchemaView',
  'KanbanPlannerView',
  'ProjectsTimelineView',
  'TeamSpacesTab',
  'GaiaComBridgeTab',
  'GaiaComAdvancedModal',
]);

function isWithinRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative.length > 0 && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function main() {
  const resolvedRoot = await realpath(workspaceRoot);
  const resolvedOutput = await realpath(outputDirectory);
  if (!isWithinRoot(resolvedRoot, resolvedOutput)) {
    throw new Error('Open-Core artifact directory escaped the workspace root.');
  }

  const entries = await readdir(resolvedOutput, { withFileTypes: true });
  const assets = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.js'));
  if (assets.length === 0) {
    throw new Error('Open-Core asset directory is empty; build it before auditing.');
  }

  const leaks = assets
    .map((asset) => asset.name)
    .filter((assetName) => forbiddenModuleStems.some((stem) => assetName.startsWith(`${stem}-`)));

  if (leaks.length > 0) {
    console.error('FAIL: Premium or mixed implementation chunks are present in the Open-Core build:');
    for (const assetName of leaks) console.error(`- ${assetName}`);
    process.exitCode = 1;
    return;
  }

  console.log(`PASS: ${assets.length} Open-Core JavaScript assets contain no known Premium implementation chunks.`);
  console.log('Source-tree isolation must be audited separately; this check covers built asset names only.');
}

main().catch((error) => {
  console.error('ERROR: Open-Core artifact audit could not complete.');
  console.error(error instanceof Error ? error.message : 'Unknown audit failure.');
  process.exitCode = 2;
});
