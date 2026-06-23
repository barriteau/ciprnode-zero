/**
 * @file src/core/sync.js
 * @description Initial P2P Synchronization logic (Bootstrap -> Swarm).
 */

import { countEntries, getEntry, insertEntry } from '../db/repo.js';
import { verifyNode } from './verification.js';
import { calculateNodesPerPulse, generateCiprHash, msg, safeFetch } from './utils.js';
import { notify } from './notify.js';

/**
 * Non-blocking bootstrap entry point.
 * If bootstrap is needed, it starts immediately; if all nodes fail, a retry loop is spawned
 * so the ciprnode can start serving anyway.
 *
 * @param {import('./config.js').CiprNodeConfig} config
 * @param {import('@db/sqlite').Database} db
 */
export const initialSync = async (config, db) => {
  const bootstrapNodes = config.bootstrap_nodes;
  if (!Array.isArray(bootstrapNodes) || bootstrapNodes.length === 0) {
    msg(`No bootstrap_nodes configured. Skipping initial sync.`, 'WA');
    return;
  }

  const count = countEntries(db);
  if (count > 1) {
    msg(`[OK] Database already populated, skipping initial sync.`);
    return;
  }

  msg(`Wait while the ciprdup (local copy of the Cipr) is populated...`);

  const succeeded = await performSync(config, db, bootstrapNodes);

  if (succeeded) {
    const entryCount = countEntries(db);
    notify('bootstrap_completed', { entries: entryCount, duration: 'initial' });
  } else {
    msg(
      `[WARNING] All bootstrap nodes failed or were unreachable. This ciprnode will operate isolated unless another ciprnode contacts it, or one of the bootstrap nodes starts responding.`,
      'WA',
    );
    startBootstrapRetryLoop(config, db);
  }
};

/**
 * Background retry loop: attempts to sync with bootstrap_nodes every 30 s for up to 1 h.
 *
 * @param {import('./config.js').CiprNodeConfig} config
 * @param {import('@db/sqlite').Database} db
 */
const startBootstrapRetryLoop = (config, db) => {
  const RETRY_INTERVAL_MS = 30000; // 30 s
  const MAX_RETRY_TIME_MS = 3600000; // 1 h

  const startTimestamp = Date.now();
  let timer = null;

  const tick = async () => {
    const elapsed = Date.now() - startTimestamp;
    msg(`[INFO] Retry bootstrap sync... (elapsed ${Math.round(elapsed / 1000)} s)`);

    const succeeded = await performSync(config, db, config.bootstrap_nodes);

    if (succeeded) {
      msg(`[OK] Bootstrap sync succeeded during retry loop.`);
      const elapsedSec = Math.round((Date.now() - startTimestamp) / 1000);
      const entryCount = countEntries(db);
      notify('bootstrap_completed', { entries: entryCount, duration: `${elapsedSec}s` });
      return;
    }

    if (elapsed >= MAX_RETRY_TIME_MS) {
      msg(
        `[INFO] Bootstrap retry window (1 h) expired. The ciprnode remains in isolated mode.`,
      );
      const elapsedMin = Math.round(elapsed / 60000);
      notify('bootstrap_failed', { elapsed: `${elapsedMin}m` });
      return;
    }

    timer = setTimeout(tick, RETRY_INTERVAL_MS);
  };

  timer = setTimeout(tick, RETRY_INTERVAL_MS);
};

/**
 * Performs the actual fetch/verify/store sequence for a set of bootstrap URLs.
 * Returns `true` if at least one bootstrap node yielded a successful sync.
 *
 * @param {import('./config.js').CiprNodeConfig} config
 * @param {import('@db/sqlite').Database} db
 * @param {string[]} bootstrapNodes
 * @returns {Promise<boolean>}
 */
