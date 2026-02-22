import { loadConfig } from '../src/core/config.js';

async function diagnose() {
  console.log('DNS Diagnostic Tool');
  console.log('-------------------');

  try {
    const config = await loadConfig();
    const hostname = `ciprnode.${config.za}`;
    console.log(`Target: ${hostname}`);

    const resolvers = [
      { name: 'System', opts: undefined },
      { name: 'Cloudflare (1.1.1.1)', opts: { nameServer: { ipAddr: '1.1.1.1', port: 53 } } },
      { name: 'Google (8.8.8.8)', opts: { nameServer: { ipAddr: '8.8.8.8', port: 53 } } },
    ];

    for (const res of resolvers) {
      console.log(`\n--- Using Resolver: ${res.name} ---`);
      try {
        const a = await Deno.resolveDns(hostname, 'A', res.opts);
        console.log(`[OK] A Record found:`, a);
      } catch (e) {
        console.log(`[MISS] A Record check: ${e.message}`);
      }

      try {
        const aaaa = await Deno.resolveDns(hostname, 'AAAA', res.opts);
        console.log(`[OK] AAAA Record found:`, aaaa);
      } catch (e) {
        console.log(`[MISS] AAAA Record check: ${e.message}`);
      }

      try {
        const cname = await Deno.resolveDns(hostname, 'CNAME', res.opts);
        console.log(`[OK] CNAME Record found:`, cname);
      } catch (e) {
        console.log(`[MISS] CNAME Record check: ${e.message}`);
      }

      try {
        const txt = await Deno.resolveDns(hostname, 'TXT', res.opts);
        console.log(`[OK] TXT Record found on hostname:`, txt);
      } catch (e) {
        console.log(`[MISS] TXT Record check on hostname: ${e.message}`);
      }
    }

    console.log(`\n-------------------`);
    console.log(`\n3. Resolving 'TXT' record (Identity)...`);
    try {
      const txtRecords = await Deno.resolveDns(`_cipr.${config.za}`, 'TXT');
      console.log(`[SUCCESS] TXT Records:`, txtRecords);
    } catch (e) {
      console.error(`[FAIL] TXT Record resolution failed: ${e.message}`);
    }
  } catch (e) {
    console.error('Configuration load failed:', e.message);
  }
}

if (import.meta.main) {
  diagnose();
}
