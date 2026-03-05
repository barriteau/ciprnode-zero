/**
 * @file src/core/verification.js
 * @description Centralized node verification logic (TXT + HTTP HEAD).
 */

import { verifyCiprHash } from './dns.js';

/**
 * Verifies if a ciprnode is valid by checking both DNS TXT record and HTTP reachability.
 * @param {import('./config.js').CiprNodeConfig} config
 * @param {string} za - The Zone Apex (domain) of the ciprnode.
 * @param {string} expectedHash - The expected SHA256 hash for the TXT record.
 * @returns {Promise<boolean>} True if both checks pass.
 */
export const verifyNode = async (config, za, expectedHash) => {
  // 1. Triple DNS TXT Validation
  const isTxtValid = await verifyCiprHash(config, za, expectedHash);
  if (!isTxtValid) {
    if (config.debug) {
      console.log(`[DBG] Verification failed: TXT record mismatch or missing for ${za}`);
    }
    return false;
  }

  // 2. HTTP HEAD Validation
  const isHttpValid = await verifyNodeHttp(za, config);
  if (!isHttpValid) {
    if (config.debug) console.log(`[DBG] Verification failed: HTTP HEAD check failed for ${za}`);
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
        console.log(`[DBG] Verifying HTTP HEAD (Attempt ${attempt}/${maxRetries}): ${url}`);
      }

      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(10000),
      });

      if (config.debug) console.log(`[DBG] HTTP HEAD ${url} returned ${response.status}`);

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
        console.log(`[DBG] HTTP HEAD failed for ${url} (Attempt ${attempt}): ${error.message}`);
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
 * Compares two arrays of Zone Apexes for reliability validation.
 * @param {string[]} baselineArray - The expected (local) ranking.
 * @param {string[]} targetArray - The received (remote) ranking.
 * @returns {boolean} True if they match within acceptable tolerances.
 */
export const compareSearchResults = (baselineArray, targetArray) => {
  // 1. Strict Top 8 Match
  const top8Baseline = baselineArray.slice(0, 8);
  const top8Target = targetArray.slice(0, 8);

  if (top8Baseline.length !== top8Target.length) return false;

  for (let i = 0; i < top8Baseline.length; i++) {
    if (top8Baseline[i] !== top8Target[i]) return false;
  }

  // 2. Tolerance for the Remaining Results (Fuzzy Match / Jaccard > 70%)
  const remainingBaseline = baselineArray.slice(8);
  const remainingTarget = targetArray.slice(8);

  if (remainingBaseline.length === 0 && remainingTarget.length === 0) return true;
  if (remainingBaseline.length === 0 || remainingTarget.length === 0) {
    // One node has tail results, the other has 0. This is a severe mismatch if we expect many.
    return false;
  }

  const setB = new Set(remainingBaseline);
  const setT = new Set(remainingTarget);

  let intersectionCount = 0;
  for (const item of setB) {
    if (setT.has(item)) intersectionCount++;
  }

  const unionCount = new Set([...setB, ...setT]).size;
  if (unionCount === 0) return true;

  const similarity = intersectionCount / unionCount;
  return similarity >= 0.7;
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
  const url = new URL(`https://ciprnode.${targetZa}/`);
  url.searchParams.set('q', ftsExpression);
  url.searchParams.set('pages[num]', paginationParams.num);
  url.searchParams.set('pages[size]', paginationParams.size);

  try {
    if (config.debug) {
      console.log(`[DBG] Verifying Reliability: QUERY ${url.toString()}`);
    }

    const response = await fetch(url.toString(), {
      method: 'QUERY',
      headers: {
        'Accept': 'application/hal+json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      if (config.debug) {
        console.log(
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
      console.log(
        `[DBG] Reliability for ${targetZa}: ${
          isReliable ? 'PASS' : 'FAIL'
        } (Baseline: ${localBaselineRank.length}, Target: ${targetRank.length})`,
      );
    }

    return isReliable;
  } catch (error) {
    if (config.debug) {
      console.log(`[DBG] Reliability error for ${targetZa}: ${error.message}`);
    }
    return false;
  }
};
