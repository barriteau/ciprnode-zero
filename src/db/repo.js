/**
 * @file src/db/repo.js
 * @description Data access layer for Ciprdup operations.
 */

/**
 * @typedef {Object} CiprEntry
 * @property {string} za
 * @property {string} title
 * @property {string} description
 * @property {string[]|string} keywords
 * @property {number} ol
 * @property {number|null} latitude
 * @property {number|null} longitude
 * @property {number} timestamp
 * @property {string} [primary_lang]
 */

/**
 * Inserts or updates an entry in the Ciprdup index.
 * @param {import('@db/sqlite').Database} db
 * @param {CiprEntry} entry
 */
export const insertEntry = (db, entry) => {
  const keywords = Array.isArray(entry.keywords) ? entry.keywords.join(' ') : entry.keywords;

  const stmt = db.prepare(`
    INSERT INTO ciprdup (za, title, description, keywords, ol, latitude, longitude, timestamp, primary_lang)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(za) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      keywords = excluded.keywords,
      ol = excluded.ol,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      timestamp = excluded.timestamp,
      primary_lang = excluded.primary_lang;
  `);

  const result = stmt.run(
    entry.za,
    entry.title,
    entry.description,
    keywords,
    entry.ol,
    entry.latitude || null,
    entry.longitude || null,
    entry.timestamp,
    entry.primary_lang || null,
  );

  return result.changes > 0;
};

/**
 * Retrieves a single entry by its Zone Apex (ZA).
 * @param {import('@db/sqlite').Database} db
 * @param {string} za
 * @returns {CiprEntry|undefined}
 */
export const getEntry = (db, za) => {
  const stmt = db.prepare(`SELECT * FROM ciprdup WHERE za = ?`);
  const row = stmt.get(za);
  if (row) {
    // Normalize keywords back to array if needed suitable for API response?
    // Usually DB stores string, API expects string or array?
    // Spec says keywords is a string in table, but maybe array in JSON.
    // Let's keep it consistent with storage for now, let handler transform.
    return row;
  }
  return undefined;
};

/**
 * Deletes an entry by its Zone Apex (ZA).
 * @param {import('@db/sqlite').Database} db
 * @param {string} za
 */
export const deleteEntry = (db, za) => {
  const stmt = db.prepare(`DELETE FROM ciprdup WHERE za = ?`);
  stmt.run(za);
};

/**
 * Searches entries using FTS5 virtual table with complex filtering and pagination.
 * @param {import('@db/sqlite').Database} db
 * @param {Object} options
 * @param {string} [options.query] - The FTS query string.
 * @param {number[]} [options.ol] - Allowed offensiveness levels.
 * @param {Object} [options.geo] - Geolocation filters.
 * @param {number} [options.geo.latitude]
 * @param {number} [options.geo.longitude]
 * @param {number|string} [options.geo.min] - Min radius in km.
 * @param {number|string} [options.geo.max] - Max radius in km.
 * @param {Object} [options.timestamp] - Timestamp filters.
 * @param {number|string} [options.timestamp.before]
 * @param {number|string} [options.timestamp.after]
 * @param {Array<{offset: number, limit: number}>} [options.pages] - Pagination ranges.
 * @param {string[]} [options.primary_lang] - Array of language codes.
 * @returns {CiprEntry[]}
 */
