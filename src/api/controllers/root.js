/**
 * @file src/api/controllers/root.js
 * @description Controller for the Root Resource (Home/Index).
 */

import { countEntries } from '../../db/repo.js';

/**
 * Handles HEAD / requests.
 * @param {Request} _req
 * @param {import('@db/sqlite').Database} db
 * @param {import('../../core/config.js').CiprNodeConfig} _config
 */
export const head = (_req, db, _config) => {
  // Just verify presence. 200 OK if we are here.
  // Could check DB health?
  const total = countEntries(db); // Cheap check that DB works
  return new Response(null, {
    status: 200,
    headers: {
      'X-Cipr-Count': String(total),
    },
  });
};
