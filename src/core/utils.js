/**
 * @file src/core/utils.js
 * @description Shared utility functions.
 */

import { createSha256Hash } from './crypto.js';

/**
 * Calculates the number of nodes to propagate to per pulse to infect the network.
 * @param {number} totalNodes - Total numbers of ciprnodes in the ciprdup. (Required)
 * @param {number} propagationTime - Expected propagation time in milliseconds. (Required)
 * @returns {number} Number of ciprnodes per pulse (integer >= 1).
 */
export const calculateNodesPerPulse = (totalNodes, propagationTime) => {
  if (totalNodes === undefined || totalNodes === null) {
    throw new Error('Total numbers of ciprnodes in the ciprdup is required');
  }
  if (!propagationTime) {
    throw new Error('propagationTime is required');
  }

  // Ensure integers
  const N = Math.max(1, Math.floor(totalNodes));
  const T_ms = Math.max(1, Math.floor(propagationTime));

  // Convert Time to "steps" (assuming 1s per step/hop latency)
  // Logic: N^(1/steps)
  const steps = Math.max(1, T_ms / 1000);

  const nodesPerPulse = Math.ceil(Math.pow(N, 1 / steps));

  // Can't be less than 1
  return Math.max(1, nodesPerPulse);
};

/**
 * Generates the standardized CIPR hash for an entry.
 * Standardizes fallback values (e.g. lat/long 0 vs '') to ensure consistency.
 *
 * @param {string} za
 * @param {string} title
 * @param {string} description
 * @param {string|string[]} keywords
 * @param {number|string} ol
 * @param {number|string} latitude
 * @param {number|string} longitude
 * @param {string} [primary_lang]
 * @returns {Promise<string>} The SHA256 hash.
 */
export const generateCiprHash = async (
  za,
  title,
  description,
  keywords,
  ol,
  latitude,
  longitude,
  primary_lang,
) => {
  const keywordsStr = Array.isArray(keywords) ? keywords.join(' ') : (keywords || '');

  // Standardize '0' for falsy/empty numeric fields according to "0 to skip" spec logic.
  // This ensures that 0, null, undefined, and "" all map to "0" for the hash.
  const olStr = String(ol || 0);
  const latStr = String(latitude || 0);
  const lonStr = String(longitude || 0);

  // Construct the pipe-separated string
  const input = [
    za,
    title,
    description,
    keywordsStr,
    primary_lang || '',
    olStr,
    latStr,
    lonStr,
  ].join('¦');

  console.log(`String to hash: ${input}`);

  return await createSha256Hash(input);
};
