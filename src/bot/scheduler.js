/**
 * @file src/bot/scheduler.js
 * @description Scheduling logic for Ciprpulse maintenance tasks.
 */

import { countEntries, getEntry, searchEntries } from '../db/repo.js';
import { calculateNodesPerPulse, msg, safeFetch } from '../core/utils.js';
import { validateCiprConfig } from '../core/validator.js';
import { notify, runDigest } from '../core/notify.js';

/**
 * Starts the internal scheduler.
 * @param {import('../core/config.js').CiprNodeConfig} config
 * @param {import('@db/sqlite').Database} db
 * @param {boolean} txtUpdated
 */
export const startScheduler = async (config, db, txtUpdated) => {
  msg('Starting Ciprpulse scheduler...');

  if (txtUpdated) {
    msg('Local TXT record updated. Broadcasting update...');
    await broadcastUpdate(config, db);
  }

  const PULSE_INTERVAL = Math.max(1000, config.expected_propagation_time || 8000);
  msg(`Scheduler interval set to ${PULSE_INTERVAL}ms`);

  let peersAudited = 0;

  setInterval(() => {
    runPulseChecks(db, config).then((count) => { peersAudited = count; });
    runReliabilityChecks(db, config);
  }, PULSE_INTERVAL);

  const SELF_VALIDATION_INTERVAL = 3 * config.expected_propagation_time;
  msg(`Self-validation interval set to ${SELF_VALIDATION_INTERVAL}ms`);

  setInterval(() => {
    runSelfValidation(config, db);
  }, SELF_VALIDATION_INTERVAL);

  // Periodic digest
  const digestInterval = config.notifications?.digest_interval;
  if (digestInterval && digestInterval > 0 && config.notifications?.enabled) {
    msg(`Notification digest interval set to ${digestInterval}ms`);
    setInterval(() => {
      runDigest(config, db, peersAudited);
    }, digestInterval);
  }
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
        const response = await safeFetch(peerUrl, {
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

const PULSE_CONCURRENCY_LIMIT = 5;

const runConcurrent = async (tasks, limit) => {
  const queue = [...tasks];
  const running = new Set();

  const runNext = () => {
    if (queue.length === 0) return;
    const task = queue.shift();
    const p = task().finally(() => {
      running.delete(p);
      return runNext();
    });
    running.add(p);
  };

  const initial = Math.min(limit, queue.length);
  await Promise.allSettled(Array.from({ length: initial }, runNext));

  if (running.size > 0) await Promise.allSettled([...running]);
};

/**
 * Runs a cycle of random audits and viral propagation.
 * Entries are audited concurrently (up to PULSE_CONCURRENCY_LIMIT) to prevent
 * sequential verification from stacking beyond the pulse interval at higher counts.
 * @param {import('@db/sqlite').Database} db
 * @param {import('../core/config.js').CiprNodeConfig} config
 */
const runPulseChecks = async (db, config) => {
  const totalNodes = countEntries(db);
  if (totalNodes === 0) return;

  const nodesPerPulse = calculateNodesPerPulse(totalNodes, config.expected_propagation_time);

  const auditEntries = db.prepare(`SELECT * FROM ciprdup WHERE za != ? ORDER BY RANDOM() LIMIT ?`)
    .all(config.za, nodesPerPulse);

  if (auditEntries.length === 0) return;

  msg(`Auditing ${auditEntries.length} entries (concurrency: ${PULSE_CONCURRENCY_LIMIT})...`);

  // Deduplicate by za (Vector C: prevent concurrent tasks from racing on the same entry)
  const seen = new Set();
  const tasks = auditEntries
    .filter((entry) => entry.za && !seen.has(entry.za) && seen.add(entry.za))
    .map((entry) => async () => {
      const calculatedHash = await generateCiprHash(
        entry.za, entry.title, entry.description, entry.keywords,
        entry.offering, entry.seeking, entry.primary_lang,
        entry.ol, entry.latitude, entry.longitude,
      );

      const isValid = await verifyNode(config, entry.za, calculatedHash);

      const peerEntries = db.prepare(`SELECT za FROM ciprdup WHERE za != ? ORDER BY RANDOM() LIMIT ?`)
        .all(config.za, nodesPerPulse);

      if (isValid) {
        if (config.debug) msg(`${entry.za} is VALID. Propagating PUT to ${peerEntries.length} peers.`);
        for (const target of peerEntries) {
          if (target.za !== entry.za) sendPulseRequest(config, target.za, 'PUT', entry);
        }
      } else {
        msg(`${entry.za} is INVALID/UNREACHABLE. Deleting locally and propagating DELETE.`, 'WA');
        deleteEntry(db, entry.za, 'verification_failed');
        for (const target of peerEntries) {
          sendPulseRequest(config, target.za, 'DELETE', null, entry.za);
        }
      }
    });

  await runConcurrent(tasks, PULSE_CONCURRENCY_LIMIT);
  return auditEntries.length;
};

/**
 * Sends a fire-and-forget PUT or DELETE request to a peer.
 * PUT payloads always have their timestamp freshened to `Date.now()` before
 * sending — without this, entries older than 24h are rejected by the receiver's
 * Currentness Validation check (Vector A fix).
 * @param {import('../core/config.js').CiprNodeConfig} config
 * @param {string} targetZa - Target peer zone apex.
 * @param {'PUT'|'DELETE'} method
 * @param {Object|null} body - Entry payload (PUT only).
 * @param {string} [resourceZa] - Za of the resource being deleted (DELETE only).
 */
const sendPulseRequest = (config, targetZa, method, body, resourceZa) => {
  // Vector E: guard against undefined resource identity before constructing URL
  const entryZa = resourceZa || (body && body.za);
  if (!entryZa) {
    if (config.debug) msg(`[DBG] sendPulseRequest: called with no resolvable za. Skipping.`, 'WA');
    return;
  }

  const url = `https://ciprnode.${targetZa}/${entryZa}/`;
  try {
    const options = {
      method: method,
      headers: {
        'Accept': 'application/hal+json',
      },
    };

    if (method === 'PUT' && body) {
      options.headers['Content-Type'] = 'application/json';
      // Vector A: freshen timestamp so the receiving node's 24h Currentness Validation passes.
      const freshBody = { ...body, timestamp: Math.floor(Date.now() / 1000) };
      options.body = JSON.stringify(freshBody);
    }

    safeFetch(url, { ...options, signal: AbortSignal.timeout(10000) }).then((res) => {
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
  const isValid = validateCiprConfig(config, false);

  if (isValid) {
    if (config.debug) msg('Self-validation passed.');
    await broadcastUpdate(config, db);
  } else {
    msg('Self-validation failed! Retrying...', 'WA');
    let retrySuccess = false;
    for (let i = 1; i <= 3; i++) {
      await new Promise((r) => setTimeout(r, 1000));
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

      notify('self_validation_failed');

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
 * Peers are checked concurrently (up to PULSE_CONCURRENCY_LIMIT).
 * @param {import('@db/sqlite').Database} db
 * @param {import('../core/config.js').CiprNodeConfig} config
 */
const runReliabilityChecks = async (db, config) => {
  const totalNodes = countEntries(db);
  if (totalNodes <= 1) return;

  const nodesPerPulse = calculateNodesPerPulse(totalNodes, config.expected_propagation_time);

  const ftsExpression = generateRandomFTSExpression(config);
  const pagesNum = Math.floor(Math.random() * 10) + 1;
  const pagesSize = Math.random() < 0.5 ? 20 : 50;
  const paginationParams = { num: pagesNum, size: pagesSize };

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

  const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
  const targets = db.prepare(
    `SELECT za FROM ciprdup WHERE za != ? AND timestamp <= ? ORDER BY RANDOM() LIMIT ?`,
  ).all(config.za, oneHourAgo, nodesPerPulse);

  if (targets.length === 0) {
    if (config.debug) msg('No eligible peers (older than 1h) available for Reliability Check.');
    return;
  }

  if (config.debug) msg(`Running Reliability Check on ${targets.length} peer(s) (concurrency: ${PULSE_CONCURRENCY_LIMIT}).`);

  const tasks = targets.map((target) => async () => {
    const isReliable = await verifyReliability(target.za, ftsExpression, paginationParams, baselineRank, config);

    if (!isReliable) {
      msg(`${target.za} FAILED Reliability Check. Evicting and propagating DELETE...`);
      deleteEntry(db, target.za, 'reliability_failed');

      const peerEntries = db.prepare(
        `SELECT za FROM ciprdup WHERE za != ? ORDER BY RANDOM() LIMIT ?`,
      ).all(config.za, nodesPerPulse);

      for (const peer of peerEntries) {
        sendPulseRequest(config, peer.za, 'DELETE', null, target.za);
      }
    }
  });

  await runConcurrent(tasks, PULSE_CONCURRENCY_LIMIT);
};
