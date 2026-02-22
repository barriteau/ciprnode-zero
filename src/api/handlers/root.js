/**
 * @file src/api/handlers/root.js
 * @description Handler for GET /
 */

/**
 * Handles GET / request.
 * Retrieves contents of the ciprdup (paginated).
 * @param {Request} request
 * @param {import('@db/sqlite').Database} db
 * @param {import('../../core/config.js').CiprNodeConfig} config
 * @returns {Promise<Response>}
 */
export const handleGetRoot = (request, db, config) => {
  // Parsing Pagination (simple implementation for now)
  // Spec: pages[size] query parameter.
  const url = new URL(request.url);
  const defaultSize = config.page_size || 50;
  const sizeParam = url.searchParams.get('pages[size]');
  const size = sizeParam ? parseInt(sizeParam) : defaultSize;

  // Fetch from DB
  const stmt = db.prepare(`SELECT * FROM ciprdup ORDER BY timestamp DESC LIMIT ?`);
  const rows = stmt.all(size);

  // Content Negotiation handled by Server or here?
  // API returns JSON/HAL by default for now.
  const responseBody = {
    _links: {
      self: { href: '/' },
      search: { href: '/{?query}', templated: true },
    },
    count: rows.length,
    _embedded: {
      items: rows,
    },
  };

  return new Response(JSON.stringify(responseBody), {
    headers: { 'Content-Type': 'application/hal+json; charset=utf-8' },
  });
};
