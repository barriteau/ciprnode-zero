/**
 * @file src/core/sync.js
 * @description Initial P2P Synchronization logic (Bootstrap -> Swarm).
 */

import { countEntries, getEntry, insertEntry } from '../db/repo.js';
// import { verifyCiprHash } from './dns.js'; // Replaced by verifyNode
import { verifyNode } from './verification.js';
// import { createSha256Hash } from './crypto.js'; // Replaced by generateCiprHash
import { calculateNodesPerPulse, generateCiprHash, msg, safeFetch } from './utils.js';

/**
 * Performs the initial sync if the database is empty.
 * @param {import('./config.js').CiprNodeConfig} config
 * @param {import('@db/sqlite').Database} db
 */
export const initialSync = async (config, db) => {
  // 1. Check if DB is sufficiently populated (more than just itself)
  const count = countEntries(db);
  // If we only have 0 or 1 entries, a full network sync is strictly required.
  // 1 entry usually means the node generated its own identity locally but didn't finish syncing peers.
  if (count > 1) {
    msg(`[OK] Database already populated, skipping initial sync.`);
    return;
  }

  msg(`Wait while the ciprdup (local copy of the Cipr) is populated...`);

  const bootstrapUrl = config.bootstrap_node;
  if (!bootstrapUrl) {
    msg(`No bootstrap_node configured. Skipping sync.`, 'WA');
    return;
  }

  // Validate Bootstrap Node DNS
  try {
    const bootstrapUrlObj = new URL(bootstrapUrl);
    const hostname = bootstrapUrlObj.hostname;
    let resolved = false;

    msg(`Verifying bootstrap node DNS: ${hostname}...`);

    for (let i = 0; i < 3; i++) {
      try {
        await Deno.resolveDns(hostname, 'A');
        resolved = true;
        msg(`[OK] Bootstrap node resolved.`);
        break;
      } catch (e) {
        msg(`Attempt ${i + 1}/3 failed to resolve bootstrap node: ${e.message}`, 'WA');
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    const dbIsEmpty = countEntries(db) === 0;

    if (!resolved) {
      const msgText = `[FATAL] Bootstrap node (${hostname}) could not be resolved in DNS.`;
      msg(msgText);
      if (dbIsEmpty) {
        msg(`Local database is empty. Cannot bootstrap without a valid node.`, 'KO');
        msg(`Startup aborted.`, 'KO');
        Deno.exit(1);
      } else {
        msg(`Local database has data. Continuing offline/isolated.`, 'WA');
      }
    }

    // Validate if bootstrap_node is same as current za
    const isSelf = hostname === config.za || hostname === `ciprnode.${config.za}`;
    if (isSelf) {
      msg(`Bootstrap node (${hostname}) appears to be this node (za: ${config.za}).`);
      msg(`Self-bootstrapping is not possible.`, 'WA');

      if (dbIsEmpty) {
        msg(
          `Skipping sync. The local database will be populated with initial data only.`,
        );
        return;
      } else {
        msg(`Local database has data. Continuing.`, 'WA');
      }
    }
  } catch (e) {
    msg(`Invalid bootstrap_node URL: ${e.message}`, 'WA');
  }

  // const THREE_MINUTES_MS = 3 * 60 * 1000; // Removed
  // let lastInsertTime = Date.now(); // Removed (unused now)

  // let knownPeers = []; // Keep a memory list or query DB? Querying DB is safer/more robust.

  // Helper to fetch and process entries
  const fetchAndProcess = async (urlStr) => {

    try {
      const response = await safeFetch(urlStr, {
        headers: { 'Accept': 'application/hal+json' },
      });

      if (config.log_level >= 2) {
        const parsedUrl = new URL(urlStr);
        msg(`Outgoing request:\n  Method: GET\n  Path: ${parsedUrl.pathname}\n  To: ${parsedUrl.hostname}`, 'REQ');
        msg(`  Incoming Response: ${response.status}`, 'RES');
      }

      if (!response.ok) {
        if (config.debug) msg(`[DBG] Sync failed for ${urlStr}: ${response.status}`);
        return null;
      }

      // Clone to read text for debug without consuming stream for json()
      // (Actually we can just read text then parse JSON)
      const textData = await response.text();

      if (config.debug) {
        msg(
          `[DBG] Sync < Body Preview: ${textData.substring(0, 500)}${
            textData.length > 500 ? '...' : ''
          }`,
        );
      }

      let data;
      try {
        data = JSON.parse(textData);
      } catch (e) {
        if (config.debug) msg(`[DBG] Sync < JSON Parse Error: ${e.message}`);
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
        msg(
          `[DBG] Sync < Found ${entries.length} entries. Total in remote: ${data.total ?? 'N/A'}`,
        );
      }

      let insertedCount = 0;
      for (const entry of entries) {
        if (!entry.za) {
          if (config.debug) msg(`[DBG] Sync < Skipping entry without za.`);
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
          entry.offering,
          entry.seeking,
          entry.primary_lang,
          entry.ol,
          entry.latitude,
          entry.longitude,
        );

        // OPTIMIZATION: Check if entry exists and is identical
        const existing = getEntry(db, entry.za);
        if (existing) {
          const existingHash = await generateCiprHash(
            existing.za,
            existing.title,
            existing.description,
            existing.keywords,
            existing.offering,
            existing.seeking,
            existing.primary_lang,
            existing.ol,
            existing.latitude,
            existing.longitude,
          );

          if (calculatedHash === existingHash) {
            if (config.debug) msg(`[DBG] Sync > Skipped (Unchanged): ${entry.za}`);
            continue;
          }
        }

        // 1. Integrity (Hash)
        // Hash already calculated above
        // const calculatedHash = await createSha256Hash(rowHashInput);

        // 2. Double Verification (TXT + HEAD)
        if (config.debug) {
          msg(`[DBG] Sync > Verifying ${entry.za}...`);
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
            if (config.debug) msg(`[DBG] Sync > Inserted: ${entry.za}`);
          } else {
            if (config.debug) msg(`[DBG] Sync > Skipped (Duplicate): ${entry.za}`);
          }
        } else {
          if (config.debug) {
            msg(
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
        msg(`[WARN] Sync: Failed to connect to ${urlStr}.`, 'WA');
        msg(`       -> Peer unreachable. Skipping.`, 'WA');
      } else {
        if (config.debug) msg(`[DBG] Sync Error fetching ${urlStr}: ${msg}`);
      }
      // Log stack in debug
      if (config.debug) msg(e.stack);
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

    msg(`[Sync] Verifying bootstrap node identity: ${identityUrl}...`);
    const identityResult = await fetchAndProcess(identityUrl);

    if (!identityResult || !identityResult.success) {
      msg(`[FATAL] Bootstrap node identity verification failed. Aborting network sync.`, 'KO');
      return;
    }
    msg(`[Sync] Bootstrap node identity verified and stored as the first entry.`);
  } catch (e) {
    msg(`[FATAL] Failed to sync bootstrap node identity: ${e.message}`, 'KO');
    return;
  }

  // Phase 2: Populate ciprdup from bootstrap node
  msg(`[Sync] Populating ciprdup from ${bootstrapUrl}...`);
  const bootstrapResult = await fetchAndProcess(bootstrapUrl);

  if (bootstrapResult && bootstrapResult.total > 0) {
    // Viral Sync Logic
    const totalNodes = bootstrapResult.total;
    const nodesPerPulse = calculateNodesPerPulse(totalNodes, config.expected_propagation_time);
    msg(`[Sync] Viral Propagation: Total=${totalNodes}, NodesPerPulse=${nodesPerPulse}`);

    // Pick random entries from DB to propagate to
    const dbTotal = countEntries(db);
    const targetCount = Math.min(dbTotal, nodesPerPulse);

    if (targetCount > 0) {
      msg(`[Sync] Initiating viral burst to ${targetCount} peers...`);
      // SELECT za FROM ciprdup WHERE za != ? ORDER BY RANDOM() LIMIT N
      const stmt = db.prepare(`SELECT za FROM ciprdup WHERE za != ? ORDER BY RANDOM() LIMIT ?`);
      const rows = stmt.all(config.za, targetCount);

      for (const row of rows) {
        const peerUrl = `https://ciprnode.${row.za}/`;
        msg(`[Sync] Viral Jump -> ${peerUrl}`);
        await fetchAndProcess(peerUrl);
      }
    }
  }

  // Phase 2: Steady State Maintaince / Continued Sync - REMOVED
  // User requested to remove the loop and only do the viral burst based on calculateNodesPerJump.

  msg(`[OK] Initial population complete.`);
};
