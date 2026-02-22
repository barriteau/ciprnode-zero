/**
 * @file src/api/controllers/search.js
 * @description Controller for Search Operations (QUERY method).
 */

import { countEntries, getLatestTimestamp, searchEntries } from '../../db/repo.js';
import { render } from '../views/renderer.js';

/**
 * Handles QUERY requests.
 */
export const query = async (req, db, config, scopeZa) => {
  // 1. Parse Request Body & Query Params
  const params = new URLSearchParams();
  const contentType = req.headers.get('content-type') || '';
  const url = new URL(req.url);

  // Merge URL params first
  for (const [key, val] of url.searchParams) {
    params.append(key, val);
  }

  // Parse Body
  let bodyText = '';
  try {
    if (req.body) {
      bodyText = await req.text();
    }
  } catch (e) {
    console.error('Error reading body:', e);
  }

  if (bodyText) {
    if (contentType.includes('application/json') || contentType.includes('application/hal+json')) {
      try {
        const bodyObj = JSON.parse(bodyText);
        for (const [key, val] of Object.entries(bodyObj)) {
          if (Array.isArray(val)) {
            if (params.has(key)) params.delete(key);
            val.forEach((v) => params.append(key, String(v)));
          } else {
            if (params.has(key)) params.delete(key);
            params.append(key, String(val));
          }
        }
      } catch (e) {
        console.error('Error parsing JSON body:', e);
      }
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const bodyParams = new URLSearchParams(bodyText);
      const keysToOverride = new Set([...bodyParams.keys()]);
      for (const key of keysToOverride) {
        if (params.has(key)) params.delete(key);
      }
      for (const [key, val] of bodyParams) {
        params.append(key, val);
      }
    } else {
      // Text/Plain or Raw
      const rawParams = new URLSearchParams(bodyText);
      let looksLikeParams = false;
      for (const key of rawParams.keys()) {
        if (key === 'query' || key === 'ol' || key === 'geo_latitude') {
          looksLikeParams = true;
          break;
        }
      }

      if (looksLikeParams) {
        const keysToOverride = new Set([...rawParams.keys()]);
        for (const key of keysToOverride) {
          if (params.has(key)) params.delete(key);
        }
        for (const [key, val] of rawParams) {
          params.append(key, val);
        }
      } else {
        const trimmedBody = bodyText.trim();
        if (trimmedBody.startsWith('{') && trimmedBody.endsWith('}')) {
          try {
            const bodyObj = JSON.parse(trimmedBody);
            for (const [key, val] of Object.entries(bodyObj)) {
              if (Array.isArray(val)) {
                if (params.has(key)) params.delete(key);
                val.forEach((v) => params.append(key, String(v)));
              } else {
                if (params.has(key)) params.delete(key);
                params.append(key, String(val));
              }
            }
          } catch (e) {
            params.set('query', trimmedBody);
          }
        } else if (trimmedBody) {
          params.set('query', trimmedBody);
        }
      }
    }
  }

  // Helper to parse array
  const parseArray = (val) => {
    if (!val) return [];
    if (typeof val !== 'string') return Array.isArray(val) ? val : [val];
    const cleaned = val.replace(/^\[|\]$/g, '');
    if (!cleaned.trim()) return [];
    return cleaned.split(',').map((s) => s.trim()).filter((s) => s);
  };

  // Build Options Object
  const options = {
    query: params.get('q') || params.get('query') || '',
    ol: [],
    geo: {},
    timestamp: {},
    pages: [],
  };

  // OL
  const allOl = params.getAll('ol');
  if (allOl.length > 0) {
    const combinedOl = [];
    allOl.forEach((val) => {
      // parseArray handles '["0", "1"]' by returning ['"0"', '"1"']
      // We strip quotes and convert to Number
      const parsed = parseArray(val).map((v) => Number(String(v).replace(/["']/g, '')));
      combinedOl.push(...parsed);
    });
    // Filter out NaN and duplicates
    options.ol = [...new Set(combinedOl)].filter((n) => !isNaN(n));
  }

  // Geo
  options.geo.latitude = params.get('geo_latitude');
  options.geo.longitude = params.get('geo_longitude');

  if (!options.geo.latitude || !options.geo.longitude) {
    options.geo.latitude = null;
    options.geo.longitude = null;
  }

  // Radius handling
  const radius = params.get('geo_radius');
  const unit = params.get('geo_unit');
  options.filters = {}; // Store raw filter values for inputs
  options.filters.radius = radius;
  options.filters.lat = params.get('geo_latitude');
  options.filters.lon = params.get('geo_longitude');
  options.filters.unit = unit;

  if (options.geo.latitude && options.geo.longitude) {
    if (radius) {
      let r = parseFloat(radius);
      if (unit === 'mi') {
        r = r * 1.60934;
      }
      options.geo.max = r;
    }
    if (params.has('geo_min_radius_km')) options.geo.min = params.get('geo_min_radius_km');
    if (params.has('geo_max_radius_km') && !options.geo.max) {
      options.geo.max = params.get('geo_max_radius_km');
    }
  }

  // Timestamp
  const parseTimestamp = (val) => {
    if (!val) return undefined;
    if (/^\d+$/.test(val)) return Number(val);
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return Math.floor(d.getTime() / 1000);
    }
    return undefined;
  };

  // Allow 'before' and 'after' from inputs
  options.filters.after = params.get('after');
  options.filters.before = params.get('before');

  if (params.has('before')) options.timestamp.before = parseTimestamp(params.get('before'));
  if (params.has('after')) options.timestamp.after = parseTimestamp(params.get('after'));

  // Copy raw OL to filters for template check
  options.filters.ol = options.ol;

  // Pagination (Classic logic preserved)
  const pNums = parseArray(params.get('pages_num') || '');
  const pSizes = parseArray(params.get('pages_size') || '');
  const pages = [];
  const defaultSize = 10;

  const expandRange = (str) => {
    if (str.includes('-')) {
      const [start, end] = str.split('-').map(Number);
      if (!isNaN(start) && !isNaN(end)) {
        const res = [];
        for (let i = start; i <= end; i++) res.push(i);
        return res;
      }
    }
    return [Number(str)];
  };

  let allPageNums = [];
  pNums.forEach((p) => allPageNums.push(...expandRange(String(p))));
  if (allPageNums.length === 0) allPageNums.push(1);

  allPageNums.forEach((pageNum, idx) => {
    let sizeStr = pSizes[idx] !== undefined
      ? pSizes[idx]
      : (pSizes.length > 0 ? pSizes[pSizes.length - 1] : defaultSize);
    let size = Number(sizeStr) || defaultSize;
    if (pageNum < 1) pageNum = 1;
    const offset = (pageNum - 1) * size;
    pages.push({ offset, limit: size, pageNum });
  });
  options.pages = pages;

  // 2. Search Execution (Repo)
  // Only Global Search for now (scopeZa === null)
  // If scopeZa provided, we would check 'za' in DB or resindex?
  // Current repo `searchEntries` is global on ciprdup.
  // Should we filter by ZA if scopeZa is set?
  if (scopeZa) {
    // If searching /ZA/, we act on Resindex (Not implemented yet) OR just correct implementation for ciprdup?
    // Spec: "QUERY /ZA/ - Queries the resindex"
    // "QUERY / - Queries the ciprdup"
    // We are in 'ciprdup' territory.
    // If scopeZa is set, we strictly should query that ZA's resindex.
    // Since we don't have resindex yet, we return 501 Not Implemented or empty?
    // Or maybe we treat it as searching *for* that ZA in ciprdup? No, that's GET /ZA/.
    // So for this task "QUERY /", scopeZa is null.
  }

  const items = searchEntries(db, options);

  // 3. Render Response
  const accept = req.headers.get('accept') || '';
  const isFragment = req.headers.get('HX-Request') === 'true';

  // Locale Detection
  // Priority: 1. Cookie 'cipr_lang', 2. Header 'Accept-Language', 3. Default 'en'
  let locale = 'en';
  const cookieHeader = req.headers.get('cookie') || '';
  const match = cookieHeader.match(/cipr_lang=([a-z]{2})/);
  if (match) {
    locale = match[1];
  } else {
    const acceptLang = req.headers.get('accept-language');
    if (acceptLang) {
      // simple check for first 2 chars
      // "es-ES,es;q=0.9" -> "es"
      locale = acceptLang.substring(0, 2).toLowerCase();
    }
  }

  // A. JSON / HAL
  if (accept.includes('application/json') || accept.includes('application/hal+json')) {
    // Returned minimal JSON for now to focus on Frontend task
    const enrichedItems = items.map((item) => ({
      ...item,
      _links: { self: { href: `/${item.za}/` } },
    }));

    const response = {
      _links: {
        self: { href: req.url },
      },
      count: items.length, // Only this page count? Or total? Spec implies total 'count=42'
      pages_num: allPageNums,
      pages_size: pages.map((p) => p.limit), // simplified
      _embedded: {
        results: enrichedItems,
      },
    };
    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/hal+json; charset=utf-8' },
    });
  }

  // B. HTML (Template)
  const templateData = {
    scopeZa: scopeZa,
    configZa: config.za,
    stats: { // potentially expensive to get real count every time?
      count: countEntries(db),
      last_insert: (() => {
        const latestTs = getLatestTimestamp(db);
        // The DB stores timestamp in seconds, so multiply by 1000 for JS Date
        const d = latestTs ? new Date(latestTs * 1000) : new Date();
        return new Intl.DateTimeFormat(locale, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(d);
      })(), // Real metadata
    },
    query: options.query,
    filters: options.filters,
    results: items,
    allPageNums: allPageNums,
    // Add pagination data if needed
  };

  let html;
  if (isFragment) {
    // Render only the results list partial
    html = render('partials/results.eta', templateData, locale);
  } else {
    // Render the full page
    html = render('views/index.eta', templateData, locale);
  }

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Vary': 'Accept-Language, Cookie',
    },
  });
};
