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
 * Wraps event data in a minimal responsive HTML email template.
 * Inline CSS only — email clients strip <style> blocks.
 * @param {string} za - Node zone apex.
 * @param {string} title - Event title (e.g. "Startup completed").
 * @param {Array<{label: string, value: string}>} rows - Key-value data rows.
 * @param {string} footerUrl - URL for the footer link.
 * @param {string} ts - ISO timestamp.
 * @param {boolean} [critical=false] - Red-tinted header for critical events.
 * @returns {string} Full HTML document.
 */
const htmlEmail = (za, title, rows, footerUrl, ts, critical = false) => {
  const headerBg = critical ? '#b71c1c' : '#1a1a2e';
  const headerColor = '#ffffff';
  const bodyBg = '#f5f5f5';
  const cardBg = '#ffffff';
  const labelColor = '#555555';
  const valueColor = '#111111';
  const footerColor = '#999999';
  const borderColor = '#e0e0e0';

  const rowHtml = rows.map(({ label, value }) =>
    `<tr><td style="padding:6px 16px;color:${labelColor};font-size:13px;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:6px 16px 6px 0;color:${valueColor};font-size:13px">${value}</td></tr>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${bodyBg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${bodyBg};padding:24px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:${cardBg};border-radius:8px;overflow:hidden;border:1px solid ${borderColor};max-width:600px">
<tr><td style="background:${headerBg};padding:20px 24px;color:${headerColor};font-size:18px;font-weight:600">
CiprNode &mdash; ${za}
</td></tr>
<tr><td style="padding:16px 24px 4px;color:${labelColor};font-size:14px;font-weight:500">
${title}
</td></tr>
<tr><td>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 16px">
${rowHtml}
</table>
</td></tr>
<tr><td style="padding:12px 24px;border-top:1px solid ${borderColor};color:${footerColor};font-size:12px">
<a href="${footerUrl}" style="color:${footerColor}">${footerUrl}</a> &middot; ${ts}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
};

/**
 * Formats an event into a subject line and HTML body.
 * @param {string} event
 * @param {Object} data
 * @returns {{subject: string, body: string}}
 */
const formatEvent = (event, data) => {
  const za = nodeConfig?.za || 'unknown';
  const ts = new Date().toISOString();
  const url = `https://ciprnode.${za}/`;

  switch (event) {
    case 'startup_completed':
      return {
        subject: `[INFO] ${za}: Startup completed`,
        body: htmlEmail(za, 'Startup sequence completed', [
          { label: 'Duration', value: data.duration ?? 'N/A' },
          { label: 'Entries', value: String(data.entryCount ?? 'N/A') },
          { label: 'Time', value: ts },
        ], url, ts),
      };

    case 'startup_failed':
      return {
        subject: `[CRITICAL] ${za}: Startup failed`,
        body: htmlEmail(za, 'Startup sequence failed', [
          { label: 'Reason', value: data.reason ?? 'unknown error' },
          { label: 'Time', value: ts },
        ], url, ts, true),
      };

    case 'self_validation_failed':
      return {
        subject: `[CRITICAL] ${za}: Self-validation failed`,
        body: htmlEmail(za, 'Self-validation failed after 3 retries', [
          { label: 'Action', value: 'Self-destruct DELETE signals sent to peers' },
          { label: 'Time', value: ts },
        ], url, ts, true),
      };

    case 'node_added':
      return {
        subject: `[INFO] ${za}: New node added — ${data.za}`,
        body: htmlEmail(za, 'New entry added to ciprdup', [
          { label: 'Entry', value: data.za ?? 'N/A' },
          { label: 'Title', value: data.title || 'N/A' },
          { label: 'Time', value: ts },
        ], url, ts),
      };

    case 'node_removed':
      return {
        subject: `[INFO] ${za}: Node removed — ${data.za}`,
        body: htmlEmail(za, 'Entry removed from ciprdup', [
          { label: 'Entry', value: data.za ?? 'N/A' },
          { label: 'Reason', value: data.reason || 'unknown' },
          { label: 'Time', value: ts },
        ], url, ts),
      };

    case 'bootstrap_completed':
      return {
        subject: `[INFO] ${za}: Bootstrap sync completed`,
        body: htmlEmail(za, 'Initial bootstrap sync succeeded', [
          { label: 'Entries', value: String(data.entries ?? 'N/A') },
          { label: 'Duration', value: data.duration ?? 'N/A' },
          { label: 'Time', value: ts },
        ], url, ts),
      };

    case 'bootstrap_failed':
      return {
        subject: `[WARNING] ${za}: Bootstrap sync failed`,
        body: htmlEmail(za, 'Bootstrap sync failed after retry window', [
          { label: 'Elapsed', value: data.elapsed ?? 'N/A' },
          { label: 'Status', value: 'Node operating in isolated mode' },
          { label: 'Time', value: ts },
        ], url, ts),
      };

    case 'dns_updated':
      return {
        subject: `[INFO] ${za}: DNS TXT record updated`,
        body: htmlEmail(za, 'DNS TXT record auto-updated', [
          { label: 'New Hash', value: data.ciprHash ?? 'N/A' },
          { label: 'Time', value: ts },
        ], url, ts),
      };

    case 'rate_limit_hit':
      return {
        subject: `[WARNING] ${za}: Rate limit exceeded`,
        body: htmlEmail(za, 'Rate limit exceeded', [
          { label: 'IP', value: data.ip ?? 'unknown' },
          { label: 'Method', value: data.method ?? 'unknown' },
          { label: 'Time', value: ts },
        ], url, ts),
      };

    case 'periodic_digest':
      return {
        subject: `[DIGEST] ${za}: Status report`,
        body: htmlEmail(za, 'Status report', [
          { label: 'Uptime', value: data.uptime ?? 'N/A' },
          { label: 'Entries', value: String(data.entryCount ?? 'N/A') },
          { label: 'DB size', value: data.dbSize ?? 'N/A' },
          { label: 'Last pulse', value: data.lastPulse ?? 'N/A' },
          { label: 'Peers audited', value: `${data.peersAudited ?? 'N/A'} (last cycle)` },
          { label: 'Memory (RSS)', value: data.memory ?? 'N/A' },
          { label: 'Time', value: ts },
        ], url, ts),
      };

    default:
      return {
        subject: `[INFO] ${za}: ${event}`,
        body: htmlEmail(za, event, [
          { label: 'Data', value: JSON.stringify(data) },
          { label: 'Time', value: ts },
        ], url, ts),
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