export const searchEntries = (db, options = {}) => {
  const { query, ol, geo, timestamp, pages, primary_lang } = options;
  // Construct Base SQL

  const baseSql = `SELECT ciprdup.*, ciprdup.timestamp FROM ciprdup`;
  let ftsJoin = '';
  let orderBy = 'ORDER BY ciprdup.timestamp ASC'; // Default for no query

  if (query && query.trim() !== '') {
    ftsJoin = `JOIN ciprdup_fts ON ciprdup.rowid = ciprdup_fts.rowid`;
    // We need to inject the MATCH condition into WHERE, and update ORDER BY
    // Spec: "Tie-breaking: ... older entries (earlier timestamps) must be ranked higher."
    orderBy = `ORDER BY bm25(ciprdup_fts, 32.0, 16.0, 8.0, 1.0) ASC, ciprdup.timestamp ASC`;
  }

  // Re-build params for the exact order: FTS match param first?
  // JOIN condition doesn't take params. MATCH takes param in WHERE.

  const finalParams = [];
  const finalWhere = [];

  if (query && query.trim() !== '') {
    finalWhere.push(`ciprdup_fts MATCH ?`);
    finalParams.push(query);
  }

  // Add other filters (OL, Geo, Timestamp)
  // Copy logic from above but push to finalWhere/finalParams
  if (Array.isArray(ol) && ol.length > 0) {
    const hasZero = ol.includes(0);
    const dbValues = ol.filter((v) => v >= 1 && v <= 3);
    const olConditions = [];
    if (dbValues.length > 0) {
      const placeholders = dbValues.map(() => '?').join(',');
      olConditions.push(`ciprdup.ol IN (${placeholders})`);
      dbValues.forEach((v) => finalParams.push(v));
    }
    if (hasZero) {
      olConditions.push(`ciprdup.ol IS NULL`);
    }
    if (olConditions.length > 0) {
      finalWhere.push(`(${olConditions.join(' OR ')})`);
    }
  }

  // Primary Language Filter
  if (Array.isArray(primary_lang) && primary_lang.length > 0) {
    const placeholders = primary_lang.map(() => '?').join(',');
    finalWhere.push(`ciprdup.primary_lang IN (${placeholders})`);
    primary_lang.forEach((l) => finalParams.push(l));
  }

  if (geo && geo.latitude != null && geo.longitude != null) {
    const lat = parseFloat(geo.latitude);
    const lon = parseFloat(geo.longitude);
    const min = parseFloat(geo.min || -1); // -1 if not provided or valid
    const max = parseFloat(geo.max || -1);
    finalWhere.push(`is_within_radius(ciprdup.latitude, ciprdup.longitude, ?, ?, ?, ?) = 1`);
    finalParams.push(lat, lon, min, max);
  }

  if (timestamp) {
    if (timestamp.after) {
      finalWhere.push(`ciprdup.timestamp >= ?`);
      finalParams.push(parseInt(timestamp.after, 10));
    }
    if (timestamp.before) {
      finalWhere.push(`ciprdup.timestamp <= ?`);
      finalParams.push(parseInt(timestamp.before, 10));
    }
  }

  const whereStr = finalWhere.length > 0 ? `WHERE ${finalWhere.join(' AND ')}` : '';

  // Construct Final SQL with Unions for Pagination
  const queries = [];
  const allParams = [];

  const ranges = (pages && pages.length > 0) ? pages : [{ offset: 0, limit: 50 }];

  ranges.forEach((range) => {
    // SQL: SELECT ... LIMIT ? OFFSET ?
    // We need to duplicate parameters for each UNION part if we use UNION.
    // OR we can fetch a larger range if contiguous?
    // Spec allows [2, 6, 10]. Discontiguous.
    // UNION ALL is safest.

    // SQLite requires subquery wrapper for ORDER BY + LIMIT inside UNION terms
    queries.push(`SELECT * FROM (${baseSql} ${ftsJoin} ${whereStr} ${orderBy} LIMIT ? OFFSET ?)`);
    allParams.push(...finalParams, range.limit, range.offset);
  });

  const finalSql = queries.join(' UNION ALL ');

  const stmt = db.prepare(finalSql);
  return stmt.all(...allParams);
};

/**
 * Counts total entries.
 * @param {import('@db/sqlite').Database} db
 * @returns {number}
 */
export const countEntries = (db) => {
  const row = db.prepare(`SELECT COUNT(*) as count FROM ciprdup`).get();
  return row.count;
};

/**
 * Retrieves the timestamp of the most recently inserted or updated entry.
 * @param {import('@db/sqlite').Database} db
 * @returns {number|null} The latest timestamp in milliseconds, or null if empty.
 */
export const getLatestTimestamp = (db) => {
  const row = db.prepare(`SELECT MAX(timestamp) as latest FROM ciprdup`).get();
  return row.latest || null;
};

let languageMapCache = null;

/**
 * Returns a complete map of ISO language codes to their localized names.
 * Cached in memory after the first call.
 * @param {import('@db/sqlite').Database} db
 * @returns {Map<string, {lang_name: string, lang_name_en: string}>}
 */
export const getLanguageMap = (db) => {
  if (languageMapCache) return languageMapCache;
  const map = new Map();
  try {
    const rows = db.prepare('SELECT lang_code, lang_name, lang_name_en FROM languages').all();
    rows.forEach((r) => {
      map.set(r.lang_code, { lang_name: r.lang_name, lang_name_en: r.lang_name_en });
    });
    languageMapCache = map;
  } catch (_e) {
    // If table doesn't exist during some early tests, ignore
  }
  return languageMapCache || map;
};
