/**
 * @file src/api/controllers/root.js
 * @description Controller for the Root Resource (Home/Index).
 */

import { countEntries, searchEntries } from '../../db/repo.js';
import { halCollectionResponse } from '../views/hal.js';
import { htmlResponse } from '../views/html.js';

/**
 * Handles GET / requests.
 * @param {Request} req
 * @param {import('@db/sqlite').Database} db
 * @param {import('../../core/config.js').CiprNodeConfig} config
 */
export function get(req, db, _config) {
  const url = new URL(req.url);
  const accept = req.headers.get('accept') || '';
  const isFragment = req.headers.get('HX-Request') === 'true';

  // 1. Fetch Data (e.g., Random or Latest entries for Home)
  // For API, might support pagination. For HTML, simple random list.
  const limit = parseInt(url.searchParams.get('limit') || '10');

  // We can use searchEntries with empty query for listing
  const items = searchEntries(db, '', limit);
  const total = countEntries(db);

  // 2. Content Negotiation

  // Case A: HAL/JSON
  if (accept.includes('application/hal+json') || accept.includes('application/json')) {
    const enrichedItems = items.map((item) => ({
      ...item,
      _links: {
        self: { href: `/${item.za}/` },
      },
    }));

    return halCollectionResponse(enrichedItems, '/', {
      search: { href: '/{?query,ol,geo}', templated: true },
    }, total);
  }

  // Case B: HTML (Fragment or Full)
  if (accept.includes('text/html') || accept.includes('*/*')) {
    const listHtml = items.map((item) => `
            <article class="cipr-entry">
                <h3><a href="/${item.za}/">${item.title}</a> <span class="badge ol-${
      item.ol || 0
    }">${item.ol || 0}</span></h3>
                <p>${item.description}</p>
                <small>${item.za}</small>
            </article>
        `).join('');

    const body = `
            <section class="hero">
                <h1>Cosmic Index of Public Resources</h1>
                <p>Decentralized, Uncensored, Universal.</p>

                <form action="/" method="GET" class="search-form">
                    <!-- Note: Spec says QUERY method, but browsers verify GET form first usually.
                         We'll implement a JS handler or special route for Browser Search. -->
                    <input type="text" name="q" placeholder="Search..." required>
                    <button type="submit">Search</button>
                </form>
            </section>

            <section class="entries-list">
                <h2>Recent Entries (${total} total)</h2>
                ${listHtml}
            </section>
        `;

    return htmlResponse('Home', body, isFragment);
  }

  // Default: Plain Text?
  return new Response(
    `Ciprnode Root. ${total} Entries. Use Accept: application/hal+json for API.`,
    {
      headers: { 'Content-Type': 'text/plain' },
    },
  );
}
/**
 * Handles HEAD / requests.
 * @param {Request} _req
 * @param {import('@db/sqlite').Database} db
 * @param {import('../../core/config.js').CiprNodeConfig} _config
 */
export function head(_req, db, _config) {
  // Just verify presence. 200 OK if we are here.
  // Could check DB health?
  const total = countEntries(db); // Cheap check that DB works
  return new Response(null, {
    status: 200,
    headers: {
      'X-Cipr-Count': String(total),
    },
  });
}
