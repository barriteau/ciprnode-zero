import { handleRequest } from './routes.js';
import { serveDir } from 'jsr:@std/http@^1.0.24/file-server';
import { startScheduler } from '../bot/scheduler.js';
import { isWithinRadius } from '../db/geo.js';
import { msg } from '../core/utils.js';
import { initRenderer, render } from './views/renderer.js';
import { notify } from '../core/notify.js';

/**
 * Wraps a Response with a CompressionStream if compressible and accepted by client.
 * @param {Request} req
 * @param {Response} res
 * @returns {Response}
 */
const withCompression = (req, res) => {
  // Only compress responses that have a body.
  if (!res.body) return res;

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
 * Wraps a Response to completely disable browser and CDN caching (e.g., Cloudflare).
 * This is crucial for Service Workers (`sw.js`).
 * @param {Response} res
 * @returns {Response}
 */
const withNoCache = (res) => {
  const headers = new Headers(res.headers);
  // Specifically instructs Cloudflare and browsers to never cache this file.
  headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');

  // Return a new Response with the modified headers
  // Avoids TypeError: Cannot modify an immutable Headers object
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
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
    msg('Failed to register is_within_radius function: ' + e, 'WA');
  }

  // Initialize Template Renderer
  await initRenderer();

  const innerHandler = async (request, _info) => {
    try {
      const url = new URL(request.url);

      const MAX_BODY_SIZE = 512 * 1024;
      const contentLengthHeader = request.headers.get('content-length');
      if (contentLengthHeader) {
        const contentLength = parseInt(contentLengthHeader, 10);
        if (!isNaN(contentLength) && contentLength > MAX_BODY_SIZE) {
          msg(
            `[DoS Protection] Request rejected: Content-Length ${contentLength} exceeds limit of ${MAX_BODY_SIZE}`,
          );

          return new Response('Payload Too Large', { status: 413 });
        }
      }

      const accept = request.headers.get('accept') || '';
      const isBrowser = accept.includes('text/html') || accept.includes('application/xhtml+xml');

      if (
        url.pathname.startsWith('/css/') || url.pathname.startsWith('/js/') ||
        url.pathname.startsWith('/figures/') || url.pathname.startsWith('/profiles/') ||
        url.pathname === '/favicon.ico' || url.pathname === '/manifest.webmanifest' ||
        url.pathname === '/robots.txt' || url.pathname === '/sw.js'
      ) {
        let res = await serveDir(request, { fsRoot: 'public', urlRoot: '' });

      if (url.pathname === '/sw.js') {
        res = withNoCache(res);
      }

        return withCompression(request, res);
      }

      const apiResponse = await handleRequest(request, db, config);
      if (apiResponse) {
        return withCompression(request, apiResponse);
      }

      if (isBrowser) {
        const fallbackRes = await serveDir(request, { fsRoot: 'public', urlRoot: '' });
        return withCompression(request, fallbackRes);
      }

      return new Response('Not Found', { status: 404 });
    } catch (err) {
      msg(`Request Handler Error: ${err.message}`, 'KO');

      let errorHtml;
      try {
        errorHtml = render('error', {
          errorTitle: '500 - Server Error',
          errorMessage:
            'Oops! Something went wrong on our end. We are experiencing a temporary issue.',
        });
      } catch (_renderErr) {
        errorHtml = '<h1>500 - Server Error (Renderer Failed)</h1>';
      }

      return new Response(errorHtml, {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
  };

  // --- Per-IP Rate Limiter for P2P write endpoints (PUT / DELETE) ---
  // These endpoints trigger expensive verification chains (DNS + HTTP + QUERY).
  // An uncapped flood can exhaust outbound connections and stall the event loop.
  /** @type {Map<string, { put: number, del: number, resetAt: number }>} */
  const rateLimitMap = new Map();
  const RL_WINDOW_MS = 60_000;   // 1-minute sliding window
  const RL_MAX_PUT   = 30;       // max PUT requests per IP per window
  const RL_MAX_DEL   = 20;       // max DELETE requests per IP per window

  // Periodic GC to avoid unbounded map growth (runs every 5 minutes)
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap) {
      if (now > entry.resetAt) rateLimitMap.delete(ip);
    }
  }, 5 * 60_000);

  /**
   * Checks and increments the per-IP rate counter for a given method.
   * @param {string} ip
   * @param {'put'|'del'} method
   * @returns {boolean} True if the request is within limit, false if it must be rejected.
   */
  const checkRateLimit = (ip, method) => {
    const now = Date.now();
    let entry = rateLimitMap.get(ip);
    if (!entry || now > entry.resetAt) {
      entry = { put: 0, del: 0, resetAt: now + RL_WINDOW_MS };
      rateLimitMap.set(ip, entry);
    }
    const limit = method === 'put' ? RL_MAX_PUT : RL_MAX_DEL;
    if (entry[method] >= limit) return false;
    entry[method]++;
    return true;
  };

  const handler = async (request, info) => {
    const method = request.method.toUpperCase();
    // Vector B: when behind Cloudflare, remoteAddr is always a CF edge IP.
    // CF-Connecting-IP carries the real client IP — use it for rate limiting.
    const clientIp = request.headers.get('CF-Connecting-IP') ??
      info?.remoteAddr?.hostname ??
      'unknown';

    // Rate-limit PUT and DELETE globally before any processing
    if (method === 'PUT' || method === 'DELETE') {
      const rlKey = method === 'PUT' ? 'put' : 'del';
      if (!checkRateLimit(clientIp, rlKey)) {
        notify('rate_limit_hit', { ip: clientIp, method });
        return new Response('Too Many Requests', {
          status: 429,
          headers: { 'Retry-After': '60' },
        });
      }
    }

    let response = await innerHandler(request, info);
    
    // Add Security Headers
    const headers = new Headers(response.headers);
    headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'; form-action 'self'; connect-src 'self' https: wss:;");

    response = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: headers
    });
    
    if (config.log_level >= 2) {
      const parsedUrl = new URL(request.url);
      msg(`Incoming request:\n  Method: ${request.method}\n  Path: ${parsedUrl.pathname}\n  From: ${info.remoteAddr.hostname}`, 'REQ');
      msg(`  Outgoing Response: ${response.status}`, 'RES');
    }
    
    return response;
  };

  const server = Deno.serve({
    port: config.port,
    handler,
    onListen: ({ port, hostname }) => {
      msg(`\nLocally listening on http://${hostname}:${port}/\n`);
      const welcome = `
█▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀█
█     Welcome to the Cosmic Index of Public Resources     █
█▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄█
`;
      (async () => {
        if (skipScheduler) {
          msg(welcome, 'H1');
          msg(` Front-end development mode, reachability check and Ciprpulse scheduler disabled.`, 'WA');
          return;
        }

        const ciprnodeHostname = `ciprnode.${config.za}`;
        try {
          const { verifyNodeHttp } = await import('../core/verification.js');

          msg(`Verifying reachability for ${ciprnodeHostname}...`);

          const isReachable = await verifyNodeHttp(config.za, config);

          if (isReachable) {
            msg(`[OK] Ciprnode is reachable via https://${ciprnodeHostname}/`, 'OK');
            msg(welcome);

            startScheduler(config, db, txtUpdated);
          } else {
            msg(`HEAD request to https://${ciprnodeHostname}/ failed.`, 'WA');
            msg(`Checking DNS records directly for diagnostics...`);

            try {
              await Deno.resolveDns(ciprnodeHostname, 'A');
              msg(`[OK] 'A' record exists.`, 'OK');
            } catch (e) {
              msg(`No 'A' record found: ${e.message}`, 'WA');
            }

            msg(welcome);
            msg(`WARNING: This node may not be publicly reachable.`, 'WA');

            // [Debug/Dev Fix] Fallback to Local Check to allow Scheduler to start in testing
            if (config.debug) {
              msg(
                `Public check failed. Attempting local loopback check (HTTP) on port ${config.port}...`,
              );
              try {
                const localUrl = `http://localhost:${config.port}/`;
                const localRes = await fetch(localUrl, { method: 'HEAD' });
                if (localRes.ok) {
                  msg(`Local loopback confirmed (HTTP ${localRes.status}).`);
                  msg(`Starting Ciprpulse scheduler in LOCAL/DEV mode.`);
                  startScheduler(config, db, txtUpdated);
                } else {
                  msg(`Local loopback also failed: ${localRes.status}`, 'WA');
                  msg(`Ciprpulse scheduler will NOT be started.`, 'WA');
                }
              } catch (localErr) {
                msg(`Local loopback error: ${localErr.message}`, 'WA');
                msg(`Ciprpulse scheduler will NOT be started.`, 'WA');
              }
            } else {
              msg(`Ciprpulse scheduler will NOT be started.`, 'WA');
            }
          }
        } catch (e) {
          msg(`Startup verification error: ${e.message}`, 'KO');
          msg(welcome);
        }
      })();
    },
  });
  await server.finished;
};
