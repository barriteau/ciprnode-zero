/**
 * @file src/api/routes.js
 * @description Functional router for API requests.
 */

import * as RootController from './controllers/root.js';
import * as EntryController from './controllers/entry.js';
import * as SearchController from './controllers/search.js';
import * as HelpController from './controllers/help.js';
// import { logDebug } from '../core/logger.js';

/**
 * Routes the incoming request to the appropriate handler.
 * @param {Request} request
 * @param {import('@db/sqlite').Database} db
 * @param {import('../core/config.js').CiprNodeConfig} config
 * @returns {Promise<Response|null>} Response or null if no route matched
 */
export const handleRequest = (request, db, config) => {
  const url = new URL(request.url);
  const path = url.pathname;
  let method = request.method;

  // Apple WebKit Workaround: iOS Safari aggressively drops request body on custom HTTP methods like QUERY.
  // The frontend bridges this by sending a POST with X-HTTP-Method-Override = QUERY
  const overrideHdr = request.headers.get('x-http-method-override');
  if (overrideHdr && overrideHdr.toUpperCase() === 'QUERY' && method === 'POST') {
    method = 'QUERY';
  }
  const parts = path.split('/').filter((p) => p.length > 0);

  // 0. Profile (ALPS) - Served statically usually, but let's ensure it's handled if requested via API path logic?
  // Actually server.js handles static files first.

  // 1. Root /
  if (path === '/') {
    // Determine context: API or Browser?
    // SearchController handles both via Content Negotiation (HTML vs JSON)
    // and handles both Search (params) and Listing (no params).
    if (method === 'GET' || method === 'QUERY') {
      return SearchController.query(request, db, config, null);
    }
    if (method === 'HEAD') {
      return RootController.head(request, db, config);
    }
    if (method === 'HEAD') {
      return RootController.head(request, db, config);
    }
  }

  // Help Page
  if (path === '/help') {
    return HelpController.get(request, db, config);
  }

  // 1.5 Languages autocomplete endpoint
  if (path === '/languages' || path === '/languages/') {
    if (method === 'GET') {
      return SearchController.getLanguages(request, db, config);
    }
  }

  // 1.8 Resindex querying /ri/
  if (path === '/ri' || path === '/ri/') {
    if (method === 'QUERY') {
      return new Response('Not Implemented - Resindex proxying is a planned feature.', {
        status: 501,
      });
    }
  }

  // 2. Resource Operations /za/...
  if (parts.length >= 1) {
    const za = parts[0];

    // Basic Domain Validation (weak check)
    // Avoid routing static files if they slipped through server.js checking
    if (za.includes('.') && !za.startsWith('css') && !za.startsWith('js')) {
      if (parts.length === 1) { // /za/
        if (method === 'GET') {
          return EntryController.get(request, db, config, za);
        }
        if (method === 'PUT') {
          return EntryController.put(request, db, config, za);
        }
        if (method === 'DELETE') {
          return EntryController.del(request, db, config, za);
        }
      }

      // 3. Resource Field Operations /za/field/
      if (parts.length === 2 && method === 'GET') {
        const field = parts[1];
        const allowedFields = [
          'title',
          'description',
          'ol',
          'latitude',
          'longitude',
          'timestamp',
          'primary_lang',
        ];
        if (allowedFields.includes(field)) {
          return EntryController.getField(request, db, config, za, field);
        }
      }
    }
  }

  return null; // No match
};
