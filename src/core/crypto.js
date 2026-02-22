/**
 * @file src/core/crypto.js
 * @description Hashing and cryptographic helpers.
 */

import { crypto } from '@std/crypto';

/**
 * Generates SHA-256 hash for a resource entry.
 * @param {string} input - The string to hash.
 * @returns {Promise<string>} Hex representation of the hash.
 */
export async function createSha256Hash(input) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
