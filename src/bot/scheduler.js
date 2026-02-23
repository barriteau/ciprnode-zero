/**
 * @file src/bot/scheduler.js
 * @description Scheduling logic for Ciprpulse maintenance tasks.
 */

import { countEntries, getEntry } from '../db/repo.js';
import { calculateNodesPerPulse } from '../core/utils.js';
import { validateCiprConfig } from '../core/validator.js';
// import { verifyNode } from '../core/verification.js'; // reused? No, broadcast is PUT.

/**
 * Starts the internal scheduler.
 * @param {import('../core/config.js').CiprNodeConfig} config
 * @param {import('@db/sqlite').Database} db
 * @param {boolean} txtUpdated
 */
export const startScheduler = async (config, db, txtUpdated) => {
  console.log('Starting Ciprpulse scheduler...');

  // 1. Check for Initial Broadcast requirement
  if (txtUpdated) {
    console.log('[Ciprpulse] Local TXT record updated. Broadcasting update...');
    await broadcastUpdate(config, db);
  }

  // 2. Periodic Tasks (Ciprpulse)
  const PULSE_INTERVAL = Math.max(1000, config.expected_propagation_time || 8000);
  console.log(`[Ciprpulse] Scheduler interval set to ${PULSE_INTERVAL}ms`);

  setInterval(() => {
    runPulseChecks(db, config);
  }, PULSE_INTERVAL);

  // 3. Self Validation Task
  // "every 3 expected_propagation_time"
  const SELF_VALIDATION_INTERVAL = 3 * config.expected_propagation_time;
  console.log(
    `[Ciprpulse] Self-validation interval set to ${SELF_VALIDATION_INTERVAL}ms`,
  );

  setInterval(() => {
    runSelfValidation(config, db);
  }, SELF_VALIDATION_INTERVAL);
};

/**
 * Broadcasts the local node's updated data to a set of peers.
 * @param {import('../core/config.js').CiprNodeConfig} config
 * @param {import('@db/sqlite').Database} db
 */
const broadcastUpdate = async (config, db) => {
  try {
    const totalNodes = countEntries(db);
    if (totalNodes <= 1) {
      console.log('[Ciprpulse] No peers to broadcast to.');
      return;
    }

    const nodesPerPulse = calculateNodesPerPulse(totalNodes, config.expected_propagation_time);
    const targetCount = Math.min(totalNodes, nodesPerPulse);

    console.log(`[Ciprpulse] Broadcasting to ${targetCount} peers (Total: ${totalNodes})...`);

    // Get Local Entry Data to send
    const myEntry = getEntry(db, config.za);
    if (!myEntry) {
      console.warn('[Ciprpulse] Local entry not found in DB! Cannot broadcast.');
      return;
    }

    // Select Random Peers
    const stmt = db.prepare(`SELECT za FROM ciprdup ORDER BY RANDOM() LIMIT ?`);
    const rows = stmt.all(targetCount);

    for (const row of rows) {
      if (row.za === config.za) continue;

      // SSRF Prevention: Validate za is not localhost/private
      if (row.za.includes('localhost') || row.za.includes('127.0.0.1') || row.za.includes('::1')) {
        if (config.debug) console.warn(`[Ciprpulse] Skipping broadcast to private peer: ${row.za}`);
        continue;
      }

      const peerUrl = `https://ciprnode.${row.za}/${config.za}`; // PUT /<za>
      console.log(`[Ciprpulse] Broadcast PUT -> ${peerUrl}`);

      try {
        const response = await fetch(peerUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/hal+json',
          },
          body: JSON.stringify(myEntry), // Send full entry data
          signal: AbortSignal.timeout(10000),
        });

        if (config.debug) console.log(`[DBG] Broadcast to ${row.za}: ${response.status}`);
      } catch (e) {
        if (config.debug) console.log(`[DBG] Broadcast failed to ${row.za}: ${e.message}`);
      }
    }
  } catch (e) {
    console.error(`[Ciprpulse] Broadcast error: ${e.message}`);
  }
};

import { generateCiprHash } from '../core/utils.js';
import { verifyNode } from '../core/verification.js';
import { deleteEntry } from '../db/repo.js';

/**
 * Runs a cycle of random audits and viral propagation.
 * @param {import('@db/sqlite').Database} db
 * @param {import('../core/config.js').CiprNodeConfig} config
 */
