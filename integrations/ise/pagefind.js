/**
 * @file integrations/ise/pagefind.js
 * @description Pagefind integration for the CiprNode Zero Internal Search Engine (ISE).
 */

export const queryResindex = async (provider, options) => {
  const searchUrl = provider.url;

  if (!searchUrl) {
    console.error(`[PAGEFIND] Missing URL in the ise_provider configuration.`);
    return { count: 0, items: [] };
  }

  console.log(`[PAGEFIND] Querying search endpoint at ${searchUrl} for: "${options.query}"`);

  const originalFetch = globalThis.fetch; // Capture original fetch early

  try {
    const baseUrl = searchUrl.endsWith('/') ? searchUrl.slice(0, -1) : searchUrl;
    const pagefindUrl = `${baseUrl}/pagefind/pagefind.js`;

    // Deno's native fetch requires absolute URLs. Pagefind's browser script uses relative URLs (e.g. "/pagefind/...")
    // We mock the global fetch to intercept relative requests and prepend the target's base URL.
    globalThis.fetch = async (input, init) => {
      let urlStr = input;
      if (typeof input === 'string' && input.startsWith('/')) {
        urlStr = baseUrl + input;
      } else if (input instanceof URL && input.pathname && !input.host) {
        urlStr = baseUrl + input.pathname + input.search;
      }
      return originalFetch(urlStr, init);
    };

    let pagefind;
    // Dynamically import the remote Pagefind JS module
    pagefind = await import(pagefindUrl);

    // Some versions of Pagefind respect baseUrl passed to options
    await pagefind.options({ baseUrl: baseUrl + '/' });
    await pagefind.init();

    const searchResult = await pagefind.search(options.query);

    // Calculate pagination slice
    let offset = 0;
    let limit = 50;
    if (options.pages && options.pages.length > 0) {
      offset = options.pages[0].offset;
      limit = options.pages[0].limit;
    }

    // Safely cap limit if it exceeds available results
    const pagedResults = searchResult.results.slice(offset, offset + limit);

    // Pagefind requires awaiting the data() call to fetch the static chunk for the excerpt
    const dataResults = await Promise.all(pagedResults.map((r) => r.data()));

    const items = dataResults.map((data) => ({
      url: data.url, // Pagefind URLs are typically path-absolute (e.g. "/about/")
      title: data.meta?.title || data.url,
      description: data.excerpt || '',
    }));

    return {
      count: searchResult.results.length,
      items,
    };
  } catch (error) {
    console.error(`[PAGEFIND] Query Failed for ${searchUrl}:`, error.message);
    return { count: 0, items: [] };
  } finally {
    // Always restore global fetch so we don't pollute the rest of the Ciprnode server!
    globalThis.fetch = originalFetch;
  }
};
