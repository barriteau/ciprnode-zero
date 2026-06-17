/**
 * @file src/api/controllers/entry.js
 * @description Controller for individual Cipr Entries (/za/).
 */

import { deleteEntry, getEntry, insertEntry } from '../../db/repo.js';
import { halResponse } from '../views/hal.js';
import { render } from '../views/renderer.js';
import { msg } from '../../core/utils.js';
import { searchEntries } from '../../db/repo.js';

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

  const data = { ...entry };
  delete data.rowid;

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

import { verifyNode, verifyReliability } from '../../core/verification.js';
import { generateCiprHash, readBodyWithLimit } from '../../core/utils.js';
import { generateRandomFTSExpression } from '../../core/fts_generator.js';

/**
 * Handles PUT /za/ requests (Upsert).
 */
export const put = async (req, db, config, za) => {
  let body;
  try {
    const bodyText = await readBodyWithLimit(req, 8192);
    body = JSON.parse(bodyText);
  } catch (err) {
    if (err.message === 'Payload Too Large') {
      return new Response('Payload Too Large', { status: 413 });
    }
    return new Response('Invalid JSON', { status: 400 });
  }

  if (body.za !== za) {
    return new Response('za Mismatch', { status: 400 });
  }

  if (za === config.za) {
    if (config.debug) msg(`[DBG] PUT ${za}: Self-update ignored (Protected).`);
    return new Response(null, { status: 202, headers: { Location: `/${za}/` } });
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const TWENTY_FOUR_HOURS = 86400;
  const CLOCK_SKEW_TOLERANCE = 300;
  if (!body.timestamp) {
    return new Response('Missing timestamp', { status: 400 });
  }
  if (body.timestamp > nowSec + CLOCK_SKEW_TOLERANCE) {
    return new Response('Timestamp is too far in the future', { status: 400 });
  }
  if (body.timestamp < nowSec - TWENTY_FOUR_HOURS) {
    return new Response('Timestamp is older than 24 hours', { status: 400 });
  }

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

  const isValid = await verifyNode(config, za, calculatedHash);
  if (config.debug) msg(`[DBG] PUT ${za}: Node Verification Result: ${isValid}`);

  if (!isValid) {
    return new Response(
      'Verification Failed. Sender reachable and TXT record must match data hash.',
      { status: 403 },
    );
  }

  try {
    const ftsExpression = generateRandomFTSExpression(config);
    const paginationParams = { num: 1, size: 10 };
    const baselineItems = searchEntries(db, {
      query: ftsExpression,
      ol: [],
      geo: {},
      timestamp: {},
      filters: {},
      pages: [{ offset: 0, limit: 10, pageNum: 1 }],
      primary_lang: [],
    });
    const baselineRank = baselineItems.map((item) => item.za);

    const isReliable = await verifyReliability(za, ftsExpression, paginationParams, baselineRank, config);
    if (!isReliable) {
      if (config.debug) msg(`[DBG] PUT ${za}: Reliability Validation failed.`);
      return new Response(
        'Reliability Validation Failed. Search results diverge beyond acceptable threshold.',
        { status: 409 },
      );
    }
    if (config.debug) msg(`[DBG] PUT ${za}: Reliability Validation passed.`);
  } catch (e) {
    if (config.debug) msg(`[DBG] PUT ${za}: Reliability check error (non-fatal): ${e.message}`);
  }

  const inserted = insertEntry(db, {
    ...body,
    keywords: keywordsStr,
    timestamp: body.timestamp || Math.floor(Date.now() / 1000),
  });

  if (inserted) {
    return new Response(null, { status: 202, headers: { Location: `/${za}/` } });
  }
  return new Response(null, { status: 202, headers: { Location: `/${za}/` } });
};

/**
 * Handles DELETE /za/ requests.
 */
export const del = async (_req, db, config, za) => {
  const entry = getEntry(db, za);
  if (!entry) {
    if (config.debug) msg(`[DBG] DELETE ${za}: Ignored (Not found locally).`);
    return new Response(null, { status: 202 });
  }

  if (za === config.za) {
    if (config.debug) msg(`[DBG] DELETE ${za}: Self-deletion ignored (Protected).`);
    return new Response(null, { status: 202 });
  }

  if (config.debug) msg(`[DBG] DELETE ${za}: Verifying node validity...`);

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
    try {
      const ftsExpression = generateRandomFTSExpression(config);
      const paginationParams = { num: 1, size: 10 };
      const baselineItems = searchEntries(db, {
        query: ftsExpression,
        ol: [],
        geo: {},
        timestamp: {},
        filters: {},
        pages: [{ offset: 0, limit: 10, pageNum: 1 }],
        primary_lang: [],
      });
      const baselineRank = baselineItems.map((item) => item.za);

      const isReliable = await verifyReliability(za, ftsExpression, paginationParams, baselineRank, config);
      if (isReliable) {
        msg(`[DELETE] Request for ${za} IGNORED. Node passed all validation steps.`);
        if (config.debug) {
          msg(`[DBG] DELETE ${za}: Node verified successfully (DNS + HTTP + Reliability). Retaining entry.`);
        }
        return new Response(null, { status: 202 });
      }
      if (config.debug) msg(`[DBG] DELETE ${za}: Reliability Validation failed.`);
    } catch (e) {
      if (config.debug) msg(`[DBG] DELETE ${za}: Reliability check error (non-fatal): ${e.message}`);
      msg(`[DELETE] Request for ${za} IGNORED. Reliability check encountered network error.`);
      return new Response(null, { status: 202 });
    }

    msg(`[DELETE] Request for ${za} ACCEPTED. Node failed Reliability Validation.`);
    if (config.debug) msg(`[DBG] DELETE ${za}: Reliability check failed. Deleting entry.`);
    deleteEntry(db, za);
    return new Response(null, { status: 202 });
  }

  msg(`[DELETE] Request for ${za} ACCEPTED. Node failed DNS/HTTP validation.`);
  if (config.debug) msg(`[DBG] DELETE ${za}: Node verification failed. Deleting entry.`);
  deleteEntry(db, za);
  return new Response(null, { status: 202 });
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
