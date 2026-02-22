import { handleRequest } from './routes.js';
import { serveDir } from 'jsr:@std/http@^1.0.24/file-server';
import { startScheduler } from '../bot/scheduler.js';
import { logDebug } from '../core/logger.js';
import { isWithinRadius } from '../db/geo.js';
import { initRenderer } from './views/renderer.js';

/**
 * Wraps a Response with a CompressionStream if compressible and accepted by client.
 * @param {Request} req
 * @param {Response} res
 * @returns {Response}
 */
const withCompression = (req, res) => {
  if (!res.body || res.status !== 200 && res.status !== 201) return res;

  const acceptEncoding = req.headers.get('accept-encoding') || '';
  if (!acceptEncoding.includes('gzip')) return res;

  const contentType = res.headers.get('content-type') || '';
  const isCompressible = [
    'text/',
    'application/javascript',
    'application/json',
    'application/xml',
    'image/svg+xml',
  ].some((t) => contentType.includes(t));

  if (isCompressible) {
    const headers = new Headers(res.headers);
    headers.delete('Content-Length');
    headers.set('Content-Encoding', 'gzip');

    const vary = headers.get('Vary') || '';
    if (!vary.includes('Accept-Encoding')) {
      headers.set('Vary', vary ? `${vary}, Accept-Encoding` : 'Accept-Encoding');
    }

    const stream = res.body.pipeThrough(new CompressionStream('gzip'));
    return new Response(stream, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  }
  return res;
};

/**
 * Starts the HTTP server.
 * @param {import('../core/config.js').CiprNodeConfig} config
 * @param {import('@db/sqlite').Database} db
 * @param {boolean} txtUpdated
 * @param {boolean} [skipScheduler=false]
 */
export const startServer = async (config, db, txtUpdated, skipScheduler = false) => {
  // Register Custom SQL Functions
  try {
    db.function('is_within_radius', isWithinRadius);
  } catch (e) {
    console.warn('Failed to register is_within_radius function:', e);
  }

  // Initialize Template Renderer
  await initRenderer();

  const handler = async (request) => {
    try {
      const url = new URL(request.url);

      if (config.debug) {
        let reqBody = '';
        try {
          if (request.body && (request.method === 'POST' || request.method === 'PUT')) {
            const reqClone = request.clone();
            reqBody = await reqClone.text();
          }
        } catch (_e) {
          reqBody = '[Error reading body]';
        }

        logDebug(config, `Incoming request: ${request.method} ${url.pathname}`, {
          headers: Object.fromEntries(request.headers),
          query: Object.fromEntries(url.searchParams),
          body: reqBody,
        });
      } else {
        logDebug(config, `Incoming request: ${request.method} ${url.pathname}`, {
          headers: Object.fromEntries(request.headers),
        });
      }
      console.log(`${request.method} ${url.pathname}`);

      // 0. DoS Protection: Content-Length Limit (512KB)
      const MAX_BODY_SIZE = 512 * 1024; // 524,288 bytes
      const contentLengthHeader = request.headers.get('content-length');
      if (contentLengthHeader) {
        const contentLength = parseInt(contentLengthHeader, 10);
        if (!isNaN(contentLength) && contentLength > MAX_BODY_SIZE) {
          console.warn(
            `[DoS Protection] Request rejected: Content-Length ${contentLength} exceeds limit of ${MAX_BODY_SIZE}`,
          );

          // Consume and drain body to avoid connection issues, or just close?
          // To be safe and fast, just return 413.
          return new Response('Payload Too Large', { status: 413 });
        }
      }

      // 1. Static File Serving (Ciprface)
      // Try to serve static files from public/ first if the path doesn't look like an API call.
      // Or prefer explicit paths. Let's assume root / is mostly API or Index.
      // Spec says: https://ciprnode.ZA/ -> Ciprface
      // Spec says: GET / -> Ciprdup (API)
      // We need Content Negotiation to decide, or strict path prefixes?
      // Spec: "GET / - Retrieves the contents of the ciprdup."
      // Spec: "Ciprface ... must be accesible from any browser as: https://ciprnode.ZA"
      // Usually browser sends Accept: text/html. API client sends Accept: application/json or hal+json.

      // Simple Content Negotiation Strategy
      const accept = request.headers.get('accept') || '';
      const isBrowser = accept.includes('text/html') || accept.includes('application/xhtml+xml');

      // 1. Static File Serving (Assets)
      // Serve known static paths regardless of Accept header
      if (
        url.pathname.startsWith('/css/') || url.pathname.startsWith('/js/') ||
        url.pathname.startsWith('/figures/') || url.pathname.startsWith('/profiles/') ||
        url.pathname === '/favicon.ico' || url.pathname === '/manifest.webmanifest' ||
        url.pathname === '/robots.txt'
      ) {
        const res = await serveDir(request, { fsRoot: 'public', urlRoot: '' });
        return withCompression(request, res);
      }

      // Root path '/' is handled by API Router (SearchController) or Fallback below.

      // 2. API Routing
      const apiResponse = await handleRequest(request, db, config);
      if (apiResponse) {
        if (config.debug) {
          // Clone response to read body without consuming the original stream if needed,
          // strictly speaking Response.clone() is cheap but text() consumes it.
          // For logging large bodies this might be heavy, but requested for debug.
          try {
            const resClone = apiResponse.clone();
            const bodyText = await resClone.text();
            logDebug(config, `Outgoing Response: ${apiResponse.status}`, {
              headers: Object.fromEntries(apiResponse.headers),
              body: bodyText.substring(0, 1000) + (bodyText.length > 1000 ? '...' : ''),
            });
          } catch (_e) { /* ignore body read errors */ }
        }
        return withCompression(request, apiResponse);
      }

      // 3. Fallback to static for everything else if browser (SPA-like or just 404 static) or return 404 JSON
      if (isBrowser) {
        const fallbackRes = await serveDir(request, { fsRoot: 'public', urlRoot: '' });
        return withCompression(request, fallbackRes);
      }

      return new Response('Not Found', { status: 404 });
    } catch (err) {
      console.error(`[FATAL] Request Handler Error: ${err.message}`, err);

      const errorHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>500 - Server Error</title>
          <style>
              body { font-family: sans-serif; background: #f4f4f4; color: #333; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
              .container { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 500px; text-align: center; }
              h1 { color: #d9534f; margin-top: 0; }
              p { line-height: 1.6; }
              .btn { display: inline-block; margin-top: 1rem; padding: 0.5rem 1rem; background: #333; color: white; text-decoration: none; border-radius: 4px; }
              .btn:hover { background: #555; }
          </style>
      </head>
      <body>
          <div class="container">
              <h1>500 - Server Error</h1>
              <p>Oops! Something went wrong on our end.</p>
              <p>We are experiencing a temporary issue. Please try refreshing the page or come back later.</p>
              <a href="/" class="btn">Return Home</a>
          </div>
      </body>
      </html>
      `;

      return new Response(errorHtml, {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
  };

  const server = Deno.serve({
    port: config.port,
    handler,
    onListen: ({ port, hostname }) => {
      console.log(`\nLocally listening on http://${hostname}:${port}/\n`);
      const welcome = `
█▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀█
█     Welcome to the Cosmic Index of Public Resources     █
█▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄█
`;
      (async () => {
        if (skipScheduler) {
          console.log(welcome);
          console.log(`[FRONT-DEV MODE] Reachability check and Ciprpulse scheduler disabled.`);
          return;
        }

        const ciprnodeHostname = `ciprnode.${config.za}`;
        try {
          // New logic: Use verifyNodeHttp (HEAD check)
          // We can't easily import it inside the callback without top-level import,
          // allow mixing dynamic import or top-level.
          // Let's use dynamic import to keep startup clean if needed, or better, add validation.js to imports.
          const { verifyNodeHttp } = await import('../core/verification.js');

          console.log(`Verifying reachability for ${ciprnodeHostname}...`);
          // We can't really verify HTTP reachability to "ourselves" if we haven't propatated in DNS yet?
          // Or if we are behind NAT?
          // The old logic checked for A/CNAME presence.
          // The user requirement: "The second step must be modified to be instead: Verification ... with a HEAD request"
          // This applies to "Verification of nodes" generally.
          // For *Self* Verification at startup, A/CNAME check is still useful to warn user if DNS is missing.
          // BUT if we want to standardize, we should check if we are resolvable.

          // Let's check DNS resolution first (still useful for user feedback) THEN try HEAD if resolved?
          // Or just replace entirely as requested?
          // "2. Verification of the existence of an A or an CNAME record ... must be modified to be instead ... HEAD request"

          // The issue with HEAD request at *startup* (onListen) is that if we just started, we are listening,
          // but if DNS points to us, we should be reachable.

          const isReachable = await verifyNodeHttp(config.za, config);

          if (isReachable) {
            console.log(`[OK] Ciprnode is reachable via https://${ciprnodeHostname}/`);
            console.log(welcome);

            // Start Ciprpulse Scheduler
            startScheduler(config, db, txtUpdated);
          } else {
            // Fallback to detailed diagnostics if HEAD fails
            console.log(`[WARN] HEAD request to https://${ciprnodeHostname}/ failed.`);
            console.log(`Checking DNS records directly for diagnostics...`);

            try {
              await Deno.resolveDns(ciprnodeHostname, 'A');
              console.log(`[OK] 'A' record exists.`);
            } catch (e) {
              console.warn(`[ERR] No 'A' record found: ${e.message}`);
            }

            console.log(welcome);
            console.warn(`WARNING: This node may not be publicly reachable.`);

            // [Debug/Dev Fix] Fallback to Local Check to allow Scheduler to start in testing
            if (config.debug) {
              console.log(
                `[Debug] Public check failed. Attempting local loopback check (HTTP) on port ${config.port}...`,
              );
              try {
                const localUrl = `http://localhost:${config.port}/`;
                const localRes = await fetch(localUrl, { method: 'HEAD' });
                if (localRes.ok) {
                  console.log(`[Debug] Local loopback confirmed (HTTP ${localRes.status}).`);
                  console.log(`[Debug] Starting Ciprpulse scheduler in LOCAL/DEV mode.`);
                  startScheduler(config, db, txtUpdated);
                } else {
                  console.warn(`[Debug] Local loopback also failed: ${localRes.status}`);
                  console.warn(`Ciprpulse scheduler will NOT be started.`);
                }
              } catch (localErr) {
                console.warn(`[Debug] Local loopback error: ${localErr.message}`);
                console.warn(`Ciprpulse scheduler will NOT be started.`);
              }
            } else {
              console.warn(`Ciprpulse scheduler will NOT be started.`);
            }
          }
        } catch (e) {
          console.error(`Startup verification error:`, e);
          console.log(welcome);
        }
      })();
    },
  });
  await server.finished;
};
