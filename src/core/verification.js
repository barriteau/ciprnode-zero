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
export async function verifyNode(config, za, expectedHash) {
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
}

/**
 * Verifies if a ciprnode is reachable via HTTP HEAD request to /.
 * @param {string} za - The Zone Apex (domain).
 * @param {import('./config.js').CiprNodeConfig} [config] - Optional config for debug logging.
 * @returns {Promise<boolean>} True if 200 OK.
 */
export async function verifyNodeHttp(za, config = {}) {
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
}