const runPulseChecks = async (db, config) => {
  // console.log('CiprPulse: Running background checks...');
  const totalNodes = countEntries(db);
  if (totalNodes === 0) return;

  const nodesPerPulse = calculateNodesPerPulse(totalNodes, config.expected_propagation_time);

  // 1. Select N random entries from DB to audit
  // Logic: "Randomly select calculateNodesPerPulse() entries from its ciprdup"
  const auditCount = nodesPerPulse;

  // Efficient random selection for SQLite
  // Note: For very large DBs, rowid range query is faster than ORDER BY RANDOM(), but this is fine for now.
  const auditEntries = db.prepare(`SELECT * FROM ciprdup ORDER BY RANDOM() LIMIT ?`).all(
    auditCount,
  );

  if (auditEntries.length === 0) return;

  console.log(`[CiprPulse] Auditing ${auditEntries.length} entries...`);

  for (const entry of auditEntries) {
    if (!entry.za) continue;

    // A. Integrity Check (Hash) & Verification
    // Reconstruct Hash
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

    // "check their correctness with the validator.js functions"
    const isValid = await verifyNode(config, entry.za, calculatedHash);

    // Select N random peers to propagate to (PUT or DELETE)
    // "send a PUT/DELETE to calculateNodesPerPulse() randomly selected nodes"
    // We shouldn't send to ourselves or the node we just checked (unless it's invalid?)
    // Actually, sending to random peers is the spec.
    const peerEntries = db.prepare(`SELECT za FROM ciprdup ORDER BY RANDOM() LIMIT ?`).all(
      nodesPerPulse,
    );

    // Filter out self
    const targets = peerEntries.filter((p) => p.za !== config.za);

    if (isValid) {
      // B. Valid Entry -> Propagate PUT
      if (config.debug) {
        console.log(
          `[CiprPulse] ${entry.za} is VALID. Propagating PUT to ${targets.length} peers.`,
        );
      }

      for (const target of targets) {
        // Send PUT
        // Note: Avoid sending back to the source if known? Random is fine.
        if (target.za === entry.za) continue; // Don't send PUT to the node itself (it knows)

        sendPulseRequest(config, target.za, 'PUT', entry);
      }
    } else {
      // C. Invalid Entry -> Propagate DELETE
      console.log(
        `[CiprPulse] ${entry.za} is INVALID/UNREACHABLE. Deleting locally and propagating DELETE.`,
      );

      // 1. Delete locally
      deleteEntry(db, entry.za);

      // 2. Propagate DELETE
      for (const target of targets) {
        // Skip if target matches the entry we are deleting (it might be the dead node)
        // Actually, if it's dead, sending DELETE to it is futile but harmless.
        // If it's malicious/invalid, telling it to delete itself is funny but maybe useful?
        // Spec says "validations fails -> DELETE to N nodes".
        sendPulseRequest(config, target.za, 'DELETE', null, entry.za);
      }
    }
  }
};

/**
 * Helper to send Pulse requests (PUT/DELETE)
 */
const sendPulseRequest = (config, targetZa, method, body, resourceZa) => {
  const url = `https://ciprnode.${targetZa}/${resourceZa || body.za}/`;
  try {
    const options = {
      method: method,
      headers: {
        'Accept': 'application/hal+json',
      },
    };

    if (method === 'PUT' && body) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    if (config.debug) console.log(`[CiprPulse] Sending ${method} -> ${url}`);

    // We don't await the result strictly to block, but we want to catch errors.
    // Parallelizing inside the loop or fire-and-forget?
    // Let's await to avoid flooding if N is large?
    // "must start one of the following actions every expected_propagation_time"
    // If we block too long, we drift. But JS is single threaded event loop.
    // fetch is async.

    fetch(url, { ...options, signal: AbortSignal.timeout(10000) }).then((res) => {
      if (config.debug) {
        if (!res.ok) console.log(`[CiprPulse] ${method} to ${targetZa} failed: ${res.status}`);
      }
    }).catch((err) => {
      const msg = err.message || '';
      // Check for common connection errors
      if (
        msg.includes('connection error') || msg.includes('connection reset') ||
        msg.includes('connection refused') || msg.includes('Failed to fetch')
      ) {
        console.warn(`[WARN] CiprPulse Broadcast to ${targetZa} failed: Connection Error.`);
        console.warn(
          `       -> The peer might be offline, unreachable, or running on a non-standard port.`,
        );
        if (config.debug) console.warn(`       -> Details: ${msg}`);
      } else {
        if (config.debug) console.log(`[CiprPulse] ${method} to ${targetZa} error: ${msg}`);
      }
    });
  } catch (e) {
    if (config.debug) console.log(`[CiprPulse] Request setup error: ${e.message}`);
  }
};

