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
    INSERT INTO ciprdup (za, title, description, keywords, offering, seeking, ol, latitude, longitude, timestamp, primary_lang)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(za) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      keywords = excluded.keywords,
      offering = excluded.offering,
      seeking = excluded.seeking,
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
    entry.offering || null,
    entry.seeking || null,
    entry.ol,
    entry.latitude || null,
    entry.longitude || null,
    entry.timestamp,
    entry.primary_lang || null,
  );

  return result.changes > 0;
};

/**
 * Retrieves a single entry by its Zone Apex (za).
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
 * Deletes an entry by its Zone Apex (za).
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
/**
 * Sanitizes a raw user FTS5 query string before it is passed to SQLite.
 *
 * Rules applied (in order):
 *  1. Empty / whitespace-only → return null  (skip FTS entirely)
 *  2. Balance double-quote pairs — an unterminated " is closed.
 *  3. Strip invalid '*' placements  ('*word', 'wo*rd' but keep 'word*')
 *  4. Strip invalid '^' placements  ('word^', 'wo^rd' but keep '^word')
 *  5. Remove leading/trailing binary operators (AND, OR, NOT)
 *  6. Balance parentheses — remove unmatched closing ')' and open '('
 *  7. Strip malformed NEAR() expressions (empty, unterminated, bad args)
 *  8. Strip malformed column filters (bare ':', empty '{}', missing term)
 *
 * @param {string|null|undefined} raw - The raw query string from the request.
 * @returns {string|null} A safe FTS5 expression, or null if nothing remains.
 */
const sanitizeFtsQuery = (raw) => {
  if (!raw || typeof raw !== 'string') return null;

  let q = raw.trim();
  if (!q) return null;

  // 1. Balance double quotes: count them; if odd, append a closing quote.
  const quoteCount = (q.match(/"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    q = q + '"';
  }

  // 2. Fix invalid '*' — only valid at the END of a word token (e.g. word*)
  q = q.replace(/\*(?=\S)/g, ''); // *word → word (star before non-space)
  q = q.replace(/(\w)\*(\w)/g, '$1$2'); // wo*rd → word (star mid-word)

  // 3. Fix invalid '^' — only valid at the START of a token (e.g. ^word)
  q = q.replace(/(\w)\^/g, '$1'); // word^ or wo^rd → word
  q = q.replace(/\^\s*$/g, ''); // trailing lone ^ → remove

  // 4. Remove leading binary operators.
  q = q.replace(/^\s*(AND|OR)\s+/i, '');

  // 5. Remove trailing binary operators (AND, OR, NOT).
  q = q.replace(/\s+(AND|OR|NOT)\s*$/i, '');

  // 6. Balance parentheses.
  //    Pass 1: remove unmatched ')' (depth would go negative).
  let depth = 0;
  let balanced = '';
  for (const ch of q) {
    if (ch === '(') {
      depth++;
      balanced += ch;
    } else if (ch === ')') {
      if (depth > 0) {
        depth--;
        balanced += ch;
      }
      // else: drop the unmatched ')'
    } else {
      balanced += ch;
    }
  }
  //    Pass 2: remove unmatched '(' (depth > 0 remaining).
  while (depth > 0) {
    const idx = balanced.lastIndexOf('(');
    if (idx === -1) break;
    balanced = balanced.slice(0, idx) + balanced.slice(idx + 1);
    depth--;
  }
  q = balanced.trim();

  // 7. Sanitize NEAR() expressions.
  //    Valid:   NEAR(term1 term2)  or  NEAR(term1 term2, 10)
  //    Invalid: NEAR()  NEAR(,10)  NEAR(term)  unterminated NEAR(
  //    Strategy: replace any NEAR(...) that doesn't match the valid pattern
  //    with just its first term (best-effort fallback), then drop any
  //    unterminated NEAR( that has no closing paren.
  q = q.replace(/NEAR\s*\(([^)]*)\)/gi, (_match, inner) => {
    const t = inner.trim();
    // Valid: at least two whitespace-separated words, optional ", number"
    if (/^\w[\w\s]*\w(\s*,\s*\d+)?$/.test(t)) return _match; // keep as-is
    // Fallback: extract just the word tokens and return the first one
    const words = t.replace(/,\s*\d+/, '').trim().split(/\s+/).filter(Boolean);
    return words.length > 0 ? words[0] : '';
  });
  // Remove any leftover unterminated NEAR( (no closing paren found)
  q = q.replace(/NEAR\s*\([^)]*$/gi, '');

  // 8. Sanitize column filters.
  //    Valid:   colname : term    {col1 col2} : term
  //    Remove bare ':' with no preceding column identifier.
  //    Remove column filter where nothing follows the ':'.
  //    Remove empty multi-column braces '{ } :'.
  q = q.replace(/\{\s*\}\s*:/g, ''); // { } : → remove
  q = q.replace(/(?<!\w)(?<!\})\s*:/g, ''); // bare ':' with no col before it
  q = q.replace(/(\w+|\})\s*:\s*(?=\s|AND|OR|NOT|$)/gi, ''); // col : <nothing useful>

  q = q.trim();

  // Final guard: if nothing meaningful remains return null.
  if (!q || /^[\s()"*^:{}]+$/.test(q)) return null;

  return q;
};

export const searchEntries = (db, options = {}) => {
  const { query: rawQuery, ol, geo, timestamp, pages, primary_lang, mode } = options;
  const query = sanitizeFtsQuery(rawQuery);
  // Construct Base SQL

  const baseSql = `SELECT ciprdup.*, ciprdup.timestamp FROM ciprdup`;
  let ftsJoin = '';
  let orderBy = 'ORDER BY ciprdup.timestamp ASC'; // Default for no query

  if (query && query.trim() !== '') {
    ftsJoin = `JOIN ciprdup_fts ON ciprdup.rowid = ciprdup_fts.rowid`;
    // We need to inject the MATCH condition into WHERE, and update ORDER BY
    // Spec: "Tie-breaking: ... older entries (earlier timestamps) must be ranked higher."
    let weights = '32.0, 16.0, 8.0, 1.0, 1.0, 1.0';
    if (mode === 'seeking') weights = '32.0, 16.0, 8.0, 1.0, 1.0, 32.0';
    if (mode === 'offering') weights = '32.0, 16.0, 8.0, 1.0, 32.0, 1.0';
    orderBy = `ORDER BY bm25(ciprdup_fts, ${weights}) ASC, ciprdup.timestamp ASC`;
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