const performSync = async (config, db, bootstrapNodes) => {
  let anySuccess = false;
  let totalEntriesEstimate = 0;

  const fetchAndProcess = createFetchAndProcess(config, db);

  for (const bootstrapUrl of bootstrapNodes) {
    msg(`[Sync] Processing bootstrap node: ${bootstrapUrl}...`);

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

      if (!resolved) {
        msg(`[WARN] Bootstrap node (${hostname}) could not be resolved. Skipping.`, 'WA');
        continue;
      }

      // Self-check
      const isSelf = hostname === config.za || hostname === `ciprnode.${config.za}`;
      if (isSelf) {
        msg(`Bootstrap node (${hostname}) appears to be this node (za: ${config.za}). Skipping.`, 'WA');
        continue;
      }

      // Identity verification
      let bootstrapZa = hostname;
      if (hostname.startsWith('ciprnode.')) {
        bootstrapZa = hostname.substring(9);
      }

      const baseUrl = bootstrapUrl.endsWith('/') ? bootstrapUrl : `${bootstrapUrl}/`;
      const identityUrl = `${baseUrl}${bootstrapZa}`;

      msg(`[Sync] Verifying bootstrap node identity: ${identityUrl}...`);
      const identityResult = await fetchAndProcess(identityUrl);

      if (!identityResult || !identityResult.success) {
        msg(`[WARN] Bootstrap node identity verification failed for ${hostname}. Skipping.`, 'WA');
        continue;
      }
      msg(`[Sync] Bootstrap node identity verified and stored.`);

      // Bulk fetch
      msg(`[Sync] Populating ciprdup from ${bootstrapUrl}...`);
      const bootstrapResult = await fetchAndProcess(bootstrapUrl);

      if (bootstrapResult && bootstrapResult.total > 0) {
        totalEntriesEstimate = Math.max(totalEntriesEstimate, bootstrapResult.total);
      }

      if (bootstrapResult && bootstrapResult.success) {
        anySuccess = true;
        msg(`[OK] Sync from ${hostname} complete. Inserted: ${bootstrapResult.insertedCount ?? 0}.`);
      }
    } catch (e) {
      msg(`[WARN] Invalid bootstrap node URL (${bootstrapUrl}): ${e.message}`, 'WA');
      continue;
    }
  }

  // Single viral burst - only after all successful bootstrap fetches
  if (anySuccess && totalEntriesEstimate > 0) {
    const nodesPerPulse = calculateNodesPerPulse(
      totalEntriesEstimate,
      config.expected_propagation_time,
    );
    msg(`[Sync] Viral Propagation: Total=${totalEntriesEstimate}, NodesPerPulse=${nodesPerPulse}`);

    const dbTotal = countEntries(db);
    const targetCount = Math.min(dbTotal, nodesPerPulse);

    if (targetCount > 0) {
      msg(`[Sync] Initiating viral burst to ${targetCount} peers...`);
      const stmt = db.prepare(
        `SELECT za FROM ciprdup WHERE za != ? ORDER BY RANDOM() LIMIT ?`,
      );
      const rows = stmt.all(config.za, targetCount);

      for (const row of rows) {
        const peerUrl = `https://ciprnode.${row.za}/`;
        msg(`[Sync] Viral Jump -> ${peerUrl}`);
        await fetchAndProcess(peerUrl);
      }
    }
  }

  msg(`[OK] Initial population complete.`);
  return anySuccess;
};

/**
 * Factory for the per-request fetch/verify/store closure.
 *
 * @param {import('./config.js').CiprNodeConfig} config
 * @param {import('@db/sqlite').Database} db
 * @returns {Function}
 */
const createFetchAndProcess = (config, db) =>
  async (urlStr) => {
    try {
      const response = await safeFetch(urlStr, {
        headers: { Accept: 'application/hal+json' },
      });

      if (config.log_level >= 2) {
        const parsedUrl = new URL(urlStr);
        msg(
          `Outgoing request:\n  Method: GET\n  Path: ${parsedUrl.pathname}\n  To: ${parsedUrl.hostname}`,
          'REQ',
        );
        msg(`  Incoming Response: ${response.status}`, 'RES');
      }

      if (!response.ok) {
        if (config.debug) msg(`[DBG] Sync failed for ${urlStr}: ${response.status}`);
        return null;
      }

      const textData = await response.text();

      if (config.debug) {
        msg(
          `[DBG] Sync &lt; Body Preview: ${textData.substring(0, 500)}${
            textData.length > 500 ? '...' : ''
          }`,
        );
      }

      let data;
      try {
        data = JSON.parse(textData);
      } catch (e) {
        if (config.debug) msg(`[DBG] Sync &lt; JSON Parse Error: ${e.message}`);
        return null;
      }

      let entries = data._embedded?.item || data._embedded?.items || [];

      if (!Array.isArray(entries) || entries.length === 0) {
        if (data && typeof data === 'object' && data.za) {
          entries = [data];
        }
      }

      if (config.debug) {
        msg(
          `[DBG] Sync &lt; Found ${entries.length} entries. Total in remote: ${data.total ?? 'N/A'}`,
        );
      }

      let insertedCount = 0;
      for (const entry of entries) {
        if (!entry.za) {
          if (config.debug) msg(`[DBG] Sync &lt; Skipping entry without za.`);
          continue;
        }

        const now = Math.floor(Date.now() / 1000);
        const keywordsStr = Array.isArray(entry.keywords)
          ? entry.keywords.join(' ')
          : entry.keywords;

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
            if (config.debug) msg(`[DBG] Sync &gt; Skipped (Unchanged): ${entry.za}`);
            continue;
          }
        }

        if (config.debug) msg(`[DBG] Sync &gt; Verifying ${entry.za}...`);

        const verifyResult = await verifyNode(config, entry.za, calculatedHash);

        if (verifyResult.valid) {
          const inserted = insertEntry(db, {
            ...entry,
            keywords: keywordsStr,
            timestamp: now,
          });

          if (inserted) {
            insertedCount++;
            if (config.debug) msg(`[DBG] Sync &gt; Inserted: ${entry.za}`);
          } else {
            if (config.debug) msg(`[DBG] Sync &gt; Skipped (Duplicate): ${entry.za}`);
          }
        } else {
          if (config.debug) {
            msg(
              `[DBG] Sync &gt; Verification Failed for ${entry.za} (${verifyResult.reason}). Either TXT record mismatch or Node unreachable (HEAD).`,
            );
          }
        }
      }

      return { insertedCount, total: data.total, success: true };
    } catch (e) {
      const errMsg = e.message || '';
      if (
        errMsg.includes('connection error') ||
        errMsg.includes('connection reset') ||
        errMsg.includes('connection refused')
      ) {
        msg(`[WARN] Sync: Failed to connect to ${urlStr}.`, 'WA');
        msg(`       -> Peer unreachable. Skipping.`, 'WA');
      } else {
        if (config.debug) msg(`[DBG] Sync Error fetching ${urlStr}: ${errMsg}`);
      }
      if (config.debug) msg(e.stack);
      return null;
    }
  };
