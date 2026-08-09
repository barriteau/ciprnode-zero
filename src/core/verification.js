/**
 * @file src/core/verification.js
 * @description Centralized node verification logic (TXT + HTTP HEAD).
 */

import { verifyCiprHash } from './dns.js';
import { msg, safeFetch } from './utils.js';

/**
 * Verification result reason codes.
 * @enum {string}
 */
export const VERIFY_REASONS = {
  OK: 'ok',
  DNS_TXT_MISMATCH: 'dns_txt_mismatch',
  HTTP_UNREACHABLE: 'http_unreachable',
};

/**
 * Verifies if a ciprnode is valid by checking both DNS TXT record and HTTP reachability.
 * @param {import('./config.js').CiprNodeConfig} config
 * @param {string} za - The Zone Apex (domain) of the ciprnode.
 * @param {string} expectedHash - The expected SHA256 hash for the TXT record.
 * @returns {Promise<{valid: boolean, reason: string}>} Result with validity and reason code.
 */
export const verifyNode = async (config, za, expectedHash) => {
  if (Deno.env.get('TEST_MOCK_VERIFY_NODE') === 'true') {
    return { valid: true, reason: VERIFY_REASONS.OK };
  }

  const isTxtValid = await verifyCiprHash(config, za, expectedHash);
  if (!isTxtValid) {
    if (config.debug) {
      msg(`[DBG] Verification failed: TXT record mismatch or missing for ${za}`);
    }
    return { valid: false, reason: VERIFY_REASONS.DNS_TXT_MISMATCH };
  }

  const isHttpValid = await verifyNodeHttp(za, config);
  if (!isHttpValid) {
    if (config.debug) msg(`[DBG] Verification failed: HTTP HEAD check failed for ${za}`);
    return { valid: false, reason: VERIFY_REASONS.HTTP_UNREACHABLE };
  }

  return { valid: true, reason: VERIFY_REASONS.OK };
};

/**
 * Verifies if a ciprnode is reachable via HTTP HEAD request to /.
 * @param {string} za - The Zone Apex (domain).
 * @param {import('./config.js').CiprNodeConfig} [config] - Optional config for debug logging.
 * @returns {Promise<boolean>} True if 200 OK.
 */
export const verifyNodeHttp = async (za, config = {}) => {
  const url = `https://ciprnode.${za}/`;
  const maxRetries = 6;
  const retryDelay = 3000; // 3 seconds (increased from 2s for transient issue tolerance)

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (config.debug) {
        msg(`[DBG] Verifying HTTP HEAD (Attempt ${attempt}/${maxRetries}): ${url}`);
      }

      const response = await safeFetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(10000),
      });

      if (config.log_level >= 2) {
        msg(`Outgoing request:\n  Method: HEAD\n  Path: /\n  To: ciprnode.${za}`, 'REQ');
        msg(`  Incoming Response: ${response.status}`, 'RES');
      }

      if (response.ok) {
        return true;
      }
      // Treat 5xx as transient (server overload, Cloudflare hiccup) - retry
      if (response.status >= 500 && response.status < 600) {
        throw new Error(`Transient server error ${response.status}`);
      }
      // 4xx (except 429) is a permanent failure - don't retry
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        if (config.debug) msg(`[DBG] HTTP HEAD for ${url} returned ${response.status} (permanent failure).`);
        return false;
      }
      throw new Error(`Status ${response.status}`);
    } catch (error) {
      if (config.debug) {
        msg(`[DBG] HTTP HEAD failed for ${url} (Attempt ${attempt}): ${error.message}`);
      }

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }

  // All attempts failed
  return false;
};

/**
 * Compares two arrays of Zone Apexes for reliability validation using
 * Jaccard set similarity. The threshold auto-scales based on network size:
 *   - <= 5 nodes:  30% (small networks naturally diverge more)
 *   - <= 20 nodes: 45% (medium networks)
 *   - > 20 nodes:  60% (large networks, full spec compliance)
 *
 * @param {string[]} baselineArray - The expected (local) ranking.
 * @param {string[]} targetArray - The received (remote) ranking.
 * @param {import('./config.js').CiprNodeConfig} [config] - Optional config for network size.
 * @returns {boolean} True if the sets overlap sufficiently.
 */
export const compareSearchResults = (baselineArray, targetArray, config = {}) => {
  // Both empty: trivially consistent.
  if (baselineArray.length === 0 && targetArray.length === 0) return true;

  // One is empty and the other is not: severe mismatch.
  if (baselineArray.length === 0 || targetArray.length === 0) return false;

  const setB = new Set(baselineArray);
  const setT = new Set(targetArray);

  let intersectionCount = 0;
  for (const item of setB) {
    if (setT.has(item)) intersectionCount++;
  }

  const unionCount = new Set([...setB, ...setT]).size;
  if (unionCount === 0) return true;

  const similarity = intersectionCount / unionCount;

  // Auto-scale threshold based on result set size (proxy for network size).
  // Small networks naturally diverge more due to propagation delays.
  const networkSize = Math.max(baselineArray.length, targetArray.length);
  let threshold = 0.6;
  if (networkSize <= 5) threshold = 0.3;
  else if (networkSize <= 20) threshold = 0.45;

  return similarity >= threshold;
};

/**
 * Validates the ranking reliability of a remote node.
 * @param {string} targetZa - Remote node zone apex.
 * @param {string} ftsExpression - Random FTS query.
 * @param {Object} paginationParams - { num, size }
 * @param {string[]} localBaselineRank - Array of ZAs from local DB query.
 * @param {import('./config.js').CiprNodeConfig} config
 * @returns {Promise<{reliable: boolean, networkError: boolean}>} Result indicating reliability and whether a network error occurred.
 */
export const verifyReliability = async (
  targetZa,
  ftsExpression,
  paginationParams,
  localBaselineRank,
  config,
) => {
  if (Deno.env.get('TEST_MOCK_VERIFY_RELIABILITY') === 'true') {
    return { reliable: true, networkError: false };
  }

  const url = new URL(`https://ciprnode.${targetZa}/`);
  url.searchParams.set('q', ftsExpression);
  url.searchParams.set('pages[num]', paginationParams.num);
  url.searchParams.set('pages[size]', paginationParams.size);

  try {

    const response = await safeFetch(url.toString(), {
      method: 'QUERY',
      headers: {
        'Accept': 'application/hal+json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (config.log_level >= 2) {
      msg(`Outgoing request:\n  Method: QUERY\n  Path: ${url.pathname}${url.search}\n  To: ${url.hostname}`, 'REQ');
      msg(`  Incoming Response: ${response.status}`, 'RES');
    }

    if (!response.ok) {
      if (config.debug) {
        msg(
          `[DBG] Reliability check failed: ${targetZa} returned status ${response.status}`,
        );
      }
      // Non-200 response - treat as network error (node may be degraded but not dishonest)
      return { reliable: false, networkError: true };
    }

    const json = await response.json();
    const results = json._embedded?.results || [];
    const targetRank = results.map((r) => r.za);

    const isReliable = compareSearchResults(localBaselineRank, targetRank, config);

    if (config.debug) {
      msg(
        `[DBG] Reliability for ${targetZa}: ${
          isReliable ? 'PASS' : 'FAIL'
        } (Baseline: ${localBaselineRank.length}, Target: ${targetRank.length})`,
      );
    }

    return { reliable: isReliable, networkError: false };
  } catch (error) {
    if (config.debug) {
      msg(`[DBG] Reliability error for ${targetZa}: ${error.message}`);
    }
    return { reliable: false, networkError: true };
  }
};
