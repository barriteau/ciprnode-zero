# Ciprnode zero

> **Disclaimer**: This is alpha software intended for testing in controlled environments. It is expected to be unstable.

**Ciprnode zero** (`Cn0`) is a first and referencial *ciprnode* implementation, the fundamental building block of the **Cosmic Index of Public Resources (Cipr)**. It is a proof-of-concept designed to test the viability of a decentralized and distributed web index.

This software allows any domain owner to host a copy of the Cipr and consequently be a part of it.

A deployed ciprnode is also a search-engine-like front-end offering a two-level search: first level is in the index itself and second level is deep inside the content exposed by any cipred resource.

## Key Features

### 1. Ciprdup: the distributed index

A local **SQLite** database (`data/ciprdup.db`) that stores the node's copy of the distributed index. The database is optimized for both high-volume reads and full-text search.

#### Schema and FTS5

- An **external-content FTS5 virtual table** (`ciprdup_fts`) is kept in sync with the main `ciprdup` table via automatic SQLite triggers (on insert, update, and delete). The virtual table indexes six fields: `za`, `title`, `description`, `keywords`, `offering`, and `seeking`.
- **BM25 ranking** is the basis for all text search relevance scores.
- **Configurable BM25 weights** per field are applied according to the active search mode:
  - *Default*: `za=32, title=16, description=8, keywords=1, offering=1, seeking=1`
  - *Offering-prioritized*: `za=32, title=16, description=8, keywords=1, offering=32, seeking=1`
  - *Seeking-prioritized*: `za=32, title=16, description=8, keywords=1, offering=1, seeking=32`
- A **`languages` reference table** is seeded on startup from a bundled JSON dataset of over 180 ISO 639-1 language codes and their names in both English and the language's own script.
- A **custom SQLite scalar function** `is_within_radius(lat, lon, centerLat, centerLon, minKm, maxKm)` is registered at runtime to enable geographic proximity filtering using the Haversine formula.

#### Data Model

Each entry (`za`) stores: `title`, `description`, `keywords`, `offering`, `seeking`, `ol` (offensiveness level 0–3), `latitude`, `longitude` (WGS84 × 10,000,000 as integers), `timestamp` (Unix seconds), and `primary_lang` (ISO 639-1 code).

#### FTS Query Sanitization

Raw query strings from users or peers are sanitized in `repo.js` before being passed to SQLite FTS5, in the following order:

1. Balance unterminated double-quote pairs (odd count → append closing `"`).
2. Strip invalid `*` placements (prefix wildcards, mid-word wildcards; only trailing `word*` is valid).
3. Strip invalid `^` placements (only leading `^word` is valid).
4. Remove leading binary operators (`AND`, `OR`).
5. Remove trailing binary operators (`AND`, `OR`, `NOT`).
6. Balance parentheses (remove unmatched `)` on the first pass, then unmatched `(` on the second).
7. Sanitize malformed `NEAR()` expressions (empty, unterminated, single-term), falling back to the first word token.
8. Strip malformed column filters (bare `:`, empty `{}:`, filter with no following term).
9. Return `null` if nothing meaningful remains (query is skipped entirely).

### 2. CiprAPI: Semantic RESTful Web API

A strict **Semantic RESTful** implementation with full **HATEOAS** via **HAL+JSON** (`application/hal+json`). All responses support content negotiation against `application/hal+json`, `application/json`, `text/plain`, `text/html`, and `application/xhtml+xml`.

#### Endpoints

