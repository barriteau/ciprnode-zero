import { msg } from '../../core/utils.js';
/**
 * @file src/api/handlers/query.js
 * @description Handler for QUERY requests.
 */

import { searchEntries } from '../../db/repo.js';

/**
 * Handles search queries (QUERY method).
 * @param {Request} request
 * @param {import('@db/sqlite').Database} db
 * @returns {Promise<Response>}
 */
export const handleQuery = async (request, db) => {
  try {
    const bodyText = await request.text();
    let queryParams = {};

    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      queryParams = JSON.parse(bodyText);
    } else {
      // Simple plain text parsing
      const lines = bodyText.split('\n');
      for (const line of lines) {
        const [key, ...rest] = line.split('=');
        if (key && rest) {
          // handle quoted strings? simplistically:
          let val = rest.join('=').trim();
          if (val.startsWith('"') && val.endsWith('"')) {
            val = val.slice(1, -1);
          }
          queryParams[key.trim()] = val;
        }
      }
    }

    const ftsQuery = queryParams.query;
    if (!ftsQuery) {
      return new Response('Missing query parameter', { status: 400 });
    }

    // Pagination
    // Spec mentions pages[num] and pages[size] in URL query params mostly, but payload is also allowed?
    // Let's check URL params first for pagination control.
    const url = new URL(request.url);
    const size = Number(url.searchParams.get('pages[size]')) || 50;
    // const num = Number(url.searchParams.get('pages[num]')) || 1; // Not fully implementing multi-page array logic yet.

    // Simplistic Offset implementation
    // offset = (page_num - 1) * size
    const offset = 0; // Fixed to page 1 for now unless elaborate parsing.

    const results = searchEntries(db, ftsQuery, size, offset);

    const responseBody = {
      _links: {
        self: { href: request.url },
      },
      count: results.length,
      _embedded: {
        items: results,
      },
    };

    return new Response(JSON.stringify(responseBody), {
      headers: { 'Content-Type': 'application/hal+json; charset=utf-8' },
    });
  } catch (error) {
    msg('QUERY Error: ' + error, 'KO');
    return new Response('Internal Server Error', { status: 500 });
  }
};
