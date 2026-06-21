/**
 * @file src/core/notify.js
 * @description Notification dispatch hub. Loads providers, routes events,
 * and provides a fire-and-forget notify() function for all trigger points.
 */

import { msg } from './utils.js';

/** @type {Map<string, Function>} providerName → send(subject, body, providerConfig) */
let providers = null;

/** @type {Map<string, string[]>} eventName → providerNames */
let eventRouting = null;

/** @type {boolean} */
let enabled = false;

/** @type {Object} Full notifications config section */
let notifyConfig = null;

/** @type {import('./config.js').CiprNodeConfig} */
let nodeConfig = null;

/** @type {number} Timestamp of scheduler start for uptime calculation */
let startTime = 0;

/** @type {Map<string, number>} IP → last notification timestamp for rate_limit_hit throttling */
const rateLimitNotifyCooldown = new Map();
const RL_NOTIFY_COOLDOWN_MS = 5 * 60 * 1000;

const VALID_EVENTS = [
  'startup_completed',
  'startup_failed',
  'self_validation_failed',
  'node_added',
  'node_removed',
  'bootstrap_completed',
  'bootstrap_failed',
  'dns_updated',
  'rate_limit_hit',
  'periodic_digest',
];

/**
 * Formats an event into a subject line and plain text body.
 * @param {string} event
 * @param {Object} data
 * @returns {{subject: string, body: string}}
 */
const formatEvent = (event, data) => {
  const za = nodeConfig?.za || 'unknown';
  const ts = new Date().toISOString();

  switch (event) {
    case 'startup_completed':
      return {
        subject: `[INFO] ${za}: Startup completed`,
        body: [
          `Node:     ${za}`,
          `Event:    Startup sequence completed`,
          `Duration: ${data.duration ?? 'N/A'}`,
          `Entries:  ${data.entryCount ?? 'N/A'}`,
          `Time:     ${ts}`,
          `URL:      https://ciprnode.${za}/`,
        ].join('\n'),
      };

    case 'startup_failed':
      return {
        subject: `[CRITICAL] ${za}: Startup failed`,
        body: [
          `Node:     ${za}`,
          `Event:    Startup sequence failed`,
          `Reason:   ${data.reason ?? 'unknown error'}`,
          `Time:     ${ts}`,
          `URL:      https://ciprnode.${za}/`,
        ].join('\n'),
      };

    case 'self_validation_failed':
      return {
        subject: `[CRITICAL] ${za}: Self-validation failed`,
        body: [
          `Node:     ${za}`,
          `Event:    Self-validation failed after 3 retries`,
          `Time:     ${ts}`,
          `Action:   Self-destruct DELETE signals sent to peers`,
          `URL:      https://ciprnode.${za}/`,
        ].join('\n'),
      };

    case 'node_added':
      return {
        subject: `[INFO] ${za}: New node added — ${data.za}`,
        body: [
          `Node:     ${za}`,
          `Event:    New entry added to ciprdup`,
          `Entry:    ${data.za}`,
          `Title:    ${data.title || 'N/A'}`,
          `Time:     ${ts}`,
          `URL:      https://ciprnode.${za}/`,
        ].join('\n'),
      };

    case 'node_removed':
      return {
        subject: `[INFO] ${za}: Node removed — ${data.za}`,
        body: [
          `Node:     ${za}`,
          `Event:    Entry removed from ciprdup`,
          `Entry:    ${data.za}`,
          `Reason:   ${data.reason || 'unknown'}`,
          `Time:     ${ts}`,
          `URL:      https://ciprnode.${za}/`,
        ].join('\n'),
      };

    case 'bootstrap_completed':
      return {
        subject: `[INFO] ${za}: Bootstrap sync completed`,
        body: [
          `Node:     ${za}`,
          `Event:    Initial bootstrap sync succeeded`,
          `Entries:  ${data.entries ?? 'N/A'}`,
          `Duration: ${data.duration ?? 'N/A'}`,
          `Time:     ${ts}`,
          `URL:      https://ciprnode.${za}/`,
        ].join('\n'),
      };

    case 'bootstrap_failed':
      return {
        subject: `[WARNING] ${za}: Bootstrap sync failed`,
        body: [
          `Node:     ${za}`,
          `Event:    Bootstrap sync failed after retry window`,
          `Elapsed:  ${data.elapsed ?? 'N/A'}`,
          `Time:     ${ts}`,
          `Status:   Node operating in isolated mode`,
          `URL:      https://ciprnode.${za}/`,
        ].join('\n'),
      };

    case 'dns_updated':
      return {
        subject: `[INFO] ${za}: DNS TXT record updated`,
        body: [
          `Node:     ${za}`,
          `Event:    DNS TXT record auto-updated`,
          `New Hash: ${data.ciprHash ?? 'N/A'}`,
          `Time:     ${ts}`,
          `URL:      https://ciprnode.${za}/`,
        ].join('\n'),
      };

    case 'rate_limit_hit':
      return {
        subject: `[WARNING] ${za}: Rate limit exceeded`,
        body: [
          `Node:     ${za}`,
          `Event:    Rate limit exceeded`,
          `IP:       ${data.ip ?? 'unknown'}`,
          `Method:   ${data.method ?? 'unknown'}`,
          `Time:     ${ts}`,
          `URL:      https://ciprnode.${za}/`,
        ].join('\n'),
      };

    case 'periodic_digest':
      return {
        subject: `[DIGEST] ${za}: Status report`,
        body: [
          `CiprNode Status Digest — ${za}`,
          `${'─'.repeat(40)}`,
          `Uptime:        ${data.uptime ?? 'N/A'}`,
          `Entries:       ${data.entryCount ?? 'N/A'}`,
          `DB size:       ${data.dbSize ?? 'N/A'}`,
          `Last pulse:    ${data.lastPulse ?? 'N/A'}`,
          `Peers audited: ${data.peersAudited ?? 'N/A'} (last cycle)`,
          `Memory (RSS):  ${data.memory ?? 'N/A'}`,
          `${'─'.repeat(40)}`,
          `Node: https://ciprnode.${za}/`,
          `Time: ${ts}`,
        ].join('\n'),
      };

    default:
      return {
        subject: `[INFO] ${za}: ${event}`,
        body: [
          `Node:  ${za}`,
          `Event: ${event}`,
          `Time:  ${ts}`,
          `Data:  ${JSON.stringify(data)}`,
        ].join('\n'),
      };
  }
};

