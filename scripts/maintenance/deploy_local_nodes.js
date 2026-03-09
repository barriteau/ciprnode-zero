/**
 * @file scripts/deploy_local_nodes.js
 * @description Deploys the built Windows executable and assets to local test nodes.
 *              PRESERVES: .env, ciprnode.toml, /data/
 */

import { copy, ensureDir, exists } from 'jsr:@std/fs';
import { join } from 'jsr:@std/path';

const CIPR_NODES_ROOT = 'D:\\Proyectos_VSCode\\Cipr\\ciprnodes';
const DIST_ARTEFACT = 'dist/ciprnode-zero-win-x64.zip';
const TEMP_EXTRACT_DIR = 'dist/temp_extract';

const SW_PATH = 'public/sw.js';

/**
 * Patches the CACHE_NAME constant in sw.js with a timestamp-based value.
 * Format: ciprface-YYYYMMDDHHMMSS
 */
const patchSwCacheName = async () => {
  const now = new Date();
  const ts = now.toISOString().replace(/[-T:.Z]/g, '').slice(0, 14); // YYYYMMDDHHmmss
  const cacheName = `ciprface-${ts}`;
  const src = await Deno.readTextFile(SW_PATH);
  const patched = src.replace(/const CACHE_NAME = '[^']*'/, `const CACHE_NAME = '${cacheName}'`);
  await Deno.writeTextFile(SW_PATH, patched);
  console.log(`  CACHE_NAME set to: ${cacheName}`);
};

const main = async () => {
  console.log('Starting Local Deployment...');

  // 0. Patch sw.js cache name with a fresh timestamp
  console.log('Patching service worker cache name...');
  await patchSwCacheName();

  // 1. Always Build (Ensure latest code)
  console.log('Building project...');
  const buildCmd = new Deno.Command(Deno.execPath(), {
    args: ['task', 'build'],
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const status = await buildCmd.output();
  if (!status.success) {
    console.error('Build Failed!');
    Deno.exit(1);
  }

  // 2. Extract Artifact
  console.log('Extracting artifact...');
  try {
    await Deno.remove(TEMP_EXTRACT_DIR, { recursive: true });
  } catch {}
  await ensureDir(TEMP_EXTRACT_DIR);

  // Use tar to extract zip (Windows tar supports -xf)
  const tarCmd = new Deno.Command('tar', {
    args: ['-xf', DIST_ARTEFACT, '-C', TEMP_EXTRACT_DIR],
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const tarStatus = await tarCmd.output();
  if (!tarStatus.success) {
    console.error('Extraction Failed! (tar)');
    Deno.exit(1);
  }

  // ZIP structure: ciprnode-zero-win-x64.zip -> ciprnode-zero/ -> contents
  const sourceDir = join(TEMP_EXTRACT_DIR, 'ciprnode-zero');

  // 3. Iterate Nodes
  const nodesDir = Deno.readDir(CIPR_NODES_ROOT);
  for await (const entry of nodesDir) {
    if (entry.isDirectory) {
      const targetDir = join(CIPR_NODES_ROOT, entry.name);
      console.log(`\nDeploying to: ${entry.name}...`);
      await deployToNode(sourceDir, targetDir);
    }
  }

  // Cleanup
  try {
    await Deno.remove(TEMP_EXTRACT_DIR, { recursive: true });
  } catch {}

  console.log('\nDeployment Complete!');
};

const deployToNode = async (source, target) => {
  // Sync Logic: Copy overwrite everything EXCEPT ignored list.
  const files = Deno.readDir(source);
  for await (const file of files) {
    const srcPath = join(source, file.name);
    const destPath = join(target, file.name);

    // IGNORE LIST
    if (file.name === 'ciprnode.toml' || file.name === '.env') {
      // Check existence at dest. If they have a live config/env, don't overwrite it!
      if (await exists(destPath)) {
        console.log(`  Skipping config: ${file.name}`);
        continue;
      }
    }
    if (file.name === 'data') {
      // Check existence at dest
      if (await exists(destPath)) {
        console.log(`  Skipping data dir: ${file.name}`);
        continue;
      }
    }

    // Copy (Overwrite)
    // console.log(`  Copying ${file.name}...`);
    await copy(srcPath, destPath, { overwrite: true });
  }
};

if (import.meta.main) {
  main();
}