/**
 * Runs self-validation logic.
 * @param {import('../core/config.js').CiprNodeConfig} config
 * @param {import('@db/sqlite').Database} db
 */
const runSelfValidation = async (config, db) => {
  // console.log('[CiprPulse] Running self-validation...');
  const isValid = validateCiprConfig(config, false); // exitOnFail = false

  // If we are alone, we can't really broadcast, but we can check integrity.
  // calculateNodesPerPulse requires > 0 usually? Utils says max(1, ...).

  if (isValid) {
    if (config.debug) console.log('[CiprPulse] Self-validation passed.');
    // "if the validation is successful, a PUT for its own za must be sent to ... randomly selected nodes"
    // We can reuse broadcastUpdate logic but tailored to random selection instead of "all" if broadcastUpdate was "all"?
    // broadcastUpdate actually did random selection of N nodes. So we can just call it?
    // Wait, broadcastUpdate uses `calculateNodesPerPulse(totalNodes, config.expected_propagation_time)` internally.
    // And it sends PUT.
    // So we can just call `broadcastUpdate(config, db)`.
    await broadcastUpdate(config, db);
  } else {
    // Retry Logic (3 retries)
    // We already failed once.
    // Spec: "If the self validation fails after 3 retries"
    // So we should retry 3 MORE times? Or 3 times total? Usually "retries" means extra attempts.
    // Since this is a scheduled task, blocking here for retries might be okay if delay is short?
    // Or just count failures?
    // Simplest interpretation: Try... Catch/Fail -> Retry 1..2..3 -> explode.

    console.warn('[CiprPulse] Self-validation failed! Retrying...');
    let retrySuccess = false;
    for (let i = 1; i <= 3; i++) {
      await new Promise((r) => setTimeout(r, 1000)); // Wait 1s between retries? Validating config is fast though.
      // If config is invalid, it's likely static invalid unless file changed?
      // Validator checks config struct. If loaded config is bad, it stays bad until reload.
      // But maybe some external check? Validator.js checks regexes on config object.
      // If config object is bad, it's bad. Retrying won't change it unless we reload config?
      // "the ciprnode must self validate it's own sanity"
      // Maybe we should reload config?
      // For now, simple re-check (maybe ephemeral state changed?).
      if (validateCiprConfig(config, false)) {
        retrySuccess = true;
        console.log(`[CiprPulse] Self-validation passed on retry ${i}.`);
        await broadcastUpdate(config, db);
        break;
      }
      console.warn(`[CiprPulse] Self-validation retry ${i} failed.`);
    }

    if (!retrySuccess) {
      // Failed after retries.
      // "a DELETE request for its own za must be sent to ... randomly selected nodes"
      // "HUGE alert must be shown in the console"

      console.error(`
      ################################################################
      #                                                              #
      #  CRITICAL ALERT: SELF-VALIDATION FAILED AFTER RETRIES        #
      #                                                              #
      #  This node is invalid. Sending self-destruct (DELETE)        #
      #  signals to the network to maintain Cipr integrity.          #
      #                                                              #
      ################################################################
      `);

      // Broadcast DELETE
      const totalNodes = countEntries(db);
      if (totalNodes > 0) {
        const nodesPerPulse = calculateNodesPerPulse(
          totalNodes,
          config.expected_propagation_time,
        );
        const peers = db.prepare(`SELECT za FROM ciprdup ORDER BY RANDOM() LIMIT ?`).all(
          nodesPerPulse,
        );

        for (const peer of peers) {
          if (peer.za === config.za) continue;
          // sendPulseRequest is (config, targetZa, method, body, resourceZa)
          // For DELETE, body is null, resourceZa is config.za
          sendPulseRequest(config, peer.za, 'DELETE', null, config.za);
        }
      }
    }
  }
};
