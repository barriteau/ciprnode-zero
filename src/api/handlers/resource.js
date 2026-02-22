/**
 * @file src/api/handlers/resource.js
 * @description Handlers for /ZA/ endpoints (GET, PUT, DELETE).
 */

import { deleteEntry, getEntry, insertEntry } from '../../db/repo.js';

/**
 * Handles operations on a specific Zone Apex resource.
 * @param {Request} request
 * @param {import('@db/sqlite').Database} db
 * @param {string} za - The Zone Apex from the URL.
 * @returns {Promise<Response>}
 */
export function handleResource(request, db, za) {
  if (request.method === 'GET') {
    return handleGetResource(db, za);
  } else if (request.method === 'PUT') {
    return handlePutResource(request, db, za);
  } else if (request.method === 'DELETE') {
    return handleDeleteResource(db, za);
  } else {
    return new Response('Method Not Allowed', { status: 405 });
  }
}

/**
 * GET /ZA/
 */
function handleGetResource(db, za) {
  const entry = getEntry(db, za);

  if (!entry) {
    return new Response('Not Found', { status: 404 });
  }

  // TODO: Handle field filtering (e.g. /ZA/title/) if needed by spec in future iteration.
  // For now return full entry.

  return new Response(JSON.stringify(entry), {
    headers: { 'Content-Type': 'application/hal+json; charset=utf-8' },
  });
}

/**
 * PUT /ZA/
 */
async function handlePutResource(request, db, za) {
  // TODO: Validation logic (DNS TXT record check, timestamp check) per spec.
  // For this iteration, we assume basic validation passes or is done by caller.

  try {
    const bodyText = await request.text();
    let data;

    // Handle JSON or Plain Text Body (Spec allows both but JSON is easier to parse here)
    // If Content-Type is application/json...
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      data = JSON.parse(bodyText);
    } else {
      // Basic fallback for key=value plain text if needed, or error.
      // Spec example:
      // za=example.com
      // title=...

      // Let's implement a simple key-value parser for text/plain
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
      return new Response('Bad Request: ZA mismatch or missing', { status: 400 });
    }

    const entry = {
      za: data.za,
      title: data.title || '',
      description: data.description || '',
      keywords: data.keywords || [],
      ol: Number(data.ol) || 0,
      latitude: data.latitude ? Number(data.latitude) : null,
      longitude: data.longitude ? Number(data.longitude) : null,
      timestamp: Number(data.timestamp) || Date.now() / 1000, // Default to now if missing? Spec says "validate timestamp > 24h"
    };

    insertEntry(db, entry);

    return new Response(null, { status: 204 }); // 204 No Content for successful PUT (or 201 Created)
  } catch (error) {
    console.error('PUT Error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

/**
 * DELETE /ZA/
 */
function handleDeleteResource(db, za) {
  // TODO: Validation logic (DNS TXT record check) per spec.

  deleteEntry(db, za);
  return new Response(null, { status: 204 });
}