/**
 * Initializes the notification system. Must be called once after config is loaded.
 * @param {import('./config.js').CiprNodeConfig} config
 * @param {Function} [setRepoCallbacks] — function to wire insert/delete callbacks into repo.js
 */
export const initNotifications = async (config) => {
  nodeConfig = config;
  startTime = Date.now();

  const nc = config.notifications;
  if (!nc || !nc.enabled) {
    console.log('[notify] Notifications disabled or not configured.');
    enabled = false;
    return;
  }

  console.log('[notify] Initializing notifications...');
  notifyConfig = nc;
  enabled = true;
  providers = new Map();
  eventRouting = new Map();

  const providerNames = Array.isArray(nc.providers) ? nc.providers : (nc.provider ? [nc.provider] : []);
  console.log(`[notify] Providers: ${providerNames.join(', ')}`);

  for (const name of providerNames) {
    try {
      const modPath = `${Deno.cwd()}/integrations/notifications/${name}.js`.replace(/\\/g, '/');
      console.log(`[notify] Loading provider from: ${modPath}`);
      const mod = await import(`file:///${modPath}`);
      providers.set(name, (subject, body) => {
        const providerConfig = nc[name] || {};
        return mod.send(subject, body, providerConfig);
      });
      console.log(`[notify] Provider loaded: ${name}`);
      msg(`[OK] Notification provider loaded: ${name}`);
    } catch (e) {
      console.error(`[notify] Failed to load provider '${name}': ${e.message}`);
      msg(`Failed to load notification provider '${name}': ${e.message}`, 'KO');
    }
  }

  if (providers.size === 0) {
    console.log('[notify] No providers loaded. Disabling notifications.');
    enabled = false;
    return;
  }

  // Build event routing: config.events overrides, default is all events → all providers
  const configuredEvents = nc.events || {};
  for (const event of VALID_EVENTS) {
    const targets = configuredEvents[event];
    if (Array.isArray(targets) && targets.length > 0) {
      eventRouting.set(event, targets.filter((p) => providers.has(p)));
    } else {
      eventRouting.set(event, [...providers.keys()]);
    }
  }

  console.log(`[notify] Event routing configured for ${eventRouting.size} events.`);

  // Wire repo callbacks for node_added / node_removed events
  const { setRepoCallbacks } = await import('../db/repo.js');
  setRepoCallbacks(
    (entry) => notify('node_added', { za: entry.za, title: entry.title, timestamp: entry.timestamp }),
    (za, reason) => notify('node_removed', { za, reason }),
  );

  msg(`[OK] Notifications enabled with ${providers.size} provider(s).`);
};

