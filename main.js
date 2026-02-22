/**
 * @file main.js
 * @description Main entry point for Ciprnode zero
 */

import { loadConfig } from './src/core/config.js';
import { getDbConnection } from './src/db/client.js';
import { initSchema } from './src/db/schema.js';
import { startServer } from './src/api/server.js';
// import { startBot } from './src/bot/agent.js'; // Removed
import { logKeyValueTable, setupConsoleLogging } from './src/core/logger.js';
// import { createSha256Hash } from './src/core/crypto.js'; // Replaced by generateCiprHash
import { getEntry, insertEntry } from './src/db/repo.js';

// :: Initialize Console Patching (File Persistence)
setupConsoleLogging();
import { verifyCiprHash } from './src/core/dns.js';
import { initialSync } from './src/core/sync.js';
import { generateCiprHash } from './src/core/utils.js';

if (import.meta.main) {
  try {
    // PID Management
    const pidPath = './data/ciprnode.pid';
    try {
      await Deno.writeTextFile(pidPath, String(Deno.pid));
    } catch { /* ignore */ }

    // Cleanup on exit
    const cleanup = () => {
      try {
        Deno.removeSync(pidPath);
      } catch { /* ignore */ }
      Deno.exit();
    };
    // Deno.addSignalListener is not supported on Windows for SIGINT in older versions, but
    // Deno.addSignalListener("SIGINT", ...) works in recent Deno. However, for broad compat,
    // we rely on the fact that if we are killed, we might not clean up. Ideally we catch SIGINT.
    try {
      Deno.addSignalListener('SIGINT', cleanup);
      // Deno.addSignalListener('SIGTERM', cleanup); // Windows often doesn't support SIGTERM listener
    } catch { /* Fallback or ignore if not supported (e.g. Windows limitation) */ }

    const sequenceStart = performance.now();

    console.log(`
░█▀█ ░▀ ░█▀█ ░█▀█ ░█▄░█ ░█▀█ ░█▀▄ ░█▀▀
░█   ░█ ░█▄█ ░█▄▀ ░█░▀█ ░█░█ ░█░█ ░█▀
░█▄█  ▀  ▀    ▀ ▀  ▀  ▀  ▀▀▀  ▀▀   ▀▀▀
         ░▀▀█ ░█▀▀ ░█▀█ ░█▀█
         ░▄▀░ ░█▀  ░█▄▀ ░█░█
          ▀▀▀  ▀▀▀  ▀ ▀  ▀▀▀
     A ciprnode proof of concept

          Startup Sequence`);

    //: 1. Configuration file validation...
    console.group(`\n1. Configuration file validation...`);

    const isFrontOnly = Deno.args.includes('--front-only');
    const config = await loadConfig();

    // Config Summary Table (Sanitized)
    console.log(`Configuration summary:`);
    const configSummary = {
      'Environment': config.env,
      'Debug Mode': config.debug,
      'Zone Apex': config.za,
      'Port': config.port,
      'DNS Provider': config.dns_provider.name || 'None',
      'Propagation Time': `${config.expected_propagation_time}ms`,
      'Do53 Servers': config.dns.do53.length,
      'DoH Servers': config.dns.doh.length,
    };
    logKeyValueTable(configSummary);

    console.log(`[OK] The Configuration File is okay and loaded`);
    console.groupEnd(); // End Config

    //: 2. Extracting ciprHash for the current configuration...
    console.group(`\n2. Extracting ciprHash for the current configuration...`);

    // Define keywordsStr for use in insertEntry later
    const keywordsStr = Array.isArray(config.keywords)
      ? config.keywords.join(' ')
      : config.keywords;

    // za+title+description+keywords+ol+latitude+longitude (separated by ¦)
    const ciprHash = await generateCiprHash(
      config.za,
      config.title,
      config.description,
      config.keywords,
      config.ol,
      config.latitude,
      config.longitude,
    );

    console.log(`Hash: ${ciprHash}`);
    console.groupEnd();

    //: 3. Ciprdup (local database) connection...
    console.group(`\n3. Ciprdup (local database) connection...`);
    const db = await getDbConnection();
    initSchema(db); // Ensures tables exist
    console.log(`[OK] Database connected & schema verified`);
    console.groupEnd();

    //: 4. Ciprnode Synchronization...
    let txtUpdated = false; // Track if we updated the TXT record (moved up to be available globally in this scope)

    if (isFrontOnly) {
      console.log(`\n[FRONT-DEV MODE] Skipping Ciprnode synchronization...`);
    } else {
      console.group(`\n4. Ciprnode synchronization...`);
      await initialSync(config, db);
      console.groupEnd();
    }

    //: 5. Configured za Verification... (Check if row exists for config.za)
    if (isFrontOnly) {
      console.log(`\n[FRONT-DEV MODE] Skipping DNS za verification...`);
    } else {
      console.group(`\n5. Configured za verification...`);
      const existingEntry = getEntry(db, config.za);
      const now = Math.floor(Date.now() / 1000); // Unix Timestamp (UTC)

      if (!existingEntry) {
        // Not found -> Create New
        console.log(`Entry for ${config.za} not found. Creating...`);
        insertEntry(db, {
          za: config.za,
          title: config.title,
          description: config.description,
          keywords: keywordsStr,
          ol: config.ol === 0 ? null : config.ol,
          latitude: config.latitude,
          longitude: config.longitude,
          timestamp: now,
        });
        console.log(`[OK] New entry created`);
        // New entry implies we might need to update DNS if it doesn't match,
        // but logic below handles "Mismatch" if existing.
        // If it's new locally, we assume we might be setting up.
        // The logic below checking ciprHash vs validationHash only runs in 'else'.
        // If validationHash is calculated from *config*, and ciprHash is from *config*, they match.
        // But we need to know if we updated DNS.
        // Use 'updated' variable results.
      } else {
        // ... existing validation logic ...
        // Found -> Generate Initial Validation Hash
        console.log(`An entry for ${config.za} has been found, validating it...`);
        // From DB Row values
        const validationHash = await generateCiprHash(
          existingEntry.za,
          existingEntry.title,
          existingEntry.description,
          existingEntry.keywords,
          existingEntry.ol,
          existingEntry.latitude,
          existingEntry.longitude,
        );

        if (ciprHash !== validationHash) {
          // ...
          // Trigger DNS Update
          let updated = false;

          if (config.dns_provider?.name === 'cloudflare') {
            const { updateCloudflareRecord } = await import('./src/integrations/dns/cloudflare.js');
            console.warn(`Local configuration changed. Updating Cloudflare TXT DNS record...`);
            updated = await updateCloudflareRecord(config, ciprHash);
          } else if (config.dns_provider?.name === 'desec') {
            const { updateDesecRecord } = await import('./src/integrations/dns/desec.js');
            console.warn(`Local configuration changed. Updating deSEC TXT DNS record...`);
            // deSEC returns true/false directly
            updated = await updateDesecRecord(config, ciprHash);
          }

          if (updated) {
            txtUpdated = true;
            console.log(`TXT DNS record updated. Waiting 60s for propagation...`);
            await new Promise((r) => setTimeout(r, 60000));
          }
        } else {
          // ...
        }
      }
      console.groupEnd();
    }

    //: 6. DNS entry verification (Auto-Repair checks)
    let isVerified = false;
    if (isFrontOnly) {
      console.log(`\n[FRONT-DEV MODE] Skipping DNS entry verification and Auto-Repair...`);
    } else {
      console.group(`\n6. DNS entry verification...`);
      isVerified = await verifyCiprHash(config, config.za, ciprHash);

      // Auto-Repair Logic
      if (
        !isVerified &&
        (config.dns_provider?.name === 'cloudflare' || config.dns_provider?.name === 'desec')
      ) {
        let updated = false;
        console.warn(
          `DNS Entry verification failed. Attempting automated repair for ${config.dns_provider.name}...`,
        );

        if (config.dns_provider?.name === 'cloudflare') {
          const { updateCloudflareRecord } = await import('./src/integrations/dns/cloudflare.js');
          updated = await updateCloudflareRecord(config, ciprHash);
        } else if (config.dns_provider?.name === 'desec') {
          const { updateDesecRecord } = await import('./src/integrations/dns/desec.js');
          updated = await updateDesecRecord(config, ciprHash);
        }

        if (updated) {
          txtUpdated = true;
          // DNS Propagation Retry Loop
          const maxAttempts = 3;
          const delayMs = 60000; // 60 seconds

          console.log(`Propagation wait loop...`);
          for (let i = 1; i <= maxAttempts; i++) {
            console.log(`Waiting ${delayMs / 1000}s (Attempt ${i}/${maxAttempts})...`);
            await new Promise((r) => setTimeout(r, delayMs));

            console.log(`Verifying...`);
            isVerified = await verifyCiprHash(config, config.za, ciprHash);

            if (isVerified) {
              console.log(`[OK] Cipr DNS entry verification successful`);
              break;
            } else {
              console.warn(`Attempt ${i} failed.`);
            }
          }
          console.groupEnd();
        }
      }

      if (!isVerified) {
        console.error(`[ERR] This ciprnode does not have an associated entry in the DNS.`);

        if (!config.debug) {
          console.error(`Exiting.`);
          Deno.exit(1);
        } else {
          console.warn(`Continuing in Debug Mode.`);
        }
      } else {
        console.log(`[OK] Cipr Entry in the DNS Verified`);
      }
      console.groupEnd();
    }

    // Calculate process duration
    const durationMs = performance.now() - sequenceStart;
    const minutes = Math.floor(durationMs / 60000);
    const seconds = ((durationMs % 60000) / 1000).toFixed(2);
    const durationStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    console.log(`\nThe Startup Sequence has completed.`);
    console.log(`Duration: ${durationStr}\n`);

    //: Start API Server (Scheduler starts inside after verification)
    // We need to know if TXT was updated to trigger the broadcast in scheduler
    // Let's assume the 'updated' variable from step 5 or 6 (auto-repair) captures this.
    // Issue: 'updated' is local to blocks. We need a 'txtUpdated' flag available here.
    // I will refactor the variable scope in a separate edit or assume I can track it.
    // For now, let's change the startServer call.
    // Wait, I need to make sure 'txtUpdated' is defined in the scope of main function.
    // I will mistakenly rely on a variable I haven't defined if I just change this line.
    // I need to use multi_replace for main.js to lift the variable scope.

    // Actually, I can use a simpler approach: define `let txtUpdated = false;` at start of main logic
    // and update it in the blocks.

    // Since I can only do contiguous edits with this tool, I will just change the end here
    // and make another edit to define and update the variable.

    await startServer(config, db, txtUpdated, isFrontOnly);
  } catch (error) {
    console.error(`[FATAL ERROR]`, error);
    Deno.exit(1);
  }
}
