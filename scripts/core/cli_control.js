/**
 * @file scripts/cli_control.js
 * @description Controls the running Ciprnode instance (Stop/Restart helpers).
 */

import { join } from '@std/path';
import { exists } from '@std/fs';

const PID_FILE = join(Deno.cwd(), 'data', 'ciprnode.pid');

async function getPid() {
  if (await exists(PID_FILE)) {
    try {
      const txt = await Deno.readTextFile(PID_FILE);
      return parseInt(txt.trim(), 10);
    } catch {
      return null;
    }
  }
  return null;
}

async function stop() {
  const pid = await getPid();
  if (!pid) {
    console.log('No running Ciprnode found (no PID file).');
    return;
  }

  console.log(`Stopping Ciprnode (PID: ${pid})...`);
  try {
    Deno.kill(pid, 'SIGINT'); // Try graceful first
    // Wait and check?
    await new Promise((r) => setTimeout(r, 1000));
    // If still exists? Deno.kill doesn't throw if successful, throws if ESRCH
  } catch (_e) {
    // If process not found, it's already dead
    console.log('Process already stopped or not found.');
  }

  try {
    await Deno.remove(PID_FILE);
  } catch { /* ignore */ }

  console.log('Ciprnode stopped.');
}

const action = Deno.args[0];

if (action === 'stop') {
  await stop();
} else {
  console.log('Usage: deno run -A scripts/cli_control.js stop');
}