|  Method   | Path             |                Status codes                | Description                                                                                           |
|:---------:|:-----------------|:------------------------------------------:|:------------------------------------------------------------------------------------------------------|
|  `HEAD`   | `/`              |                  `200 OK`                  | Verifies node presence. Returns `X-Cipr-Count` header with total entry count.                         |
|   `GET`   | `/`              |                  `200 OK`                  | Lists all entries (paginated). Returns HAL+JSON or HTML depending on `Accept`.                        |
|   `PUT`   | `/{za}/`         | `202 Accepted`, `400`, `403`, `409`, `413` | Upserts a cipred resource after passing the full Insertion Validation Sequence.                       |
| `DELETE`  | `/{za}/`         |               `202 Accepted`               | Requests deletion, accepted or ignored depending on validation result.                                |
|  `QUERY`  | `/`              |                  `200 OK`                  | Full-text search with filters and pagination over the ciprdup.                                        |
|   `GET`   | `/{za}/`         |              `200 OK`, `404`               | Retrieves all fields for a specific entry in HAL+JSON or HTML.                                        |
|   `GET`   | `/{za}/{field}/` |              `200 OK`, `404`               | Retrieves a single field. Supports `text/plain` and `hal+json`.                                       |
|  `HEAD`   | `/ri/`           |         `200 OK`, `204 No Content`         | Checks if a resindex (ISE) is configured (`200`) or absent (`204`).                                   |
|  `QUERY`  | `/ri/`           |                  `200 OK`                  | Queries all configured ISE providers; aggregates and returns results.                                 |
|   `GET`   | `/languages/`    |                  `200 OK`                  | Returns a JSON array of language matches for autocomplete. Same-origin only (`Sec-Fetch-Site` guard). |
| `OPTIONS` | `/ri/`           |                  `200 OK`                  | Returns CORS headers for cross-origin ISE availability checks.                                        |

#### HATEOAS

- All HAL+JSON responses include `_links` with at minimum `self` and either `collection` or `up`.
- `GET /` and `QUERY /` responses include full pagination links: `first`, `prev`, `next`, `last` (absent when not applicable).
- `GET /{za}/{field}/` responses include links to all sibling fields plus an `up` link to the parent entry.
- An **ALPS profile** is served at `/profiles/cipr.json` and referenced via a `Link: <...>; rel="profile"` response header.

#### PUT: Insertion Validation Sequence

Incoming `PUT /{za}/` requests go through the following validation chain. Any failure short-circuits with the appropriate HTTP error:

1. **Body size limit**: 8 KB strict limit per payload (`400` / `413` on violation).
2. **Consistency check**: `za` in URL path must match `body.za` (`400` on mismatch).
3. **Self-update protection**: PUTs for the node's own `za` are silently accepted without any change to local data (`202`).
4. **Currentness Validation**: `body.timestamp` must be within the last 24 hours and not more than 5 minutes in the future (`400` on failure). This prevents stale or replayed entries and limits the window for timestamp-spoofing attacks.
5. **Field length limits**: Defense-in-depth validation against hash-complexity DoS: `za ≤ 255`, `title ≤ 64`, `description ≤ 256`, `keywords ≤ 512`, `offering ≤ 128`, `seeking ≤ 128`, `primary_lang ≤ 2` (`413` on violation).
6. **DNS TXT Verification (Triple Validation)**: The `ciprHash` computed from the PUT body must match the `_cipr.{za}` TXT record, verified against **3 randomly selected DoH resolvers** from the configured pool (`403` on failure).
7. **HTTP Reachability Verification**: A `HEAD https://ciprnode.{za}/` request must return `200 OK`, with **6 retries** at 2-second intervals (`403` on failure).
8. **Reliability Validation**: A random FTS expression is generated, run locally as a baseline QUERY, then sent as a `QUERY` to `https://ciprnode.{za}/`. The results are compared with **Jaccard set similarity ≥ 60%** (`409` on divergence). Network errors during this step are non-fatal and fail open.
9. **Insert/Update**: Entry is upserted into the ciprdup.

#### DELETE: Viral Deletion Logic

Incoming `DELETE /{za}/` requests do not unconditionally delete. Instead:

1. If the entry is not found locally, the DELETE is silently accepted (`202`).
2. If `za` equals the node's own `za`, the self-deletion is ignored (`202`).
3. The node re-validates the entry using the same DNS TXT + HTTP HEAD verification as for PUT. If the node **passes** validation, the DELETE is **rejected**: the entry is protected and retained. If the node **fails** validation, the DELETE is **accepted** locally.

This logic is what allows malicious or incorrect DELETE signals to be absorbed without causing data loss across the network.

### 3. Ciprpulse: The Heartbeat

The scheduler runs continuously in the background, managing three distinct periodic tasks:

#### Audit and Viral Propagation (`runPulseChecks`)