/**
 * Dispatches a notification event to all configured providers.
 * Fire-and-forget: errors are logged but never thrown.
 * @param {string} event - Event name from VALID_EVENTS.
 * @param {Object} [data={}] - Event-specific data.
 */
export const notify = (event, data = {}) => {
  if (!enabled || !providers || providers.size === 0) {
    console.log(`[notify] Skipped "${event}" — notifications disabled or no providers.`);
    return;
  }

  // Throttle rate_limit_hit per IP
  if (event === 'rate_limit_hit' && data.ip) {
    const now = Date.now();
    const last = rateLimitNotifyCooldown.get(data.ip);
    if (last && now - last < RL_NOTIFY_COOLDOWN_MS) return;
    rateLimitNotifyCooldown.set(data.ip, now);
  }

  const targets = eventRouting.get(event) || [];
  if (targets.length === 0) {
    console.log(`[notify] No targets for event "${event}".`);
    return;
  }

  const { subject, body } = formatEvent(event, data);
  console.log(`[notify] Dispatching "${event}" to ${targets.join(', ')}`);

  for (const providerName of targets) {
    const send = providers.get(providerName);
    if (send) {
      send(subject, body).then((ok) => {
        console.log(`[notify] ${providerName} send ${ok ? 'OK' : 'FAILED'} for "${event}"`);
      }).catch((e) => {
        console.error(`[notify] ${providerName} send error for "${event}": ${e.message}`);
        msg(`[notify] ${providerName} send failed: ${e.message}`, 'KO');
      });
    }
  }
};

/**
 * Runs the periodic status digest. Called by the scheduler.
 * @param {import('./config.js').CiprNodeConfig} config
 * @param {import('@db/sqlite').Database} db
 * @param {number} [peersAudited=0]
 */
export const runDigest = async (config, db, peersAudited = 0) => {
  if (!enabled) {
    console.log('[notify] Digest skipped — notifications disabled.');
    return;
  }

  console.log('[notify] Generating periodic digest...');
  try {
    const { countEntries } = await import('../db/repo.js');
    const entryCount = countEntries(db);

    let dbSize = 'N/A';
    try {
      const stat = await Deno.stat('./data/ciprdup.db');
      dbSize = `${(stat.size / (1024 * 1024)).toFixed(1)} MB`;
    } catch { /* ignore */ }

    const uptimeMs = Date.now() - startTime;
    const hours = Math.floor(uptimeMs / 3600000);
    const minutes = Math.floor((uptimeMs % 3600000) / 60000);
    const seconds = Math.floor((uptimeMs % 60000) / 1000);
    const uptime = `${hours}h ${minutes}m ${seconds}s`;

    const lastPulse = new Date().toISOString();

    let memory = 'N/A';
    try {
      const memInfo = Deno.memoryUsage();
      memory = `${(memInfo.rss / (1024 * 1024)).toFixed(1)} MB`;
    } catch { /* ignore */ }

    notify('periodic_digest', {
      entryCount,
      dbSize,
      uptime,
      lastPulse,
      peersAudited,
      memory,
    });
  } catch (e) {
    msg(`[notify] Digest generation failed: ${e.message}`, 'KO');
  }
};
