import { msg } from '../../core/utils.js';
/**
 * @file src/api/handlers/resource.js
 * @description Handlers for /za/ endpoints (GET, PUT, DELETE).
 */

import { deleteEntry, getEntry, insertEntry } from '../../db/repo.js';

/**
 * Handles operations on a specific Zone Apex resource.
 * @param {Request} request
 * @param {import('@db/sqlite').Database} db
 * @param {string} za - The Zone Apex from the URL.
 * @returns {Promise<Response>}
 */
export const handleResource = (request, db, za) => {
  if (request.method === 'GET') {
    return handleGetResource(db, za);
  } else if (request.method === 'PUT') {
    return handlePutResource(request, db, za);
  } else if (request.method === 'DELETE') {
    return handleDeleteResource(db, za);
  } else {
    return new Response('Method Not Allowed', { status: 405 });
  }
};

/**
 * GET /za/
 */
const handleGetResource = (db, za) => {
  const entry = getEntry(db, za);

  if (!entry) {
    return new Response('Not Found', { status: 404 });
  }

  return new Response(JSON.stringify(entry), {
    headers: { 'Content-Type': 'application/hal+json; charset=utf-8' },
  });
};

/**
 * PUT /za/
 */
const handlePutResource = async (request, db, za) => {
  try {
    const bodyText = await request.text();
    let data;

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      data = JSON.parse(bodyText);
    } else {
      const lines = bodyText.split('\n');
      data = {};
      for (const line of lines) {
        const [key, ...rest] = line.split('=');
        if (key && rest) {
          data[key.trim()] = rest.join('=').trim();
        }
      }
    }

    // Basic Validation
    if (!data.za || data.za !== za) {
      return new Response('Bad Request: za mismatch or missing', { status: 400 });
    }

    const entry = {
      za: data.za,
      title: data.title || '',
      description: data.description || '',
      keywords: data.keywords || [],
      ol: Number(data.ol) || 0,
      latitude: data.latitude ? Number(data.latitude) : null,
      longitude: data.longitude ? Number(data.longitude) : null,
      timestamp: Number(data.timestamp) || Date.now() / 1000,
    };

    insertEntry(db, entry);

    return new Response(null, { status: 204 }); // 204 No Content for successful PUT (or 201 Created)
  } catch (error) {
    msg('PUT Error: ' + error, 'KO');
    return new Response('Internal Server Error', { status: 500 });
  }
};

/**
 * DELETE /za/
 */
const handleDeleteResource = (db, za) => {
  deleteEntry(db, za);
  return new Response(null, { status: 204 });
};