Fires every `expected_propagation_time` milliseconds. In each cycle:

1. Selects `N = calculateNodesPerPulse(total, expectedPropagationTime)` random entries from the ciprdup (excluding self). `N` is calculated as `⌈totalEntries^(1/steps)⌉` where `steps = propagationTime / 1000`.
2. Entry list is **deduplicated by `za`** before processing to prevent concurrent tasks from racing on the same entry.
3. Up to 5 entries are audited **concurrently** (controlled by `PULSE_CONCURRENCY_LIMIT = 5`) via the full DNS TXT + HTTP HEAD verification chain.
4. **Valid entries**: A `PUT` is sent (fire-and-forget) to `N` randomly selected peer nodes. The PUT payload always carries a freshened `timestamp: Date.now()`: without this refresh, entries would fail Currentness Validation on the receiving side after the node has been running for more than 24 hours.
5. **Invalid or unreachable entries**: The entry is deleted locally, then a `DELETE` is sent to `N` randomly selected peer nodes.

#### Reliability Validation (`runReliabilityChecks`)

Fires on the same interval as the audit task. In each cycle:

1. A random FTS expression is generated from `test_words` and any recently captured user search terms.
2. The expression is executed locally as a baseline `QUERY`.
3. Up to `N` peer nodes whose `timestamp` is older than 1 hour are selected randomly.
4. Up to 5 peers are queried **concurrently** via `QUERY https://ciprnode.{za}/`.
5. Each peer's result set is compared to the local baseline using **Jaccard set similarity ≥ 60%**. Peers failing this check are evicted locally and a `DELETE` is propagated to `N` peers.

#### Self-Validation (`runSelfValidation`)

Fires every `3 × expected_propagation_time` milliseconds:

1. Validates the local node's own configuration using the same strict schema checks applied at startup.
2. On success: broadcasts a `PUT` for the local entry to `N` random peers.
3. On failure: retries 3 times with 1-second delays. After 3 failed retries, a **critical console alert** is displayed and a `DELETE` for the node's own `za` is sent to `N` random peers (self-destruct signal).

#### Search Term Capture

User queries submitted through the ciprface are captured by `captureSearchTerms()` and stored in a bounded in-memory cache (max 1024 terms, FIFO eviction). These terms are mixed into randomly generated FTS expressions used for Reliability Validation, progressively adapting the audit queries to real-world search vocabulary.

### 4. Ciprface: The Web Interface

A server-rendered web interface served at `https://ciprnode.{za}/`. It acts as both a search engine front-end and the discoverable face of the ciprnode.

#### Internationalization

18 languages are bundled and fully translated:

| Code | Language   |
|:-----|:-----------|
| `ar` | Arabic     |
| `bm` | Bambara    |
| `bn` | Bengali    |
| `de` | German     |
| `en` | English    |
| `es` | Spanish    |
| `fa` | Farsi      |
| `fr` | French     |
| `hi` | Hindi      |
| `id` | Indonesian |
| `it` | Italian    |
| `ja` | Japanese   |
| `pt` | Portuguese |
| `ru` | Russian    |
| `sw` | Swahili    |
| `uk` | Ukrainian  |
| `ur` | Urdu       |
| `zh` | Chinese    |

Language is resolved in priority order: `cipr_lang` cookie → `Accept-Language` header → `en` fallback. A language switcher widget is rendered in the UI with a tooltip showing the full English name of the currently active language.

#### Search

- **FTS boolean operators**: `AND` (or implicit space), `OR`, `NOT`.
- **Phrase search**: `"exact phrase"` using double quotes.
- **Prefix search**: `word*` matches any word starting with `word`.
- **Initial token**: `^word` matches only if `word` is the very first token in the field.
- **Column filters**: `title:linux` or `{title description}:linux`.
- **Proximity**: `NEAR(term1 term2, distance)`.
- **Grouping**: `(term1 OR term2) AND term3`.
- All inputs are sanitized server-side before reaching SQLite.

#### Search Modes

Three modes selectable from the UI, each adjusting the BM25 weight profile:

- **Default**: balanced weighting across all fields.
- **Offering**: `offering` field is weighted at 32 (same as `za`).
- **Seeking**: `seeking` field is weighted at 32 (same as `za`).

