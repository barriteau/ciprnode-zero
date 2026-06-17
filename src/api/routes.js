/**
 * @file src/api/routes.js
 * @description Functional router for API requests.
 */

import * as RootController from './controllers/root.js';
import * as EntryController from './controllers/entry.js';
import * as SearchController from './controllers/search.js';

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
  const method = request.method;

  const parts = path.split('/').filter((p) => p.length > 0);

  if (path === '/') {
    if (method === 'GET') {
      return SearchController.list(request, db, config);
    }
    if (method === 'QUERY') {
      return SearchController.query(request, db, config, null);
    }
    if (method === 'HEAD') {
      return RootController.head(request, db, config);
    }
  }

  if (path === '/languages' || path === '/languages/') {
    if (method === 'GET') {
      return SearchController.getLanguages(request, db, config);
    }
  }

  if (path === '/ri' || path === '/ri/') {
    if (method === 'OPTIONS') {
      return SearchController.optionsRi(request, db, config);
    }
    if (method === 'HEAD') {
      return SearchController.headRi(request, db, config);
    }
    if (method === 'QUERY') {
      return SearchController.query(request, db, config, true);
    }
  }

  if (parts.length >= 1) {
    const za = parts[0];

    if (za.includes('.') && !za.startsWith('css') && !za.startsWith('js')) {
      if (parts.length === 1) {
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

      if (parts.length === 2 && method === 'GET') {
        const field = parts[1];
        const allowedFields = [
          'title',
          'description',
          'keywords',
          'offering',
          'seeking',
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
