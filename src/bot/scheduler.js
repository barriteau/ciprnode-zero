/**
 * @file src/bot/scheduler.js
 * @description Scheduling logic for Ciprpulse maintenance tasks.
 */

import { countEntries, getEntry, searchEntries } from '../db/repo.js';
import { calculateNodesPerPulse, msg } from '../core/utils.js';
import { validateCiprConfig } from '../core/validator.js';
// import { verifyNode } from '../core/verification.js'; // reused? No, broadcast is PUT.

/**
 * Starts the internal scheduler.
 * @param {import('../core/config.js').CiprNodeConfig} config
 * @param {import('@db/sqlite').Database} db
 * @param {boolean} txtUpdated
 */
export const startScheduler = async (config, db, txtUpdated) => {
  msg('Starting Ciprpulse scheduler...');

  // 1. Check for Initial Broadcast requirement
  if (txtUpdated) {
    msg('Local TXT record updated. Broadcasting update...');
    await broadcastUpdate(config, db);
  }

  // 2. Periodic Tasks (Ciprpulse)
  const PULSE_INTERVAL = Math.max(1000, config.expected_propagation_time || 8000);
  msg(`Scheduler interval set to ${PULSE_INTERVAL}ms`);

  setInterval(() => {
    runPulseChecks(db, config);
    runReliabilityChecks(db, config);
  }, PULSE_INTERVAL);

  // 3. Self Validation Task
  // "every 3 expected_propagation_time"
  const SELF_VALIDATION_INTERVAL = 3 * config.expected_propagation_time;
  msg(`Self-validation interval set to ${SELF_VALIDATION_INTERVAL}ms`);

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
      msg('No peers to broadcast to.');
      return;
    }

    const nodesPerPulse = calculateNodesPerPulse(totalNodes, config.expected_propagation_time);
    const targetCount = Math.min(totalNodes, nodesPerPulse);

    msg(`Broadcasting to ${targetCount} peers (Total: ${totalNodes})...`);

    // Get Local Entry Data to send
    const myEntry = getEntry(db, config.za);
    if (!myEntry) {
      msg('Local entry not found in DB! Cannot broadcast.', 'WA');
      return;
    }

    // Select Random Peers (Excluding self)
    const stmt = db.prepare(`SELECT za FROM ciprdup WHERE za != ? ORDER BY RANDOM() LIMIT ?`);
    const rows = stmt.all(config.za, targetCount);

    for (const row of rows) {
      // SSRF Prevention: Validate za is not localhost/private
      if (row.za.includes('localhost') || row.za.includes('127.0.0.1') || row.za.includes('::1')) {
        if (config.debug) msg(`Skipping broadcast to private peer: ${row.za}`, 'WA');
        continue;
      }

      const peerUrl = `https://ciprnode.${row.za}/${config.za}`; // PUT /<za>
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

        if (config.log_level >= 2) {
          const parsedUrl = new URL(peerUrl);
          msg(`Outgoing request:\n  Method: PUT\n  Path: ${parsedUrl.pathname}\n  To: ${parsedUrl.hostname}`, 'REQ');
          msg(`  Incoming Response: ${response.status}`, 'RES');
        }
      } catch (e) {
        if (config.debug) msg(`[DBG] Broadcast failed to ${row.za}: ${e.message}`);
      }
    }
  } catch (e) {
    msg(`Broadcast error: ${e.message}`, 'KO');
  }
};

