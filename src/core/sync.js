/**
 * @file src/core/sync.js
 * @description Initial P2P Synchronization logic (Bootstrap -> Swarm).
 */

import { countEntries, getEntry, insertEntry } from '../db/repo.js';
// import { verifyCiprHash } from './dns.js'; // Replaced by verifyNode
import { verifyNode } from './verification.js';
// import { createSha256Hash } from './crypto.js'; // Replaced by generateCiprHash
import { calculateNodesPerPulse, generateCiprHash } from './utils.js';

/**
 * Performs the initial sync if the database is empty.
 * @param {import('./config.js').CiprNodeConfig} config
 * @param {import('@db/sqlite').Database} db
 */
export const initialSync = async (config, db) => {
  // 1. Check if DB is empty
  const count = countEntries(db);
  if (count > 0) {
    console.log(`[OK] Database already populated, skipping initial sync.`);
    return;
  }

  console.log(`Wait while the ciprdup (local copy of the Cipr) is populated...`);

  const bootstrapUrl = config.bootstrap_node;
  if (!bootstrapUrl) {
    console.warn(`No bootstrap_node configured. Skipping sync.`);
    return;
  }

  // Validate Bootstrap Node DNS
  try {
    const bootstrapUrlObj = new URL(bootstrapUrl);
    const hostname = bootstrapUrlObj.hostname;
    let resolved = false;

    console.log(`Verifying bootstrap node DNS: ${hostname}...`);

    for (let i = 0; i < 3; i++) {
      try {
        await Deno.resolveDns(hostname, 'A');
        resolved = true;
        console.log(`[OK] Bootstrap node resolved.`);
        break;
      } catch (e) {
        console.warn(`Attempt ${i + 1}/3 failed to resolve bootstrap node: ${e.message}`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    const dbIsEmpty = countEntries(db) === 0;

    if (!resolved) {
      const msg = `[FATAL] Bootstrap node (${hostname}) could not be resolved in DNS.`;
      console.warn(msg);
      if (dbIsEmpty) {
        console.error(`Local database is empty. Cannot bootstrap without a valid node.`);
        console.error(`Startup aborted.`);
        Deno.exit(1);
      } else {
        console.warn(`Local database has data. Continuing offline/isolated.`);
      }
    }

    // Validate if bootstrap_node is same as current za
    const isSelf = hostname === config.za || hostname === `ciprnode.${config.za}`;
    if (isSelf) {
      console.warn(`Bootstrap node (${hostname}) appears to be this node (za: ${config.za}).`);
      console.warn(`Self-bootstrapping is not possible.`);

      if (dbIsEmpty) {
        console.warn(
          `Skipping sync. The local database will be populated with initial data only.`,
        );
        return;
      } else {
        console.warn(`Local database has data. Continuing.`);
      }
    }
  } catch (e) {
    console.warn(`Invalid bootstrap_node URL: ${e.message}`);
  }

  // const THREE_MINUTES_MS = 3 * 60 * 1000; // Removed
  // let lastInsertTime = Date.now(); // Removed (unused now)

  // let knownPeers = []; // Keep a memory list or query DB? Querying DB is safer/more robust.

  // Helper to fetch and process entries
  const fetchAndProcess = async (urlStr) => {
    if (config.debug) console.log(`[DBG] Sync > Fetching: ${urlStr}`);

    try {
      const response = await fetch(urlStr, {
        headers: { 'Accept': 'application/hal+json' },
      });

      if (config.debug) {
        console.log(`[DBG] Sync < Response Status: ${response.status}`);
        // Log headers if needed, but status is usually enough for sync debugging
      }

      if (!response.ok) {
        if (config.debug) console.log(`[DBG] Sync failed for ${urlStr}: ${response.status}`);
        return null;
      }

      // Clone to read text for debug without consuming stream for json()
      // (Actually we can just read text then parse JSON)
      const textData = await response.text();

      if (config.debug) {
        console.log(
          `[DBG] Sync < Body Preview: ${textData.substring(0, 500)}${
            textData.length > 500 ? '...' : ''
          }`,
        );
      }

      let data;
      try {
        data = JSON.parse(textData);
      } catch (e) {
        if (config.debug) console.log(`[DBG] Sync < JSON Parse Error: ${e.message}`);
        return null;
      }

      let entries = data._embedded?.item || data._embedded?.items || [];

      // Handle Single Entry Response (e.g. Identity Fetch)
      // When making a GET /<za> request, the properties are at the root level of the HAL object.
      if (!Array.isArray(entries) || entries.length === 0) {
        if (data && typeof data === 'object' && data.za) {
          entries = [data]; // Wrap the root object in an array
        }
      }

      if (config.debug) {
        console.log(
          `[DBG] Sync < Found ${entries.length} entries. Total in remote: ${data.total ?? 'N/A'}`,
        );
      }

      let insertedCount = 0;
      for (const entry of entries) {
        if (!entry.za) {
          if (config.debug) console.log(`[DBG] Sync < Skipping entry without ZA.`);
          continue;
        }

        const now = Math.floor(Date.now() / 1000);

        // Reconstruct Hash Input
        const keywordsStr = Array.isArray(entry.keywords)
          ? entry.keywords.join(' ')
          : entry.keywords;
        // const now = Math.floor(Date.now() / 1000); // Already declared above for this iteration

        // 1. Integrity (Hash) & Reconstruction
        const calculatedHash = await generateCiprHash(
          entry.za,
          entry.title,
          entry.description,
          entry.keywords,
          entry.ol,
          entry.latitude,
          entry.longitude,
          entry.primary_lang,
        );

        // OPTIMIZATION: Check if entry exists and is identical
        const existing = getEntry(db, entry.za);
        if (existing) {
          const existingHash = await generateCiprHash(
            existing.za,
            existing.title,
            existing.description,
            existing.keywords,
            existing.ol,
            existing.latitude,
            existing.longitude,
            existing.primary_lang,
          );

          if (calculatedHash === existingHash) {
            if (config.debug) console.log(`[DBG] Sync > Skipped (Unchanged): ${entry.za}`);
            continue;
          }
        }

        // 1. Integrity (Hash)
        // Hash already calculated above
        // const calculatedHash = await createSha256Hash(rowHashInput);

        // 2. Double Verification (TXT + HEAD)
        if (config.debug) {
          console.log(`[DBG] Sync > Verifying ${entry.za}...`);
        }

        // Use the centralized verification logic
        const isValid = await verifyNode(config, entry.za, calculatedHash);

        if (isValid) {
          // 3. Insert
          const inserted = insertEntry(db, {
            ...entry,
            keywords: keywordsStr,
            timestamp: now,
          });

          if (inserted) {
            insertedCount++;
            lastInsertTime = Date.now(); // Reset timer
            if (config.debug) console.log(`[DBG] Sync > Inserted: ${entry.za}`);
          } else {
            if (config.debug) console.log(`[DBG] Sync > Skipped (Duplicate): ${entry.za}`);
          }
        } else {
          if (config.debug) {
            console.log(
              `[DBG] Sync > Verification Failed for ${entry.za}. Either TXT record mismatch or Node unreachable (HEAD).`,
            );
          }
        }
      }
      return { insertedCount, total: data.total, success: true };
    } catch (e) {
      const msg = e.message || '';
      if (
        msg.includes('connection error') || msg.includes('connection reset') ||
        msg.includes('connection refused')
      ) {
        console.warn(`[WARN] Sync: Failed to connect to ${urlStr}.`);
        console.warn(`       -> Peer unreachable. Skipping.`);
      } else {
        if (config.debug) console.log(`[DBG] Sync Error fetching ${urlStr}: ${msg}`);
      }
      // Log stack in debug
      if (config.debug) console.log(e.stack);
      return null;
    }
  };

  // --- Start Sync Loop ---

  // Phase 1: Bootstrap Node Identity Verification
  // The bootstrap node must be validated and inserted first before fetching its entire Ciprdup.
  try {
    const bootstrapUrlObj = new URL(bootstrapUrl);
    const hostname = bootstrapUrlObj.hostname;
    let bootstrapZa = hostname;

    if (hostname.startsWith('ciprnode.')) {
      bootstrapZa = hostname.substring(9); // remove 'ciprnode.'
    }

    // Construct Identity URL: bootstrap_base_url + / + za
    const baseUrl = bootstrapUrl.endsWith('/') ? bootstrapUrl : `${bootstrapUrl}/`;
    const identityUrl = `${baseUrl}${bootstrapZa}`;

    console.log(`[Sync] Verifying bootstrap node identity: ${identityUrl}...`);
    const identityResult = await fetchAndProcess(identityUrl);

    if (!identityResult || !identityResult.success) {
      console.error(`[FATAL] Bootstrap node identity verification failed. Aborting network sync.`);
      return;
    }
    console.log(`[Sync] Bootstrap node identity verified and stored as the first entry.`);
  } catch (e) {
    console.error(`[FATAL] Failed to sync bootstrap node identity: ${e.message}`);
    return;
  }

  // Phase 2: Populate ciprdup from bootstrap node
  console.log(`[Sync] Populating ciprdup from ${bootstrapUrl}...`);
  const bootstrapResult = await fetchAndProcess(bootstrapUrl);

  if (bootstrapResult && bootstrapResult.total > 0) {
    // Viral Sync Logic
    const totalNodes = bootstrapResult.total;
    const nodesPerPulse = calculateNodesPerPulse(totalNodes, config.expected_propagation_time);
    console.log(`[Sync] Viral Propagation: Total=${totalNodes}, NodesPerPulse=${nodesPerPulse}`);

    // Pick random entries from DB to propagate to
    const dbTotal = countEntries(db);
    const targetCount = Math.min(dbTotal, nodesPerPulse);

    if (targetCount > 0) {
      console.log(`[Sync] Initiating viral burst to ${targetCount} peers...`);
      // SELECT za FROM ciprdup WHERE za != ? ORDER BY RANDOM() LIMIT N
      const stmt = db.prepare(`SELECT za FROM ciprdup WHERE za != ? ORDER BY RANDOM() LIMIT ?`);
      const rows = stmt.all(config.za, targetCount);

      for (const row of rows) {
        const peerUrl = `https://ciprnode.${row.za}/`;
        console.log(`[Sync] Viral Jump -> ${peerUrl}`);
        await fetchAndProcess(peerUrl);
      }
    }
  }

  // Phase 2: Steady State Maintaince / Continued Sync - REMOVED
  // User requested to remove the loop and only do the viral burst based on calculateNodesPerJump.

  console.log(`[OK] Initial population complete.`);
};
