/**
 * @file main.js
 * @description Main entry point for Ciprnode zero
 */

import { loadConfig } from './src/core/config.js';
import { getDbConnection } from './src/db/client.js';
import { initSchema } from './src/db/schema.js';
import { startServer } from './src/api/server.js';
// import { startBot } from './src/bot/agent.js'; // Removed
import { logKeyValueTable } from './src/core/logger.js';
// import { createSha256Hash } from './src/core/crypto.js'; // Replaced by generateCiprHash
import { getEntry, insertEntry } from './src/db/repo.js';

// :: File Persistence & Rotation is handled directly via `writeToLogFile`.
import { verifyCiprHash } from './src/core/dns.js';
import { initialSync } from './src/core/sync.js';
import { generateCiprHash, setLoggingConfig } from './src/core/utils.js';
import { msg } from './src/core/utils.js';

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

    msg(`
░█▀█ ░▀ ░█▀█ ░█▀█ ░█▄░█ ░█▀█ ░█▀▄ ░█▀▀
░█   ░█ ░█▄█ ░█▄▀ ░█░▀█ ░█░█ ░█░█ ░█▀
░█▄█  ▀  ▀    ▀ ▀  ▀  ▀  ▀▀▀  ▀▀   ▀▀▀
         ░▀▀█ ░█▀▀ ░█▀█ ░█▀█
         ░▄▀░ ░█▀  ░█▄▀ ░█░█
          ▀▀▀  ▀▀▀  ▀ ▀  ▀▀▀
     A ciprnode proof of concept

          Startup Sequence`, 'H1');

    //: 1. Configuration file validation...
    msg(`1. Configuration file validation...`, 'H1');

    const isFrontOnly = Deno.args.includes('--front-only');
    const config = await loadConfig();

    setLoggingConfig(config.log_level, config.debug);

    // Config Summary Table (Sanitized)
    msg(`Configuration summary:`);
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

    msg(`The Configuration File is okay and loaded`, 'OK');

    //: 2. Extracting ciprHash for the current configuration...
    msg(`2. Extracting ciprHash for the current configuration...`, 'H1');

    // Define keywordsStr for use in insertEntry later
    const keywordsStr = Array.isArray(config.keywords)
      ? config.keywords.join(' ')
      : config.keywords;

    // za+title+description+keywords+primary_lang+ol+latitude+longitude (separated by ¦)
    const ciprHash = await generateCiprHash(
      config.za,
      config.title,
      config.description,
      config.keywords,
      config.ol,
      config.latitude,
      config.longitude,
      config.primary_lang,
    );

    msg(`Hash: ${ciprHash}`);

    //: 3. Ciprdup (local database) connection...
    msg(`3. Ciprdup (local database) connection...`, 'H1');
    const db = await getDbConnection();
    initSchema(db); // Ensures tables exist
    msg(`Database connected & schema verified`, 'OK');

    //: 4. Ciprnode Synchronization...
    let txtUpdated = false; // Track if we updated the TXT record (moved up to be available globally in this scope)

    if (isFrontOnly) {
      msg(`Front-end development mode, skipping Ciprnode synchronization.`, 'WA');
    } else {
      msg(`4. Ciprnode synchronization...`, 'H1');
      await initialSync(config, db);
    }

    //: 5. Configured za Verification... (Check if row exists for config.za)
    if (isFrontOnly) {
      msg(`Front-end development mode, skipping DNS za verification.`, 'WA');
    } else {
      msg(`5. Configured za verification...`, 'H1');
      const existingEntry = getEntry(db, config.za);
      const now = Math.floor(Date.now() / 1000); // Unix Timestamp (UTC)

      if (!existingEntry) {
        // Not found -> Create New
        msg(`Entry for ${config.za} not found. Creating...`);
        insertEntry(db, {
          za: config.za,
          title: config.title,
          description: config.description,
          keywords: keywordsStr,
          ol: config.ol === 0 ? null : config.ol,
          latitude: config.latitude,
          longitude: config.longitude,
          timestamp: now,
          primary_lang: config.primary_lang, // Patch: missing identity language
        });
        msg(`New entry created`, 'OK');
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
        msg(`An entry for ${config.za} has been found, validating it...`);
        // From DB Row values
        const validationHash = await generateCiprHash(
          existingEntry.za,
          existingEntry.title,
          existingEntry.description,
          existingEntry.keywords,
          existingEntry.ol,
          existingEntry.latitude,
          existingEntry.longitude,
          existingEntry.primary_lang,
        );

        if (ciprHash !== validationHash) {
          msg(`Differences detected between ciprnode.toml and local database. Updating local index...`, 'WA');
          // Sync new config values into the local SQLite node identity
          insertEntry(db, {
            za: config.za,
            title: config.title,
            description: config.description,
            keywords: keywordsStr,
            ol: config.ol === 0 ? null : config.ol,
            latitude: config.latitude,
            longitude: config.longitude,
            timestamp: now,
            primary_lang: config.primary_lang,
          });

          // Trigger DNS Update
          let updated = false;
          if (config.dns_provider?.name) {
            try {
              const providerName = config.dns_provider.name;
              const { updateRecord } = await import(`./integrations/dns/${providerName}.js`);
              msg(`Local configuration changed. Updating ${providerName} TXT DNS record...`, 'WA');
              updated = await updateRecord(config, ciprHash);
            } catch (e) {
              msg(`Failed to dynamically load or run DNS provider '${config.dns_provider.name}': ${e.message}`, 'KO');
            }
          }

          if (updated) {
            txtUpdated = true;
            msg(`TXT DNS record updated. Waiting 60s for propagation...`, 'OK');
            // We can lower this or keep it, but standard says wait.
            await new Promise((r) => setTimeout(r, 60000));
          } else if (!config.dns_provider?.name) {
            msg(`ACTION REQUIRED: You must manually update your DNS TXT record for _cipr.${config.za} to:`, 'WA');
            msg(`"${ciprHash}"\n`);
          }
        } else {
          // ...
          msg(`Local database matches ciprnode.toml configuration.`, 'OK');
        }
      }
    }

    //: 6. DNS entry verification (Auto-Repair checks)
    let isVerified = false;
    if (isFrontOnly) {
      msg(`Front-end development mode, skipping DNS entry verification and Auto-Repair.`, 'WA');
    } else {
      msg(`6. DNS entry verification...`, 'H1');
      isVerified = await verifyCiprHash(config, config.za, ciprHash);

      // Auto-Repair Logic
      if (
        !isVerified &&
        config.dns_provider?.name // Check if a provider is configured
      ) {
        let updated = false;
        msg(
          `DNS Entry verification failed. Attempting automated repair for ${config.dns_provider.name}...`,
        );
        if (config.dns_provider?.name) {
          try {
            const providerName = config.dns_provider.name;
            const { updateRecord } = await import(`./integrations/dns/${providerName}.js`);
            msg(`Fixing bad remote TXT via Provider (${providerName}) ...`, 'WA');
            updated = await updateRecord(config, ciprHash);
          } catch (e) {
            msg(`Failed to fix TXT record via DNS provider '${config.dns_provider.name}': ${e.message}`, 'KO');
          }
        }
        if (updated) {
          txtUpdated = true;
          // DNS Propagation Retry Loop
          const maxAttempts = 3;
          const delayMs = 60000; // 60 seconds

          msg(`Propagation wait loop...`);
          for (let i = 1; i <= maxAttempts; i++) {
            msg(`Waiting ${delayMs / 1000}s (Attempt ${i}/${maxAttempts})...`);
            await new Promise((r) => setTimeout(r, delayMs));

            msg(`Verifying...`);
            isVerified = await verifyCiprHash(config, config.za, ciprHash);

            if (isVerified) {
              msg(`Cipr DNS entry verification successful`, 'OK');
              break;
            } else {
              msg(`Attempt ${i} failed.`, 'WA');
            }
          }
        }
      }

      if (!isVerified) {
        msg(`This ciprnode does not have an associated entry in the DNS.`, 'KO');

        if (!config.debug) {
          msg(`Exiting.`, 'KO');
          Deno.exit(1);
        } else {
          msg(`Continuing in Debug Mode.`, 'WA');
        }
      } else {
        msg(`Cipr Entry in the DNS verified.`, 'OK');
      }
    }

    // Calculate process duration
    const durationMs = performance.now() - sequenceStart;
    const minutes = Math.floor(durationMs / 60000);
    const seconds = ((durationMs % 60000) / 1000).toFixed(2);
    const durationStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    msg(`The Startup Sequence has completed.`, 'OK');
    msg(`Duration: ${durationStr}`);

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
