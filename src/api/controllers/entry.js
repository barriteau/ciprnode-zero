/**
 * @file src/api/controllers/entry.js
 * @description Controller for individual Cipr Entries (/za/).
 */

import { deleteEntry, getEntry, insertEntry } from '../../db/repo.js';
import { halResponse } from '../views/hal.js';
import { render } from '../views/renderer.js';
import { msg } from '../../core/utils.js';
// import { verifyCiprHash } from '../../core/dns.js'; // Replaced by verifyNode
// import { createSha256Hash } from '../../core/crypto.js'; // Replaced by generateCiprHash

/**
 * Handles GET /za/ requests.
 */
export const get = (req, db, _config, za) => {
  const entry = getEntry(db, za);
  const accept = req.headers.get('accept') || '';
  const isFragment = req.headers.get('HX-Request') === 'true';

  if (!entry) {
    if (accept.includes('text/html')) {
      const errorHtml = render(
        'error',
        {
          errorTitle: 'Not Found',
          errorMessage: `Entry ${za} not found in this node.`,
        },
        isFragment,
        { title: 'Not Found' },
      );
      return new Response(errorHtml, {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    return new Response('Not Found', { status: 404 });
  }

  // Format Data
  const data = { ...entry };
  delete data.rowid; // internal

  // HAL
  if (accept.includes('application/hal+json') || accept.includes('application/json')) {
    return halResponse(data, {
      self: { href: `/${za}/` },
      collection: { href: '/' },
    });
  }

  // HTML
  if (accept.includes('text/html') || accept.includes('*/*')) {
    const entryHtml = render('entry', { entry: data }, isFragment, { title: entry.title });
    return new Response(entryHtml, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
};

import { verifyNode } from '../../core/verification.js';
import { generateCiprHash, readBodyWithLimit } from '../../core/utils.js';

/**
 * Handles PUT /za/ requests (Upsert).
 */
export const put = async (req, db, config, za) => {
  // 1. Parse Body
  let body;
  try {
    const bodyText = await readBodyWithLimit(req, 8192); // 8KB Max strict limit
    body = JSON.parse(bodyText);
  } catch (err) {
    if (err.message === 'Payload Too Large') {
      return new Response('Payload Too Large', { status: 413 });
    }
    return new Response('Invalid JSON', { status: 400 });
  }

  // 2. Validate Consistency (za in URL matches Body)
  if (body.za !== za) {
    return new Response('za Mismatch', { status: 400 });
  }

  // 2.5 Ignore Self-Update (Per Spec)
  if (za === config.za) {
    if (config.debug) msg(`[DBG] PUT ${za}: Self-update ignored (Protected).`);
    // Return 202 Accepted as if successful, but do nothing.
    return new Response(null, { status: 202, headers: { Location: `/${za}/` } });
  }

  // 2.7 Field-level Request Size Limits (Defense in Depth against Hash-Complexity DoS)
  const keywordsStr = Array.isArray(body.keywords) ? body.keywords.join(' ') : body.keywords;
  if (
    (body.za && body.za.length > 255) ||
    (body.title && body.title.length > 64) ||
    (body.description && body.description.length > 256) ||
    (keywordsStr && keywordsStr.length > 512) ||
    (body.offering && body.offering.length > 128) ||
    (body.seeking && body.seeking.length > 128) ||
    (body.primary_lang && body.primary_lang.length > 2)
  ) {
    return new Response('Field exceeds maximum allowed limit', { status: 413 });
  }

  // 3. Verify Sender (Critical Step per Spec)
  if (config.debug) msg(`[DBG] PUT ${za}: Verifying Sender...`);
  const calculatedHash = await generateCiprHash(
    body.za,
    body.title,
    body.description,
    body.keywords,
    body.offering,
    body.seeking,
    body.primary_lang,
    body.ol,
    body.latitude,
    body.longitude,
  );
  if (config.debug) msg(`[DBG] PUT ${za}: Hash calculated: ${calculatedHash}`);

  // Use verifyNode to check both DNS TXT and HTTP HEAD (Reachability)
  // This ensures we only accept updates from reachable nodes.
  const isValid = await verifyNode(config, za, calculatedHash);
  if (config.debug) msg(`[DBG] PUT ${za}: Node Verification Result: ${isValid}`);

  if (!isValid) {
    return new Response(
      'Verification Failed. Sender reachable and TXT record must match data hash.',
      {
        status: 403,
      },
    );
  }

  // 4. Insert/Update

  const inserted = insertEntry(db, {
    ...body,
    keywords: keywordsStr,
    timestamp: body.timestamp || Math.floor(Date.now() / 1000),
  });

  if (inserted) {
    return new Response(null, { status: 202, headers: { Location: `/${za}/` } });
  } else {
    // If inserted is false, it means the entry existed and was identical (no changes made).
    // This is an idempotent success.
    return new Response(null, { status: 202, headers: { Location: `/${za}/` } });
  }
};

/**
 * Handles DELETE /za/ requests.
 */
export const del = async (_req, db, config, za) => {
  // 1. Check if resource exists locally
  const entry = getEntry(db, za);
  if (!entry) {
    if (config.debug) msg(`[DBG] DELETE ${za}: Ignored (Not found locally).`);
    return new Response(null, { status: 202 }); // "Ignored but status 200" per spec? Or 404? Spec says "response must be status 200 anyway"
  }

  // 1.5 Ignore Self-Delete (Per Spec)
  if (za === config.za) {
    if (config.debug) msg(`[DBG] DELETE ${za}: Self-deletion ignored (Protected).`);
    return new Response(null, { status: 202 });
  }

  // 2. Verify the resource (Viral Deletion Logic)
  // "check the za with the validator.js functions"
  // We need to verify if the node is VALID.
  // If VALID -> IGNORE DELETE (Protect the node).
  // If INVALID -> DELETE (Propagate cleanup).

  if (config.debug) msg(`[DBG] DELETE ${za}: Verifying node validity...`);

  // We need the hash to verify. We have the entry in DB, so we can calculate it.
  const calculatedHash = await generateCiprHash(
    entry.za,
    entry.title,
    entry.description,
    entry.keywords,
    entry.offering,
    entry.seeking,
    entry.primary_lang,
    entry.ol,
    entry.latitude,
    entry.longitude,
  );

  const isValid = await verifyNode(config, za, calculatedHash);

  if (isValid) {
    // 3a. Validation Passes -> Ignore DELETE
    msg(`[DELETE] Request for ${za} IGNORED. Node is valid.`);
    if (config.debug) {
      msg(`[DBG] DELETE ${za}: Node verified successfully. Retaining entry.`);
    }
    return new Response(null, { status: 202 });
  } else {
    // 3b. Validation Fails -> Execute DELETE
    msg(`[DELETE] Request for ${za} ACCEPTED. Node failed validation.`);
    if (config.debug) msg(`[DBG] DELETE ${za}: Node verification failed. Deleting entry.`);
    deleteEntry(db, za);
    return new Response(null, { status: 202 });
  }
};

/**
 * Handles Sub-field GET /za/field/
 */
export const getField = (req, db, _config, za, field) => {
  const entry = getEntry(db, za);
  if (!entry) return new Response('Not Found', { status: 404 });

  const value = entry[field];
  const accept = req.headers.get('accept') || '';

  if (accept.includes('text/plain')) {
    const textValue = (value === null || value === undefined) ? '' : String(value);
    return new Response(textValue, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const responseObj = { [field]: value };
  
  if (accept.includes('application/hal+json')) {
    const _links = {
      self: { href: `/${za}/${field}/` },
      up: { href: `/${za}/` },
    };

    const allFields = [
      'title', 'description', 'keywords', 'offering', 'seeking',
      'ol', 'primary_lang', 'latitude', 'longitude', 'timestamp'
    ];

    allFields.forEach((f) => {
      if (f !== field) {
        _links[f] = { href: `/${za}/${f}/` };
      }
    });

    responseObj._links = _links;
    return new Response(JSON.stringify(responseObj), {
      headers: { 'Content-Type': 'application/hal+json; charset=utf-8' },
    });
  }

  return new Response(JSON.stringify(responseObj), {
    headers: { 'Content-Type': 'application/json' },
  });
};