#### Filters

All filters can be combined freely with the text query:

| Filter               | Parameter                                                 | Type                                    |
|:---------------------|:----------------------------------------------------------|:----------------------------------------|
| Offensiveness level  | `ol`                                                      | Multi-value checkbox (0–3)              |
| Primary language     | `primary_lang`                                            | Autocomplete text field (ISO 639-1)     |
| Geographic proximity | `geo[latitude]`, `geo[longitude]`, `geo[min]`, `geo[max]` | Decimal degrees + km or mi radius range |
| Timestamp before     | `timestamp[before]`                                       | Unix timestamp                          |
| Timestamp after      | `timestamp[after]`                                        | Unix timestamp                          |
| Sort order           | `sort_by`                                                 | `asc` (default), `desc`, `random`       |
| Pagination           | `pages[num]`, `pages[size]`                               | Page number and page size               |

#### Intra-Search (ISE)

When the node has ISE providers configured and a target ciprdup entry has a resindex (`HEAD /ri/` returns `200`), the ciprface displays intra-search controls that allow querying the resource's own internal search engine. Results are lazy-loaded per entry.

#### PWA

- A **service worker** (`sw.js`) caches all static assets for offline use.
- A **web app manifest** (`manifest.webmanifest`) enables installation on mobile and desktop.
- The service worker version is updated by changing the cache key in `sw.js`; a `controllerchange` listener in the client JS triggers a reload when a new version is detected (skipping reload on first install).

#### SEO Metadata

The ciprface `<head>` includes:

- Standard `<title>` and `<meta name="description">`.
- Open Graph (`og:title`, `og:description`, `og:url`, `og:locale`).
- Dublin Core (`DC.Title`, `DC.Description`, `DC.Subject`, `DC.Creator`, `DC.Publisher`, `DC.Rights`, `DC.Identifier`, `DC.Coverage`, `DC.Language`).
- `<meta name="geo.position">`, `<meta name="geo.region">`.
- `<meta name="author">`, `<link rel="author">`, `<link rel="license">`.
- `<meta name="unavailable_after">` (if configured).
- `<link rel="profile">` pointing to the ALPS profile.
- `<link rel="canonical">`.
- `robots.txt` that allows full unrestricted crawling.

### 5. Internal Search Engine (ISE) Integration

The `QUERY /ri/` endpoint delegates searches to pluggable ISE providers defined in `ciprnode.toml`.

