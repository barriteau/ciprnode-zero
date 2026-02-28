/**
 * @file scripts/launch_terminal.js
 * @description Launches Windows Terminal with 8 split panes in a 2x4 grid for the local ciprnodes.
 */

import { join } from 'jsr:@std/path';

const CIPR_NODES_ROOT = 'D:\\Proyectos_VSCode\\Cipr\\ciprnodes';

const main = async () => {
  console.log('Preparing 2x4 Grid Layout for Ciprnodes...');

  const nodesDir = Deno.readDir(CIPR_NODES_ROOT);
  const nodes = [];
  for await (const entry of nodesDir) {
    if (entry.isDirectory) {
      nodes.push(join(CIPR_NODES_ROOT, entry.name));
    }
  }

  // Ensure we have exactly 8 or handle whatever we find
  if (nodes.length === 0) {
    console.error('No nodes found in ' + CIPR_NODES_ROOT);
    Deno.exit(1);
  }

  // Sort nodes alphabetically for consistent layout
  nodes.sort();

  console.log(`Found ${nodes.length} nodes.`);

  if (nodes.length < 8) {
    console.warn('Verify Warning: Less than 8 nodes found. Grid logic might be partial.');
  }

  // Define the 8 nodes (or undefined if <8)
  const [N0, N1, N2, N3, N4, N5, N6, N7] = nodes;

  // Left Col: N0, N1, N2, N3
  // Right Col: N4, N5, N6, N7

  const args = ['-w', '0'];

  // 1. Start (N0) - creates the Tab.
  args.push('new-tab', '-d', N0 || '.');
  args.push('--title', 'CiprNodes Grid');

  // ROOT: [ N0 ]

  // 2. Main Vertical Split (Left/Right Cols) -> [ Left ] [ Right ]
  if (N4) {
    args.push(';', 'split-pane', '-V', '-d', N4);
    // Focus: Right (N4)
  }

  // --- PROCESS RIGHT COLUMN ---
  // We use the `--size` (-s) parameter to precisely cut the remaining space.
  // This completely eliminates the need for buggy `move-focus up/down` chains.
  if (N5) {
    args.push(';', 'split-pane', '-H', '-s', '0.75', '-d', N5);
  }
  if (N6) {
    args.push(';', 'split-pane', '-H', '-s', '0.666', '-d', N6);
  }
  if (N7) {
    args.push(';', 'split-pane', '-H', '-s', '0.5', '-d', N7);
  }

  // --- MOVE TO LEFT COLUMN ---
  // Moving left from anywhere on the right will cleanly land in the left full pane.
  args.push(';', 'move-focus', 'left');

  // --- PROCESS LEFT COLUMN ---
  if (N1) {
    args.push(';', 'split-pane', '-H', '-s', '0.75', '-d', N1);
  }
  if (N2) {
    args.push(';', 'split-pane', '-H', '-s', '0.666', '-d', N2);
  }
  if (N3) {
    args.push(';', 'split-pane', '-H', '-s', '0.5', '-d', N3);
  }

  console.log('Launching Windows Terminal (2x4 Grid)...');

  // Use a detached spawn so Deno doesn't hang waiting for stdout/stderr of the GUI tool.
  try {
    const cmd = new Deno.Command('wt', {
      args: args,
      stdout: 'null',
      stderr: 'null',
      stdin: 'null',
    });

    const child = cmd.spawn();
    child.unref();

    console.log('Terminal layout dispatched. You may close this window.');
    // Force exit after a tiny delay so the spawn goes through cleanly
    setTimeout(() => Deno.exit(0), 100);
  } catch (error) {
    console.error('Failed to launch Windows Terminal:', error.message);
    Deno.exit(1);
  }
};

if (import.meta.main) {
  main();
}
