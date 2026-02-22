import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { verifyCiprHash } from '../src/core/dns.js';

Deno.test('verifyCiprHash - fails with missing config', async () => {
  const result = await verifyCiprHash({ dns: {} }, 'example.com', 'hash');
  assert(!result);
});
