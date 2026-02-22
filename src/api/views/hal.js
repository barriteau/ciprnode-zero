/**
 * @file src/api/views/hal.js
 * @description Helper to generate HAL (Hypertext Application Language) responses.
 */

const ALPS_PROFILE = '/profiles/cipr.json';

/**
 * Generates a HAL response object.
 * @param {object} data - The resource data (properties).
 * @param {object} links - The _links object (rel -> { href }).
 * @param {object} [embedded] - The _embedded object (rel -> resource or array).
 * @returns {Response}
 */
export function halResponse(data, links = {}, embedded = {}) {
  // 1. Ensure Self Link exists
  if (!links.self) {
    throw new Error('HAL Resource must have a self link.');
  }

  // 2. Add Profile Link
  links.profile = { href: ALPS_PROFILE };

  // 3. Construct Payload
  const payload = {
    _links: links,
    ...data,
    _embedded: Object.keys(embedded).length > 0 ? embedded : undefined,
  };

  // 4. Return Response
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/hal+json; charset=utf-8',
      'Link': `<${ALPS_PROFILE}>; rel="profile"`,
    },
  });
}

/**
 * Helper to build a standard 'collection' HAL response.
 * @param {Array} items - Array of item objects.
 * @param {string} selfUrl - URL of this collection.
 * @param {object} [pagination] - Pagination links (next, prev, first, last).
 * @param {number} [total] - Total number of items in the collection (optional).
 */
export function halCollectionResponse(items, selfUrl, pagination = {}, total = null) {
  const embedded = {
    item: items, // Standard 'item' relation for collections
  };

  const links = {
    self: { href: selfUrl },
    ...pagination,
  };

  const data = { count: items.length };
  if (total !== null && total !== undefined) {
    data.total = total;
  }

  return halResponse(data, links, embedded);
}
