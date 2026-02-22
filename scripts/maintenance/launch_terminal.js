/**
 * @file scripts/launch_terminal.js
 * @description Launches Windows Terminal with 8 split panes in a 2x4 grid for the local ciprnodes.
 */

import { join } from 'jsr:@std/path';

const CIPR_NODES_ROOT = 'D:\\Proyectos_VSCode\\Cipr\\ciprnodes';

async function main() {
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
  // Right side gets N4.
  // User Requested: "split vertically only once, to create the two main columns"
  if (N4) {
    args.push(';', 'split-pane', '-V', '-d', N4);
    // Focus: Right (N4)
  }

  // WE NOW HAVE 2 COLUMNS. WE MUST SPLIT THEM INDEPENDENTLY.

  // --- PROCESS RIGHT COLUMN (N4, N5, N6, N7) ---
  // User Requested: "split horizontally inside every column"

  // Current: [ N4 ] (Full Height Right Column)
  // Split Right Col in Half (Top/Bottom) -> Top: N4, Bot: N6.
  if (N6) {
    args.push(';', 'split-pane', '-H', '-d', N6);
    // Focus: Bot Right (N6)
  }

  // Split Bot Right (N6) in Half -> Top: N6, Bot: N7.
  if (N7) {
    args.push(';', 'split-pane', '-H', '-d', N7);
    // Focus: Bot Bot Right (N7)
  }

  // Move Focus Up to Top Right (N4)
  // Path: N7 -> N6 -> N4
  args.push(';', 'move-focus', 'up'); // to N6
  args.push(';', 'move-focus', 'up'); // to N4

  // Split Top Right (N4) in Half -> Top: N4, Bot: N5.
  if (N5) {
    args.push(';', 'split-pane', '-H', '-d', N5);
    // Focus: N5.
  }

  // Right Col Done: N4, N5, N6, N7 stacked vertically.

  // --- PROCESS LEFT COLUMN (N0, N1, N2, N3) ---
  // Move Focus: Left to get to Left Col.
  args.push(';', 'move-focus', 'left');

  // Current: [ N0 ] (Full Height Left)
  // Split Left Col in Half -> Top: N0, Bot: N2.
  if (N2) {
    args.push(';', 'split-pane', '-H', '-d', N2);
    // Focus: Bot Left (N2)
  }

  // Split Bot Left (N2) in Half -> Top: N2, Bot: N3.
  if (N3) {
    args.push(';', 'split-pane', '-H', '-d', N3);
    // Focus: Bot Bot Left (N3)
  }

  // Move Focus Up to Top Left (N0)
  // Path: N3 -> N2 -> N0
  args.push(';', 'move-focus', 'up'); // to N2
  args.push(';', 'move-focus', 'up'); // to N0

  // Split Top Left (N0) in Half -> Top: N0, Bot: N1.
  if (N1) {
    args.push(';', 'split-pane', '-H', '-d', N1);
    // Focus: N1.
  }

  // Left Col Done: N0, N1, N2, N3 stacked vertically.

  console.log('Launching Windows Terminal (2x4 Grid)...');
  // console.log("Command:", "wt", ...args);

  const cmd = new Deno.Command('wt', {
    args: args,
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const status = await cmd.output();
  if (!status.success) {
    console.error('Failed to launch Windows Terminal.');
  } else {
    console.log('Terminal launched.');
  }
}

if (import.meta.main) {
  main();
}
