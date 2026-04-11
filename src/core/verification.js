/**
 * @file src/core/verification.js
 * @description Centralized node verification logic (TXT + HTTP HEAD).
 */

import { verifyCiprHash } from './dns.js';
import { msg, safeFetch } from './utils.js';

/**
 * Verifies if a ciprnode is valid by checking both DNS TXT record and HTTP reachability.
 * @param {import('./config.js').CiprNodeConfig} config
 * @param {string} za - The Zone Apex (domain) of the ciprnode.
 * @param {string} expectedHash - The expected SHA256 hash for the TXT record.
 * @returns {Promise<boolean>} True if both checks pass.
 */
export const verifyNode = async (config, za, expectedHash) => {
  if (Deno.env.get('TEST_MOCK_VERIFY_NODE') === 'true') {
    return true;
  }
  
  // 1. Triple DNS TXT Validation
  const isTxtValid = await verifyCiprHash(config, za, expectedHash);
  if (!isTxtValid) {
    if (config.debug) {
      msg(`[DBG] Verification failed: TXT record mismatch or missing for ${za}`);
    }
    return false;
  }

  // 2. HTTP HEAD Validation
  const isHttpValid = await verifyNodeHttp(za, config);
  if (!isHttpValid) {
    if (config.debug) msg(`[DBG] Verification failed: HTTP HEAD check failed for ${za}`);
    return false;
  }

  return true;
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
  const retryDelay = 2000; // 2 seconds

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
        return true; // Success
      } else {
        // If status is 4xx/5xx, it's technically "reachable" but maybe not "healthy" or "valid" per app logic?
        // Usually reachability just means we got a response.
        // But invalid status might mean "not a ciprnode".
        // Let's count non-200 as failure for "Validation".
        throw new Error(`Status ${response.status}`);
      }
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
 * Jaccard set similarity. A threshold of 60% overlap is required to pass.
 *
 * The previous strict positional top-8 match was removed because BM25
 * floating-point scores are non-deterministic across SQLite versions and
 * hardware, causing legitimate nodes to fail audits due to tie-breaking
 * differences rather than actual data divergence.
 *
 * @param {string[]} baselineArray - The expected (local) ranking.
 * @param {string[]} targetArray - The received (remote) ranking.
 * @returns {boolean} True if the sets overlap sufficiently.
 */
export const compareSearchResults = (baselineArray, targetArray) => {
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

  // Require at least 60% Jaccard similarity.
  return similarity >= 0.6;
};

/**
 * Validates the ranking reliability of a remote node.
 * @param {string} targetZa - Remote node zone apex.
 * @param {string} ftsExpression - Random FTS query.
 * @param {Object} paginationParams - { num, size }
 * @param {string[]} localBaselineRank - Array of ZAs from local DB query.
 * @param {import('./config.js').CiprNodeConfig} config
 * @returns {Promise<boolean>}
 */
export const verifyReliability = async (
  targetZa,
  ftsExpression,
  paginationParams,
  localBaselineRank,
  config,
) => {
  if (Deno.env.get('TEST_MOCK_VERIFY_RELIABILITY') === 'true') {
    return true;
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
      return false; // Could be offline or rejecting QUERY
    }

    const json = await response.json();
    const results = json._embedded?.results || [];
    const targetRank = results.map((r) => r.za);

    const isReliable = compareSearchResults(localBaselineRank, targetRank);

    if (config.debug) {
      msg(
        `[DBG] Reliability for ${targetZa}: ${
          isReliable ? 'PASS' : 'FAIL'
        } (Baseline: ${localBaselineRank.length}, Target: ${targetRank.length})`,
      );
    }

    return isReliable;
  } catch (error) {
    if (config.debug) {
      msg(`[DBG] Reliability error for ${targetZa}: ${error.message}`);
    }
    return false;
  }
};