- **Built-in adapter**: [Pagefind](https://pagefind.app/): a static site search provider. Pagefind uses its own index served from the target website; the ciprnode proxies the query and parses the response.
- **Multiple providers**: Multiple `[[ise_provider]]` blocks can be configured; results from all of them are aggregated into a single response.
- **Extensible**: New ISE adapters can be created by copying `integrations/ise/ise-template.example.js`.
- **Cross-origin ping**: `HEAD /ri/` and `OPTIONS /ri/` include full CORS headers, allowing other ciprnodes to check ISE availability from the browser.

### 6. Security

#### HTTP Security Headers

Every response carries the following headers:

| Header                      | Value                                                                                                                                                                                        |
|:----------------------------|:---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload`                                                                                                                                               |
| `X-Content-Type-Options`    | `nosniff`                                                                                                                                                                                    |
| `X-Frame-Options`           | `DENY`                                                                                                                                                                                       |
| `Content-Security-Policy`   | `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'; form-action 'self'; connect-src 'self' https: wss:;` |

The CSP is intentionally strict. No external scripts (analytics, CDN-hosted libraries, etc.) are permitted to execute.

#### Per-IP Rate Limiting

PUT and DELETE endpoints are rate-limited per originating IP before any processing occurs:

- **PUT**: 30 requests per IP per 60-second window.
- **DELETE**: 20 requests per IP per 60-second window.
- Exceeding the limit returns `429 Too Many Requests` with `Retry-After: 60`.
- When behind Cloudflare, the `CF-Connecting-IP` header is used as the rate-limit key (not the Cloudflare edge IP, which would be shared across all clients).
- The rate-limit map is garbage-collected every 5 minutes to prevent unbounded memory growth.

#### SSRF Prevention

All outbound network calls from the ciprnode (peer sync, DNS, ISE queries) are routed through `safeFetch()`, which:

1. Detects plain IP address URLs and blocks RFC 1918 / loopback ranges directly.
2. For hostname-based URLs, performs a DNS resolution before connecting and blocks any target that resolves to a private or loopback IPv4 or IPv6 address.
3. Injects a standardized `User-Agent: Ciprnode zero/1.0 (https://cipr.info)` header into every outbound request to identify the software to peer nodes and WAFs.

#### DoS Protection

- **Content-Length guard**: Requests with `Content-Length` over 512 KB are rejected immediately with `413 Payload Too Large` before the body is read.
- **Streaming body limiter**: Even if `Content-Length` is absent or spoofed, the body reader enforces a hard 8 KB cap per PUT payload by counting actual bytes read from the stream.

#### Custom Secure DNS Client (`dns.js`)

The Triple Validation function does not use the OS DNS resolver for DoH lookups. Instead:

1. It uses a Do53 resolver (from the configured pool) to resolve the DoH provider's hostname to an IP address via `Deno.resolveDns()`.
2. It opens a direct TCP connection to that IP on port 443.
3. It performs a TLS handshake using the **hostname** as the SNI parameter, which causes Deno's TLS stack to verify the certificate against the correct hostname, not the IP.
4. It sends a minimal raw HTTP/1.1 request over the TLS tunnel and parses the DNS wire-format response.

This sequence ensures that no OS-level DNS poisoning or SSRF rebinding can forge the DoH resolver's identity. A fallback to standard `fetch()` (OS DNS) is used only if the Do53 bootstrap fails.

#### FTS Injection Prevention

All FTS query strings pass through `sanitizeFtsQuery()` (see §1) before touching SQLite. Only structurally valid FTS5 expressions reach the database engine.

### 7. Automated DNS Record Management

Ciprnode can automatically create and update the `_cipr.{za} TXT` record required for validation.

- **Supported providers**: Cloudflare and deSEC.io: each implemented as a self-contained adapter module.
- **Extensible**: New providers can be created by copying `integrations/dns/dns-template.example.js`.
- **Zero-touch**: If the computed `ciprHash` changes (e.g., you updated `title` or `keywords` in `ciprnode.toml`), the node detects the divergence at startup and triggers an automatic DNS update.
- **Auto-repair retry loop**: After updating the TXT record, the node retries verification up to 3 times with 60-second delays to account for DNS propagation latency.
- **Credentials**: API tokens are read from environment variables (`CIPR_DNS_API_TOKEN`, etc.) which take precedence over values in `ciprnode.toml`.

### 8. Bootstrap Sync

When starting with an empty database, the ciprnode performs an initial population:

1. **DNS verification** of the bootstrap node hostname (3 attempts, 1-second delays).
2. **Identity fetch**: Retrieves and verifies the bootstrap node's own entry (`GET /{bootstrapZa}/`) and inserts it as the first record.
3. **Bulk fetch**: Retrieves the bootstrap node's full ciprdup (`GET /`).
4. **Viral burst**: Immediately after the bulk fetch, sends `GET /` to `N` randomly selected newly discovered peers to diversify the initial dataset beyond the single bootstrap source.

Each received entry is validated before insertion: hash consistency check, DNS TXT Triple Validation, and HTTP HEAD reachability. Invalid entries are silently skipped.

### 9. Logging System

A configurable logging system with two independent output channels:

- **Console output**: Controlled by `log_level` in `ciprnode.toml`.
  - `0`: Silent (no output).
  - `1`: Operational (startup messages, key events).
  - `2`: Verbose (all outgoing requests, incoming responses, verification steps).
  - Styled with: ANSI 24-bit TrueColor escape codes in terminal, CSS substitutions in browser DevTools.
  - Color legend: `OK` = green, `WA` = yellow, `KO` = red, `DNS` = cyan, `REQ` = magenta, `RES` = amber.
- **File output**: When `debug = true`, all output (equivalent to `log_level = 2`) is also written to timestamped log files in `/logs/`. Logs rotate at 256 MB and files older than 24 hours are deleted automatically.

### 10. Response Compression

All responses with a body are transparently gzip-compressed when the client sends `Accept-Encoding: gzip`. Compression is applied to `text/*`, `application/javascript`, `application/json`, `application/xml`, and `image/svg+xml` content types. The `Content-Length` header is removed and `Content-Encoding: gzip` is added; a `Vary: Accept-Encoding` header is included for correct CDN handling.

## Known Limitations

The following issues are known, structurally understood, and have no immediate fix. They represent open design problems in the Cipr protocol itself, not bugs in this implementation.

### No Defense Against Spam or Sybil Attacks

**This is the most serious structural vulnerability in the Cipr.**

The protocol is fully permissionless: anyone with a registered domain can join the index. Domain registration costs are low (free TLDs exist), deployment is trivially scriptable, and there is no concept of reputation, trust score, or PageRank anywhere in the protocol.

A motivated attacker can:

- Register thousands of cheap domains and deploy ciprnodes with keyword-stuffed `title`, `description`, and `keywords` fields.
- BM25 ranking treats all entries equally: keyword density determines ranking, not credibility or quality.
- Spam entries that continuously refresh their `timestamp` remain permanently "current" while legitimate nodes with intermittent connectivity may be evicted.

The spec's argument that "the abundance of nodes makes any single bad actor irrelevant" fails at scale because automated spam deployment grows faster than honest human participation. This has been the outcome for every open, permissionless index in history.

**No code change in this implementation can solve this.** It requires a protocol-level design decision: potential mitigations include per-domain trust scoring, domain age signals, proof-of-work, or moderation layers: all of which involve trade-offs with the permissionless, decentralized model.

### DNS as the Sole Authorization Mechanism

The `_cipr.{za} TXT` record is the only credential that proves a ciprnode's identity to the network. DNS is controlled by registrars, registries, and ICANN: all subject to legal pressure, terms-of-service enforcement, and political interference.

- A single court order to a registrar can silently remove a node's TXT record, causing all peers to evict it automatically within one or two pulse cycles.
- Nodes in jurisdictions that block major DoH providers (China, Iran, Russia block Cloudflare, Google, Quad9) cannot complete Triple Validation on incoming PUTs. They become isolated from the rest of the network.
- The Zone Apex (`sldl.tldl`) format requirement structurally excludes all path-based resources, shared subdomains, and most 2nd-level ccTLDs (`.co.uk`, `.edu.br`, etc.).

### No Economic or Reputational Incentive to Run a Node

Operating a ciprnode could cost money (VPS, domain registration, bandwidth) and time (setup, maintenance, security). The benefit is one entry in the Cipr and participation in maintaining the index. There is no monetary return, no reputation mechanism outside the Cipr, and no network effect until adoption is meaningful.

Is expected the network will remain confined to personal, community and niche deployments.

### Reliability Validation Fails Open

When an incoming `PUT /{za}/` triggers the Reliability Validation step and the QUERY to the sender's node fails with a network error (timeout, refused connection, firewall drop), the validation is silently bypassed and the entry is accepted. This is intentional: hard-failing on network errors would break legitimate propagation under transient conditions: but it means a bad-faith node that simply does not respond to QUERY requests can always skip this check.

## Installation

### Option A: Pre-compiled Binaries

Download the latest `ciprnode-zero-*.zip` for your platform (Windows, Linux, macOS).

1. Unzip the archive.
2. Edit `ciprnode.toml`.
3. Run the executable.

### Option B: Running from Source (Deno)

Requires [Deno](https://deno.land/) v2.7+ installed.

```bash
git clone https://github.com/your-repo/ciprnode-zero.git
cd ciprnode-zero
deno task start
```

### Development Tasks

|    Task     | Command               | Description                                   |
|:-----------:|:----------------------|:----------------------------------------------|
|    Start    | `deno task start`     | Production start                              |
| Dev (watch) | `deno task dev`       | Watch mode with auto-reload on source changes |
|  Front-end  | `deno task front-dev` | Skips sync/DNS/scheduler: for UI development  |
|    Debug    | `deno task debug`     | Watch mode with `--debug` flag                |
|    Test     | `deno task test`      | Run all tests                                 |
|    Build    | `deno task build`     | Compile to standalone binary                  |
|    Stop     | `deno task stop`      | Stops a running background instance           |

## Configuration

The node is fully configured via `ciprnode.toml`. All sections and parameters are documented below.

```toml
# Environment: dev | test | prod
env = "dev"

# Console log level: 0 (silent), 1 (operational), 2 (verbose)
log_level = 2

# Write verbose output to /logs/ files (rotated at 256 MB, deleted after 24h)
debug = false

[cipr_entry]
za = "example.com"               # Zone Apex: your domain (required)
title = "My Node"                # Resource title (max 64 chars)
description = "A description"   # Resource description (max 256 chars)
keywords = "keyword1 keyword2"  # Space-separated keywords (max 512 chars)
offering = "What you offer"     # Optional (max 128 chars)
seeking = "What you seek"       # Optional (max 128 chars)
primary_lang = "en"             # ISO 639-1 language code (optional)
ol = 0                          # Offensiveness level: 0 (none) to 3 (universally offensive)
latitude = 407128000            # WGS84 × 10,000,000, integer (use 0 to omit)
longitude = -740060000          # WGS84 × 10,000,000, integer (use 0 to omit)

# Repeat this block for each ISE provider (optional)
[[ise_provider]]
name = "pagefind"
url = "https://your-site.com/"

[meta_data]                          # Optional SEO metadata for the ciprface HTML
author = "Author Name"
author_url = "https://..."
subject = "Topic"
publisher = "Publisher"
contributor = "Contributor"          # Comma-separated if multiple
isbn = "ISBN or DOI"                 # Optional formal identifier
coverage = "Spatial/Temporal"        # Optional coverage description
rights = "CC BY 4.0"
rights_url = "https://creativecommons.org/licenses/by/4.0/"
unavailable_after = "31 Dec 2099 23:59:59 GMT"  # Optional expiry date

[ciprface]
page_size = 10                       # Results per page in the web interface

[network]
port = 443                           # Listening port (use 443 in production)
bootstrap_node = "https://ciprnode.cipr.info"  # Trusted peer for initial sync
expected_propagation_time = 120000   # Pulse interval in ms (120s default)
test_words = "dog casa network ..."  # Words used for Reliability Validation audits
do53 = ["1.1.1.1", "9.9.9.9", ...]  # DNS-over-UDP resolvers for DoH bootstrapping
doh = ["https://dns.google/dns-query", ...]  # DNS-over-HTTPS endpoints (min 3 required)

[dns_provider]
name = "cloudflare"                  # "cloudflare" or "desec"
# api_token and zone_id are read from env vars (see below)
```

### Secrets Management

Sensitive values should be set as environment variables (or in a `.env` file), which take **precedence** over `ciprnode.toml`:

|     Env Variable     | Overrides                |
|:--------------------:|:-------------------------|
| `CIPR_DNS_PROVIDER`  | `dns_provider.name`      |
| `CIPR_DNS_API_TOKEN` | `dns_provider.api_token` |
|  `CIPR_DNS_ZONE_ID`  | `dns_provider.zone_id`   |

## Architecture Overview

### Startup Sequence

1. **Config load**: Parses and validates `ciprnode.toml` with strict type and format checks.
2. **Hash generation**: Computes the `ciprHash` (SHA-256) from all configured entry fields concatenated with `¦` separators.
3. **DB init**: Opens (or creates) `data/ciprdup.db`, initializes the schema, FTS5 table, triggers, indexes, and language table if not already present.
4. **Bootstrap sync**: If the DB has 0 or 1 entries, performs initial population from the bootstrap node (DNS verify → identity fetch → bulk fetch → viral burst). Halts on fatal bootstrap failure if DB is empty.
5. **Self-validation**: Checks the local entry's hash against the current config. If the hash has changed, triggers DNS auto-update (if a provider is configured) and enters the retry loop.
6. **DNS verification**: Runs Triple Validation (3 random DoH providers via custom TLS) of the local `_cipr.{za}` TXT record. Retries 3×60s if the record is stale after a managed update.
7. **HTTP server start**: Begins serving on the configured port. Static assets, API routes, and fallback HTML are handled in priority order.
8. **Reachability check**: Sends `HEAD https://ciprnode.{za}/` to confirm the node is publicly reachable. Ciprpulse does not start if this check fails (unless in `debug` mode, where a loopback fallback is tried).
9. **Ciprpulse start**: Begins the audit/propagation loop, reliability validation loop, and self-validation loop.

### Project Structure

```txt
Ciprnode zero/
├── main.js                       # Entry point
├── ciprnode.toml                 # Configuration file
├── deno.json                     # Deno tasks and import map
├── src/
│   ├── api/
│   │   ├── server.js             # HTTP server, compression, security headers, rate limiter
│   │   ├── routes.js             # Request router
│   │   ├── controllers/          # root.js, entry.js, search.js
│   │   └── views/                # hal.js, renderer.js (Eta templates)
│   ├── bot/
│   │   └── scheduler.js          # Ciprpulse: audit, reliability, self-validation, propagation
│   ├── core/
│   │   ├── config.js             # TOML config loader and parser
│   │   ├── crypto.js             # SHA-256 hashing (Web Crypto API)
│   │   ├── dns.js                # DoH/Do53 client, TXT Triple Validation, custom TLS
│   │   ├── fts_generator.js      # Random FTS expression builder and search term cache
│   │   ├── logger.js             # File log writer with rotation
│   │   ├── sync.js               # Initial bootstrap sync
│   │   ├── utils.js              # ciprHash generation, safeFetch, readBodyWithLimit, msg/line
│   │   ├── validator.js          # Config and entry validation (za format, geo range, etc.)
│   │   └── verification.js       # verifyNode (DNS+HTTP), verifyReliability, compareSearchResults
│   ├── db/
│   │   ├── client.js             # SQLite connection setup
│   │   ├── geo.js                # Haversine is_within_radius function
│   │   ├── languages.json        # ISO 639-1 dataset (180+ entries)
│   │   ├── repo.js               # Data access: insertEntry, getEntry, deleteEntry, searchEntries
│   │   └── schema.js             # Table/FTS5/trigger/index DDL
│   ├── locales/                  # 18 language JSON translation files
│   └── templates/                # Eta HTML templates (layouts, views, partials)
├── integrations/
│   ├── dns/                      # cloudflare.js, desec.js, dns-template.example.js
│   └── ise/                      # pagefind.js, ise-template.example.js
├── public/
│   ├── css/                      # Stylesheets
│   ├── js/                       # ciprnode.js, htmx.js
│   ├── figures/                  # SVG icons
│   ├── profiles/cipr.json        # ALPS profile
│   ├── manifest.webmanifest      # PWA manifest
│   ├── robots.txt                # Full crawl allowed
│   └── sw.js                     # Service worker (offline cache)
├── scripts/                      # Build, control, and report scripts
├── tests/                        # Deno test suites (api_endpoints, config, dns)
└── data/                         # Runtime data (ciprdup.db, ciprnode.pid)
```

### Tech Stack

- **Runtime**: Deno v2.7+
- **Database**: SQLite via FFI (`@db/sqlite`)
- **Templating**: Eta (`@eta-dev/eta`)
- **Architecture**: Modular monolith (Core, API, Bot/Scheduler, DB, Integrations)

## External Dependencies

Built with minimalism in mind, using the Deno Standard Library plus two focused third-party modules.

| Dependency          |                     Purpose                     |
|:--------------------|:-----------------------------------------------:|
| **`@std/http`**     |    Core HTTP server and static file serving.    |
| **`@std/toml`**     |            Parsing `ciprnode.toml`.             |
| **`@std/path`**     |     Cross-platform file path manipulation.      |
| **`@std/fs`**       |  File system operations (copy, exists, mkdir).  |
| **`@std/dotenv`**   |   Loading environment variables from `.env`.    |
| **`@std/crypto`**   |                SHA-256 hashing.                 |
| **`@std/encoding`** |     Base64url encoding for DNS wire format.     |
| **`@std/assert`**   |          Assertion library for tests.           |
| **`@db/sqlite`**    |         Zero-dependency SQLite driver.          |
| **`@eta-dev/eta`**  | Lightweight templating engine for the ciprface. |
