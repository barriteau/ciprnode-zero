import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { loadConfig } from '../src/core/config.js';

Deno.test('loadConfig - loads default or existing', async () => {
  // This will likely load the actual ciprnode.toml if running from root
  const config = await loadConfig();
  assertExists(config);
  assertExists(config.dns);
  assertEquals(typeof config.port, 'number');
});
