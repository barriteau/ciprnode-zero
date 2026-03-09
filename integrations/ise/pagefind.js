/**
 * @file integrations/ise/pagefind.js
 * @description Pagefind integration for the CiprNode Zero Internal Search Engine (ISE).
 *
 * Strategy: Instead of `import(url)` (requires `--allow-import` in Deno 2),
 * we fetch the Pagefind JS source as text, execute it via `new Function()` in
 * a synthetic minimal browser environment, then call the resulting `pagefind`
 * module's API directly. This avoids the `--allow-import` permission entirely
 * and works in compiled Deno executables.
 */

/**
 * Creates a minimal browser-like global scope sufficient for Pagefind to initialize.
 * Pagefind checks for `window`, `document`, `TextDecoder`, `TextEncoder`, and `WebAssembly`.
 * @param {string} baseUrl - The base URL of the ISE provider (e.g. "https://cgt.barriteau.net").
 * @param {Function} absoluteFetch - An already-patched fetch that handles relative URLs.
 * @returns {Record<string, unknown>} A context object for Pagefind's module scope.
 */
const buildPagefindContext = (_baseUrl, absoluteFetch) => ({
  fetch: absoluteFetch,
  URL: globalThis.URL,
  URLSearchParams: globalThis.URLSearchParams,
  TextDecoder: globalThis.TextDecoder,
  TextEncoder: globalThis.TextEncoder,
  WebAssembly: globalThis.WebAssembly,
  console: globalThis.console,
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
  performance: globalThis.performance,
  Promise: globalThis.Promise,
  // Trick Pagefind into thinking it's NOT in a browser — prevents it from
  // reading window.location or document.currentScript for path inference.
  window: undefined,
  document: undefined,
  location: undefined,
});

/**
 * Fetches and evaluates the Pagefind JS bundle in a controlled context.
 * Returns the pagefind module-level API (search, init, options, etc).
 * @param {string} pagefindUrl - Absolute URL to pagefind.js.
 * @param {string} baseUrl - Base URL of the ISE provider.
 * @param {Function} absoluteFetch - Patched fetch for absolute URL resolution.
 * @returns {Promise<Record<string, Function>>}
 */
const loadPagefindModule = async (pagefindUrl, baseUrl, absoluteFetch) => {
  const response = await absoluteFetch(pagefindUrl);
  if (!response.ok) throw new Error(`Failed to fetch Pagefind JS: ${response.status} ${pagefindUrl}`);

  let source = await response.text();

  // Pagefind checks `import.meta.url` to derive its own `basePath`.
  // `import.meta` is illegal inside `new Function()` (it's only valid in ES module scope).
  // We replace it with the actual URL string so Pagefind infers the correct basePath.
  source = source.replaceAll('import.meta.url', JSON.stringify(pagefindUrl));

  // Pagefind ends with a named export block: `export{init,search,options,...}`
  // This block may or may not be on its own line; match it anywhere in the source.
  const namedExportMatch = source.match(/export\s*\{([^}]+)\}\s*;?\s*$/);
  let exportedNames = [];
  if (namedExportMatch) {
    exportedNames = namedExportMatch[1].split(',').map((s) => s.trim());
    // Remove the export block so `new Function()` doesn't choke on `export`
    source = source.replace(/export\s*\{[^}]+\}\s*;?\s*$/, '');
  }

  // Also strip any remaining top-level `export` keywords (just in case)
  source = source.replace(/\bexport\s+(const|let|var|function|async\s+function|class)\s+/g, '$1 ');
  source = source.replace(/\bexport\s+default\s+/g, 'var __defaultExport = ');

  // Build the wrapper: execute the source, then collect the exported names into __exports
  const collectExports = exportedNames.length > 0
    ? `const __exports = {${exportedNames.map((n) => `${n}:typeof ${n}!=='undefined'?${n}:undefined`).join(',')}};`
    : 'const __exports = {};';

  const wrappedSource = `${source}\n${collectExports}\nreturn __exports;`;

  const ctx = buildPagefindContext(baseUrl, absoluteFetch);
  // Build argument list from context keys so the function has them as locals
  const ctxKeys = Object.keys(ctx);
  const ctxVals = ctxKeys.map((k) => ctx[k]);

  // eslint-disable-next-line no-new-func
  const factory = new Function(...ctxKeys, wrappedSource);
  const result = factory(...ctxVals);

  return result;
};

/**
 * Checks if Pagefind exports the required API.
 * @param {Record<string, unknown>} pagefind
 * @returns {boolean}
 */
const hasPagefindAPI = (pagefind) =>
  typeof pagefind?.search === 'function' && typeof pagefind?.init === 'function';

// Cache the loaded module so we don't re-fetch on every search request
let _cachedPagefind = null;
let _cachedBaseUrl = null;

/**
 * Queries the Pagefind ISE provider.
 * @param {{ url: string }} provider
 * @param {{ query: string, pages: Array<{offset: number, limit: number}> }} options
 * @returns {Promise<{ count: number, items: Array<{url: string, title: string, description: string}> }>}
 */
export const queryResindex = async (provider, options) => {
  const searchUrl = provider.url;

  if (!searchUrl) {
    console.error(`[PAGEFIND] Missing URL in the ise_provider configuration.`);
    return { count: 0, items: [] };
  }

  console.log(`[PAGEFIND] Querying ${searchUrl} for: "${options.query}"`);

  const baseUrl = searchUrl.endsWith('/') ? searchUrl.slice(0, -1) : searchUrl;
  const basePath = `${baseUrl}/pagefind/`;
  const pagefindUrl = `${basePath}pagefind.js`;

  // Build an absolute fetch that resolves root-relative URLs against the ISE base
  const absoluteFetch = (input, init) => {
    let urlStr = typeof input === 'string' ? input : String(input);
    if (urlStr.startsWith('/')) urlStr = baseUrl + urlStr;
    return globalThis.fetch(urlStr, init);
  };

  try {
    // Cache the loaded module across requests (same provider URL = same module)
    if (!_cachedPagefind || _cachedBaseUrl !== baseUrl) {
      console.log('[PAGEFIND] Loading Pagefind module via fetch (no --allow-import needed)...');
      _cachedPagefind = await loadPagefindModule(pagefindUrl, baseUrl, absoluteFetch);
      _cachedBaseUrl = baseUrl;

      if (!hasPagefindAPI(_cachedPagefind)) {
        throw new Error('Pagefind module did not export expected search/init functions.');
      }

      await _cachedPagefind.options({ basePath });
      await _cachedPagefind.init(undefined, { load_wasm: true });
      console.log('[PAGEFIND] Module initialized successfully.');
    }

    const searchResult = await _cachedPagefind.search(options.query);

    const dataResults = await Promise.all(searchResult.results.map((r) => r.data()));

    const items = dataResults.map((data) => ({
      url: data.url,
      title: data.meta?.title || data.url,
      description: data.excerpt || '',
    }));

    return { count: searchResult.results.length, items };
  } catch (error) {
    // Reset cache on error so the next request retries initialization
    _cachedPagefind = null;
    _cachedBaseUrl = null;
    console.error(`[PAGEFIND] Query Failed for ${searchUrl}:`, error.message);
    console.error('[PAGEFIND] Stack:', error.stack);
    console.error('[PAGEFIND] CWD:', Deno.cwd?.() ?? 'unavailable');
    return { count: 0, items: [] };
  }
};
