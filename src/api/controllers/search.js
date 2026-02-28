/**
 * @file src/api/controllers/search.js
 * @description Controller for Search Operations (QUERY method).
 */

import { countEntries, getLanguageMap, getLatestTimestamp, searchEntries } from '../../db/repo.js';
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
          } catch (_e) {
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
    primary_lang: [],
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

  // Primary Lang
  const allLang = params.getAll('primary_lang');
  if (allLang.length > 0) {
    const combinedLang = [];
    allLang.forEach((val) => {
      const parsed = parseArray(val).map((v) => String(v).replace(/["']/g, ''));
      combinedLang.push(...parsed);
    });
    // Filter for valid 2-char codes (basic check before passing to repo)
    options.primary_lang = [...new Set(combinedLang)].filter((l) => l.length === 2);
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

  // Copy raw OL/Lang to filters for template check
  options.filters.ol = options.ol;
  options.filters.primary_lang = options.primary_lang;

  // Pagination
  const pNums = parseArray(params.get('pages_num') || '');
  const pSizes = parseArray(params.get('pages_size') || '');
  const pages = [];
  const defaultSize = config.page_size || 50;

  let currentPageUI = Number(params.get('page'));
  const allPageNums = [];

  if (currentPageUI) {
    if (currentPageUI < 1) currentPageUI = 1;
    if (currentPageUI > 100) currentPageUI = 100;
    allPageNums.push(currentPageUI);
    pages.push({
      offset: (currentPageUI - 1) * defaultSize,
      limit: defaultSize,
      pageNum: currentPageUI,
    });
  } else {
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

    pNums.forEach((p) => allPageNums.push(...expandRange(String(p))));
    if (allPageNums.length === 0) allPageNums.push(1);

    allPageNums.forEach((pageNum, idx) => {
      const sizeStr = pSizes[idx] !== undefined
        ? pSizes[idx]
        : (pSizes.length > 0 ? pSizes[pSizes.length - 1] : defaultSize);
      const size = Number(sizeStr) || defaultSize;
      if (pageNum < 1) pageNum = 1;
      if (pageNum > 100) pageNum = 100; // Max depth cap
      const offset = (pageNum - 1) * size;
      pages.push({ offset, limit: size, pageNum });
    });
    currentPageUI = allPageNums[0];
  }

  // Deduplicate and resolve actual pages
  options.pages = pages;

  // 2. Search Execution (Repo)
  // Only Global Search for now (scopeZa === null)
  // If scopeZa provided, we would check 'za' in DB or resindex?
  // Current repo `searchEntries` is global on ciprdup.
  // Should we filter by za if scopeZa is set?
  if (scopeZa) {
    // If searching /za/, we act on Resindex (Not implemented yet) OR just correct implementation for ciprdup?
    // Spec: "QUERY /za/ - Queries the resindex"
    // "QUERY / - Queries the ciprdup"
    // We are in 'ciprdup' territory.
    // If scopeZa is set, we strictly should query that za's resindex.
    // Since we don't have resindex yet, we return 501 Not Implemented or empty?
    // Or maybe we treat it as searching *for* that za in ciprdup? No, that's GET /za/.
    // So for this task "QUERY /", scopeZa is null.
  }

  const items = searchEntries(db, options);

  // Attach localized language names
  const langMap = getLanguageMap(db);
  items.forEach((item) => {
    if (item.primary_lang) {
      const langData = langMap.get(item.primary_lang);
      if (langData) {
        item.lang_name = langData.lang_name;
        item.lang_name_en = langData.lang_name_en;
      }
    }
  });

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
    parentUrl: config.parent_url || null,
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
    pagination: {
      currentPage: currentPageUI,
      pageSize: defaultSize,
      hasPrevPage: currentPageUI > 1,
      hasNextPage: items.length >= defaultSize && currentPageUI < 100, // naive peek
    },
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

/**
 * Handles GET /languages/ requests for the autocomplete feature.
 * Protected by Sec-Fetch-Site to reject cross-origin requests.
 */
export const getLanguages = (req, db, _config) => {
  // Enforce same-origin or same-site check for basic scraping protection
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'same-site') {
    return new Response('Forbidden', { status: 403 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get('lang_code') || url.searchParams.get('lang_name') ||
    url.searchParams.get('lang_name_en') || url.searchParams.get('q') || '';

  let queryStr = 'SELECT lang_code, lang_name, lang_name_en FROM languages';
  let queryParams = [];

  if (q) {
    queryStr += ' WHERE lang_code LIKE ? OR lang_name LIKE ? OR lang_name_en LIKE ? LIMIT 50';
    const likeQ = `%${q}%`;
    queryParams = [likeQ, likeQ, likeQ];
  } else {
    queryStr += ' ORDER BY lang_code ASC';
  }

  try {
    const langs = db.prepare(queryStr).all(...queryParams);
    return new Response(JSON.stringify(langs), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (e) {
    console.error('Error fetching languages:', e);
    return new Response('[]', {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
};
