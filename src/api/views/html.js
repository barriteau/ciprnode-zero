/**
 * @file src/api/views/html.js
 * @description Helper to generate HTML responses (Fragments or Full Pages).
 */

const ALPS_PROFILE = '/profiles/cipr.json';

/**
 * Generates an HTML response.
 * @param {string} title
 * @param {string} bodyContent
 * @param {boolean} isFragment - If true, returns only body content (HTMX).
 * @returns {Response}
 */
export const htmlResponse = (title, bodyContent, isFragment = false) => {
  let html = '';

  if (isFragment) {
    html = bodyContent;
  } else {
    html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Ciprnode</title>
    <!-- Custom CSS -->
    <link rel="stylesheet" href="/css/htr.css">
    <link rel="profile" href="${ALPS_PROFILE}" />

    <!-- Scripts -->
    <script src="https://unpkg.com/htmx.org@1.9.10"></script>
    <script defer src="/js/app.js"></script>
</head>
<body hx-boost="true">
    <header>
        <nav>
            <a href="/" class="brand">Ciprnode</a>
            <div class="menu">
                <a href="/">Home</a>
                <a href="/profiles/cipr.json">API Profile</a>
            </div>
        </nav>
    </header>

    <main id="main-content">
        ${bodyContent}
    </main>

    <footer>
        <p>Powered by <a href="https://cipr.info">Cipr</a> | <a href="${ALPS_PROFILE}">ALPS</a></p>
    </footer>
</body>
</html>`;
  }

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Link': `<${ALPS_PROFILE}>; rel="profile"`,
    },
  });
};

/**
 * Renders a simple error page/fragment.
 */
export const renderError = (title, message, isFragment) => {
  return htmlResponse(
    title,
    `<div class="error">
        <h1>${title}</h1>
        <p>${message}</p>
        <a href="/">Go Home</a>
    </div>`,
    isFragment,
  );
};
