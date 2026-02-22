/**
 * @file src/api/controllers/entry.js
 * @description Controller for individual Cipr Entries (/ZA/).
 */

import { deleteEntry, getEntry, insertEntry } from '../../db/repo.js';
import { halResponse } from '../views/hal.js';
import { htmlResponse, renderError } from '../views/html.js';
// import { verifyCiprHash } from '../../core/dns.js'; // Replaced by verifyNode
// import { createSha256Hash } from '../../core/crypto.js'; // Replaced by generateCiprHash

/**
 * Handles GET /ZA/ requests.
 */
export const get = (req, db, _config, za) => {
  const entry = getEntry(db, za);
  const accept = req.headers.get('accept') || '';
  const isFragment = req.headers.get('HX-Request') === 'true';

  if (!entry) {
    if (accept.includes('text/html')) {
      return renderError('Not Found', `Entry ${za} not found in this node.`, isFragment);
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
    const body = `
            <article class="entry-detail">
                <header>
                    <h1>${entry.title}</h1>
                    <code class="za">${entry.za}</code>
                </header>
                <div class="meta">
                    <span class="badge">OL: ${entry.ol || 0}</span>
                    <span class="timestamp">Updated: ${
      new Date(entry.timestamp * 1000).toLocaleString()
    }</span>
                </div>
                <p class="description">${entry.description}</p>
                <div class="keywords">Tags: ${entry.keywords}</div>

                <div class="actions">
                    <a href="/" class="btn">Back</a>
                </div>
            </article>
        `;
    return htmlResponse(entry.title, body, isFragment);
  }

  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
};

import { verifyNode } from '../../core/verification.js';
import { generateCiprHash } from '../../core/utils.js';

/**
 * Handles PUT /ZA/ requests (Upsert).
 */
export const put = async (req, db, config, za) => {
  // 1. Parse Body
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // 2. Validate Consistency (ZA in URL matches Body)
  if (body.za !== za) {
    return new Response('ZA Mismatch', { status: 400 });
  }

  // 2.5 Ignore Self-Update (Per Spec)
  if (za === config.za) {
    if (config.debug) console.log(`[DBG] PUT ${za}: Self-update ignored (Protected).`);
    // Return 200 OK as if successful, but do nothing.
    return new Response(null, { status: 200, headers: { Location: `/${za}/` } });
  }

  // 3. Verify Sender (Critical Step per Spec)
  if (config.debug) console.log(`[DBG] PUT ${za}: Verifying Sender...`);
  const calculatedHash = await generateCiprHash(
    body.za,
    body.title,
    body.description,
    body.keywords,
    body.ol,
    body.latitude,
    body.longitude,
  );
  if (config.debug) console.log(`[DBG] PUT ${za}: Hash calculated: ${calculatedHash}`);

  // Use verifyNode to check both DNS TXT and HTTP HEAD (Reachability)
  // This ensures we only accept updates from reachable nodes.
  const isValid = await verifyNode(config, za, calculatedHash);
  if (config.debug) console.log(`[DBG] PUT ${za}: Node Verification Result: ${isValid}`);

  if (!isValid) {
    return new Response(
      'Verification Failed. Sender reachable and TXT record must match data hash.',
      {
        status: 403,
      },
    );
  }

  // 4. Insert/Update
  const keywordsStr = Array.isArray(body.keywords) ? body.keywords.join(' ') : body.keywords;

  const inserted = insertEntry(db, {
    ...body,
    keywords: keywordsStr,
    timestamp: body.timestamp || Math.floor(Date.now() / 1000),
  });

  if (inserted) {
    return new Response(null, { status: 201, headers: { Location: `/${za}/` } });
  } else {
    // If inserted is false, it means the entry existed and was identical (no changes made).
    // This is an idempotent success.
    return new Response(null, { status: 200, headers: { Location: `/${za}/` } });
  }
};

/**
 * Handles DELETE /ZA/ requests.
 */
export const del = async (_req, db, config, za) => {
  // 1. Check if resource exists locally
  const entry = getEntry(db, za);
  if (!entry) {
    if (config.debug) console.log(`[DBG] DELETE ${za}: Ignored (Not found locally).`);
    return new Response(null, { status: 200 }); // "Ignored but status 200" per spec? Or 404? Spec says "response must be status 200 anyway"
  }

  // 1.5 Ignore Self-Delete (Per Spec)
  if (za === config.za) {
    if (config.debug) console.log(`[DBG] DELETE ${za}: Self-deletion ignored (Protected).`);
    return new Response(null, { status: 200 });
  }

  // 2. Verify the resource (Viral Deletion Logic)
  // "check the za with the validator.js functions"
  // We need to verify if the node is VALID.
  // If VALID -> IGNORE DELETE (Protect the node).
  // If INVALID -> DELETE (Propagate cleanup).

  if (config.debug) console.log(`[DBG] DELETE ${za}: Verifying node validity...`);

  // We need the hash to verify. We have the entry in DB, so we can calculate it.
  const calculatedHash = await generateCiprHash(
    entry.za,
    entry.title,
    entry.description,
    entry.keywords,
    entry.ol,
    entry.latitude,
    entry.longitude,
  );

  const isValid = await verifyNode(config, za, calculatedHash);

  if (isValid) {
    // 3a. Validation Passes -> Ignore DELETE
    console.log(`[DELETE] Request for ${za} IGNORED. Node is valid.`);
    if (config.debug) {
      console.log(`[DBG] DELETE ${za}: Node verified successfully. Retaining entry.`);
    }
    return new Response(null, { status: 200 });
  } else {
    // 3b. Validation Fails -> Execute DELETE
    console.log(`[DELETE] Request for ${za} ACCEPTED. Node failed validation.`);
    if (config.debug) console.log(`[DBG] DELETE ${za}: Node verification failed. Deleting entry.`);
    deleteEntry(db, za);
    return new Response(null, { status: 200 });
  }
};

/**
 * Handles Sub-field GET /ZA/field/
 */
export const getField = (_req, db, _config, za, field) => {
  const entry = getEntry(db, za);
  if (!entry) return new Response('Not Found', { status: 404 });

  const value = entry[field];
  return new Response(JSON.stringify({ [field]: value }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