import { generateCiprHash } from '../core/utils.js';
import { verifyNode, verifyReliability } from '../core/verification.js';
import { generateRandomFTSExpression } from '../core/fts_generator.js';
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
  const auditEntries = db.prepare(`SELECT * FROM ciprdup WHERE za != ? ORDER BY RANDOM() LIMIT ?`)
    .all(
      config.za,
      auditCount,
    );

  if (auditEntries.length === 0) return;

  msg(`Auditing ${auditEntries.length} entries...`);

  for (const entry of auditEntries) {
    if (!entry.za) continue;

    // A. Integrity Check (Hash) & Verification
    // Reconstruct Hash
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

    // "check their correctness with the validator.js functions"
    const isValid = await verifyNode(config, entry.za, calculatedHash);

    // Select N random peers to propagate to (PUT or DELETE)
    // "send a PUT/DELETE to calculateNodesPerPulse() randomly selected nodes"
    // We shouldn't send to ourselves or the node we just checked (unless it's invalid?)
    // Actually, sending to random peers is the spec.
    const peerEntries = db.prepare(`SELECT za FROM ciprdup WHERE za != ? ORDER BY RANDOM() LIMIT ?`)
      .all(
        config.za,
        nodesPerPulse,
      );

    const targets = peerEntries;

    if (isValid) {
      // B. Valid Entry -> Propagate PUT
      if (config.debug) {
        msg(
          `${entry.za} is VALID. Propagating PUT to ${targets.length} peers.`,
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
      msg(
        `${entry.za} is INVALID/UNREACHABLE. Deleting locally and propagating DELETE.`,
        'WA'
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

    // We don't await the result strictly to block...
    fetch(url, { ...options, signal: AbortSignal.timeout(10000) }).then((res) => {
      if (config.log_level >= 2) {
        const parsedUrl = new URL(url);
        msg(`Outgoing request:\n  Method: ${method}\n  Path: ${parsedUrl.pathname}\n  To: ${parsedUrl.hostname}`, 'REQ');
        msg(`  Incoming Response: ${res.status}`, 'RES');
      }
      if (config.debug) {
        if (!res.ok) msg(`${method} to ${targetZa} failed: ${res.status}`, 'WA');
      }
    }).catch((err) => {
      const errMsg = err.message || '';
      // Check for common connection errors
      if (
        errMsg.includes('connection error') || errMsg.includes('connection reset') ||
        errMsg.includes('connection refused') || errMsg.includes('Failed to fetch')
      ) {
        msg(`CiprPulse Broadcast to ${targetZa} failed: Connection Error.`, 'WA');
        msg(
          `       -> The peer might be offline, unreachable, or running on a non-standard port.`,
          'WA'
        );
        if (config.debug) msg(`       -> Details: ${errMsg}`, 'WA');
      } else {
        if (config.debug) msg(`${method} to ${targetZa} error: ${errMsg}`, 'KO');
      }
    });
  } catch (e) {
    if (config.debug) msg(`Request setup error: ${e.message}`, 'KO');
  }
};

/**
 * Runs self-validation logic.
 * @param {import('../core/config.js').CiprNodeConfig} config
 * @param {import('@db/sqlite').Database} db
 */
const runSelfValidation = async (config, db) => {
  // console.log('Running self-validation...');
  const isValid = validateCiprConfig(config, false); // exitOnFail = false

  // If we are alone, we can't really broadcast, but we can check integrity.
  // calculateNodesPerPulse requires > 0 usually? Utils says max(1, ...).

  if (isValid) {
    if (config.debug) msg('Self-validation passed.');
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

    msg('Self-validation failed! Retrying...', 'WA');
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
        msg(`Self-validation passed on retry ${i}.`);
        await broadcastUpdate(config, db);
        break;
      }
      msg(`Self-validation retry ${i} failed.`, 'WA');
    }

    if (!retrySuccess) {
      // Failed after retries.
      // "a DELETE request for its own za must be sent to ... randomly selected nodes"
      // "HUGE alert must be shown in the console"

      msg(`
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
        const peers = db.prepare(`SELECT za FROM ciprdup WHERE za != ? ORDER BY RANDOM() LIMIT ?`)
          .all(
            config.za,
            nodesPerPulse,
          );

        for (const peer of peers) {
          // sendPulseRequest is (config, targetZa, method, body, resourceZa)
          // For DELETE, body is null, resourceZa is config.za
          sendPulseRequest(config, peer.za, 'DELETE', null, config.za);
        }
      }
    }
  }
};

/**
 * Runs a Reliability Validation checking peer result ranking consistency.
 * @param {import('@db/sqlite').Database} db
 * @param {import('../core/config.js').CiprNodeConfig} config
 */
const runReliabilityChecks = async (db, config) => {
  const totalNodes = countEntries(db);
  if (totalNodes <= 1) return;

  const nodesPerPulse = calculateNodesPerPulse(totalNodes, config.expected_propagation_time);

  // 1. Generate Parameters
  const ftsExpression = generateRandomFTSExpression(config);
  const pagesNum = Math.floor(Math.random() * 10) + 1; // 1 to 10
  const pagesSize = Math.random() < 0.5 ? 20 : 50;
  const paginationParams = { num: pagesNum, size: pagesSize };

  // 2. Execute Local Baseline Query
  const startOffset = (pagesNum - 1) * pagesSize;
  const options = {
    query: ftsExpression,
    ol: [],
    geo: {},
    timestamp: {},
    filters: {},
    pages: [{ offset: startOffset, limit: pagesSize, pageNum: pagesNum }],
    primary_lang: [],
  };

  const baselineItems = searchEntries(db, options);
  const baselineRank = baselineItems.map((item) => item.za);

  // 3. Select Target Peers (Timestamp older than 1 hour)
  // Unix timestamp in seconds for 1 hour ago
  const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;

  // Try to gather N targets
  // Technically, we try to gather up to N targets that match. If there are fewer than N available, we just use what we found.
  const targets = db.prepare(
    `SELECT za FROM ciprdup WHERE za != ? AND timestamp <= ? ORDER BY RANDOM() LIMIT ?`,
  )
    .all(config.za, oneHourAgo, nodesPerPulse);

  if (targets.length === 0) {
    if (config.debug) {
      msg('No eligible peers (older than 1h) available for Reliability Check.');
    }
    return;
  }

  if (config.debug) {
    msg(`Running Reliability Check on ${targets.length} peer(s).`);
  }

  // 4. Validate and Enforce
  for (const target of targets) {
    // Await prevents overloading network if there are many targets, matching pulse behavior mostly.
    const isReliable = await verifyReliability(
      target.za,
      ftsExpression,
      paginationParams,
      baselineRank,
      config,
    );

    if (!isReliable) {
      msg(
        `${target.za} FAILED Reliability Check. Evicting and propagating DELETE...`,
      );

      // Delete locally
      deleteEntry(db, target.za);

      // Propagate DELETE to random peers
      const peerEntries = db.prepare(
        `SELECT za FROM ciprdup WHERE za != ? ORDER BY RANDOM() LIMIT ?`,
      )
        .all(config.za, nodesPerPulse);

      for (const peer of peerEntries) {
        sendPulseRequest(config, peer.za, 'DELETE', null, target.za);
      }
    }
  }
};
