# Ciprnode zero

**Ciprnode zero** is the reference implementation of a *ciprnode*, the fundamental building block of the **Cosmic Index of Public Resources (Cipr)**. It is a proof-of-concept designed to test the viability of a decentralized, distributed, and censorship-resistant web index.

This software allows any domain owner to host a copy of the Cipr and consequently be a part of it: the deployment of a ciprnode implies the inclusion of anything under the owned domain in the Cipr.

A deployed ciprnode is also a search-engine-like front-end offering a two level search: first level is in the index itself and second level is deep inside the content exposed by any cipred resource.

> **Disclaimer**: This is alpha software intended for testing in controlled environments. It is expected to be unstable.

## Key Features

### 1. Ciprdup

A local **SQLite** database (`data/ciprdup.db`) that stores the local copy of the distributed index, optimized for Full-Text Search via **FTS5** (with **BM25 ranking**) and high-volume reads. Includes:

- **External-content FTS5 virtual table** with automatic sync triggers (insert, update, delete).
- **Configurable BM25 weights** for three search modes: default, offering-prioritized, and seeking-prioritized.
- **Languages reference table** seeded from a built-in JSON dataset (180+ ISO 639-1 entries).
- **Custom SQLite function** `is_within_radius` for geographic distance filtering using the Haversine formula.

### 2. CiprAPI

A strict **Semantic RESTful Web API** implementing full **HATEOAS** via **HAL+JSON**. It supports content negotiation across `application/hal+json`, `text/plain`, `text/html` and `application/xhtml+xml`.

**Endpoints:**

| Method   | Path                  | Description                                                    |
|:---------|:----------------------|:---------------------------------------------------------------|
| `GET`    | `/`                   | Retrieves entries from the ciprdup (paginated).                |
| `GET`    | `/{za}/`              | Retrieves all fields for a specific cipred resource.           |
| `GET`    | `/{za}/{field}/`      | Retrieves a single field (supports `text/plain`, `hal+json`).  |
| `GET`    | `/languages/`         | Language autocomplete (same-origin only via `Sec-Fetch-Site`). |
| `PUT`    | `/{za}/`              | Adds or updates a cipred resource (JSON body, validated).      |
| `DELETE` | `/{za}/`              | Requests deletion of a cipred resource (validated).            |
| `QUERY`  | `/`                   | Full-text search with filters and pagination.                  |
| `QUERY`  | `/ri/`                | Queries the node's Internal Search Engine (resindex).          |
| `HEAD`   | `/`                   | Verifies the ciprnode's presence (returns `X-Cipr-Count`).     |
| `HEAD`   | `/ri/`                | Checks if a resindex is available (`200` or `501`).            |

**HATEOAS features:**

- All HAL+JSON responses include `_links` with `self`, `collection`/`up`, and sibling navigation.
- `QUERY /` responses include full pagination links: `first`, `prev`, `next`, `last`.
- Single-field responses (`GET /{za}/{field}/`) include links to all sibling fields.
- An **ALPS profile** is served at `/profiles/cipr.json` and linked via the `Link` header.

### 3. Ciprpulse

The *heartbeat* that keeps all ciprnodes in sync, and by extension, keeps the Cipr up to date through three mechanisms:

- **Validation of entries**: Ensures data integrity by verifying every entry against 3 random DoH (DNS over HTTPS) resolvers using a **Custom Secure TLS Client**. It also verifies **HTTP Reachability** by sending a HEAD request to the node's URL (with **6 retries** to handle temporary network issues).
- **Viral propagation tasks**: Valid updates are propagated to other ciprnodes using an algorithm based on expected propagation times for the current number of entries.
- **Self-Healing tasks**: Nodes automatically validate their own integrity or self-destruct when they become invalid by decision or by technical failures.
- **Search term capture**: User search queries from the ciprface are captured and reused for Reliability Validation during the audit cycle.

### 4. Ciprface

A built-in web interface served directly by the node, accessible at `https://ciprnode.your-domain.com/`. Features:

- **Internationalized UI**: 18 languages supported (ar, bm, bn, de, en, es, fa, fr, hi, id, it, ja, pt, ru, sw, uk, ur, zh). Language is auto-detected from `Accept-Language` header or the `cipr_lang` cookie, with a language switcher widget.
- **HTMX-powered search**: Progressive enhancement via HTMX for seamless partial page updates.
- **Search modes**: Default, Offering and Seeking modes with dynamically adjusted BM25 weights.
- **Advanced filters**: Offensiveness level, primary language (with autocomplete), geolocation (lat/lon + radius in km/mi), and date range (before/after).
- **FTS5 query syntax support**: Boolean operators (`AND`, `OR`, `NOT`), phrase search (`"..."`), prefix search (`word*`), initial token (`^word`), column filters (`title:term`), `NEAR()` proximity, and grouping with parentheses. Input is sanitized before reaching SQLite.
- **Pagination**: Supports page navigation via `pages[num]` and `pages[size]` parameters.
- **Resindex (ISE) search**: If configured, the ciprface can also query the node's Internal Search Engine providers for deep content search within the cipred resource itself.
- **PWA support**: Service worker (`sw.js`) and web manifest for installability.
- **SEO metadata**: Comprehensive `<meta>` tags including Dublin Core, Open Graph, geo, and author metadata, driven by the `[meta_data]` config section.

### 5. Internal Search Engine (ISE) Integration

The `QUERY /ri/` endpoint delegates searches to pluggable ISE providers defined in `ciprnode.toml`:

- **Built-in adapter**: [Pagefind](https://pagefind.app/) — a static site search provider.
- **Extensible**: Create new adapters by copying `integrations/ise/ise-template.example.js`.
- **Multiple providers**: Configure several `[[ise_provider]]` blocks; results are aggregated.

### 6. Security & Safety

- **DoS Protection**: Enforces a strict 512KB limit on request bodies to prevent memory exhaustion.
- **Secure Custom DNS**: Bypasses OS DNS for trust-anchor bootstrapping while maintaining **Strict TLS Certificate Verification** via a custom TLS client.
- **Network Hardening**: All network operations enforced with timeouts; SSRF protection blocks interaction with private/local IPs.
- **Input Validation**: Strict type and format checks on all configuration and indexed data, including FTS query sanitization (balanced quotes, parentheses, wildcards; stripped malformed `NEAR()`, column filters, and leading/trailing operators).
- **Same-origin protection**: The `/languages/` endpoint is restricted via `Sec-Fetch-Site` to prevent cross-origin scraping.

### 7. Automated DNS Management

Ciprnode can automatically manage the required DNS TXT records (`_cipr.<your-domain>`) to reduce operational friction.

- **Supported Providers**: Native integration with **Cloudflare** and **deSEC**.
- **Extensible Design**: The provider system is modular; create new adapters by copying `integrations/dns/dns-template.example.js`.
- **Zero-Touch Maintenance**: When configuration changes, the ciprnode updates the DNS records automatically if credentials are provided.
- **Auto-Repair**: If TXT record verification fails at startup, the node attempts automated repair with a propagation retry loop (3 attempts, 60s each).

### 8. Logging System

A configurable logging system with two output channels:

- **Console output**: Controlled by `log_level` in `ciprnode.toml` (0 = silent, 1 = operational, 2 = verbose). Styled with ANSI escape codes (terminal) or CSS (browser console).
- **File output**: When `debug = true`, all verbose-level output is written to timestamped log files in `/logs/`, with automatic rotation by size (256 MB) and age (24 hours).

## Installation

### Option A: Pre-compiled Binaries

Download the latest `ciprnode-zero-*.zip` for your platform (Windows, Linux, macOS).

1. Unzip the archive.
2. Edit `ciprnode.toml`.
3. Run the executable.

### Option B: Running from Source (Deno)

Requires [Deno](https://deno.land/) installed.

```bash
git clone https://github.com/your-repo/ciprnode-zero.git
cd ciprnode-zero
deno task start
```

### Development Tasks

| Task           | Command               | Description                                   |
|:---------------|:----------------------|:----------------------------------------------|
| Start          | `deno task start`     | Production start                              |
| Dev (watch)    | `deno task dev`       | Watch mode with auto-reload on source changes |
| Front-end only | `deno task front-dev` | Skips sync/DNS/scheduler — for UI development |
| Debug          | `deno task debug`     | Watch mode with `--debug` flag                |
| Test           | `deno task test`      | Run all tests                                 |
| Build          | `deno task build`     | Compile to standalone binary                  |
| Stop           | `deno task stop`      | Stops a running background instance           |

## Configuration

The node is configured via `ciprnode.toml`. Below is a reference of all sections:

```toml
# Environment: dev | test | prod
env = "dev"

# Log level: 0 (silent), 1 (operational), 2 (verbose)
log_level = 2

# Write verbose output to log files in /logs/
debug = false

[cipr_entry]
za = "example.com"               # Zone Apex (your domain)
title = "My Node"                # Resource title (max 64 chars)
description = "A description"    # Resource description (max 256 chars)
keywords = "keyword1 keyword2"   # Space-separated (max 512 chars)
offering = "What you offer"      # Optional (max 128 chars)
seeking = "What you seek"        # Optional (max 128 chars)
primary_lang = "en"              # ISO 639-1 code (optional)
ol = 0                           # Offensiveness level: 0-3
latitude = 407128000             # WGS84 * 10,000,000 (optional)
longitude = -740060000           # WGS84 * 10,000,000 (optional)

[[ise_provider]]                 # Internal Search Engine (repeatable)
name = "pagefind"
url = "https://your-site.com/"

[meta_data]                      # Optional SEO metadata for ciprface
author = "Author Name"
author_url = "https://..."
subject = "Topic"
publisher = "Publisher"
contributor = "Contributor"      # Comma-separated if multiple
isbn = "ISBN or DOI"             # Optional formal identifier
coverage = "Spatial/Temporal"    # Optional coverage description
rights = "CC BY 4.0"
rights_url = "https://creativecommons.org/licenses/by/4.0/"
unavailable_after = "31 Dec 2099 23:59:59 GMT" # Optional expiry date

[ciprface]
page_size = 10                   # Results per page

[network]
port = 443                       # Listening port (443 in production)
bootstrap_node = "https://ciprnode.cipr.info"
leech_from = "cipr.info"         # Leech mode target (NOT IMPLEMENTED YET)
expected_propagation_time = 120000  # ms
test_words = "dog casa network"  # Words for reliability validation
do53 = ["1.1.1.1", "8.8.8.8"]   # DNS over UDP resolvers
doh = ["https://dns.google/dns-query"]  # DNS over HTTPS endpoints

[dns_provider]
name = "cloudflare"              # "cloudflare" or "desec"
# api_token = "..."              # Use CIPR_DNS_API_TOKEN env var instead
# zone_id = "..."                # Use CIPR_DNS_ZONE_ID env var instead (used by desec)
```

### Secrets Management

Sensitive credentials should be set via environment variables (or a `.env` file in the root), which take **precedence** over `ciprnode.toml`:

| Env Variable         | Overrides                |
|:---------------------|:-------------------------|
| `CIPR_DNS_PROVIDER`  | `dns_provider.name`      |
| `CIPR_DNS_API_TOKEN` | `dns_provider.api_token` |
| `CIPR_DNS_ZONE_ID`   | `dns_provider.zone_id`   |

## Architecture Overview

### Startup Sequence

1. **Config Load**: Validates `ciprnode.toml` with strict type/format checks.
2. **Hash Generation**: Creates the `ciprHash` from the configured entry fields.
3. **DB Init**: Connects to `ciprdup.db` (SQLite via FFI), initializes schema and FTS5.
4. **Sync**: Bootstraps the ciprdup from a trusted peer node.
5. **Self-Validation**: Verifies local entry matches config, triggers DNS update if changed. Uses **Triple Validation** (3 random DoH providers verified via Custom TLS).
6. **DNS Verification**: Checks TXT record matches. Auto-repairs if a DNS provider is configured (retry loop: 3 × 60s).
7. **API Start**: Starts the HTTP server with static file serving and API routing.
8. **Scheduler Start**: Begins the Ciprpulse loop (Audit → Propagate → Validate/Invalidate).

### Project Structure

```txt
Ciprnode zero/
├── main.js                       # Entry point
├── ciprnode.toml                  # Configuration file
├── deno.json                      # Deno tasks and imports
├── src/
│   ├── api/
│   │   ├── server.js              # HTTP server and static files
│   │   ├── routes.js              # Request router
│   │   ├── controllers/           # root.js, entry.js, search.js
│   │   └── views/                 # hal.js, renderer.js (Eta templates)
│   ├── bot/
│   │   └── scheduler.js           # Ciprpulse audit/propagation loop
│   ├── core/
│   │   ├── config.js              # TOML config loader and validator
│   │   ├── crypto.js              # SHA-256 hashing
│   │   ├── dns.js                 # DoH/Do53 resolution and TXT verification
│   │   ├── fts_generator.js       # FTS expression builder and search term capture
│   │   ├── logger.js              # Styled console and file logging
│   │   ├── sync.js                # Bootstrap sync from peer nodes
│   │   ├── utils.js               # ciprHash generation, messaging helpers
│   │   ├── validator.js           # Input validation (za, title, ol, geo, etc.)
│   │   └── verification.js        # Node verification (DNS + HTTP HEAD)
│   ├── db/
│   │   ├── client.js              # SQLite connection
│   │   ├── geo.js                 # Haversine distance function
│   │   ├── languages.json         # ISO 639-1 language dataset
│   │   ├── repo.js                # Data access layer (CRUD, FTS search)
│   │   └── schema.js              # Table, FTS5, trigger, and index creation
│   ├── locales/                   # 18 language JSON files (ar..zh)
│   └── templates/                 # Eta HTML templates (layouts, views, partials)
├── integrations/
│   ├── dns/                       # DNS providers (cloudflare, desec, template)
│   └── ise/                       # ISE providers (pagefind, template)
├── public/
│   ├── css/                       # Stylesheets
│   ├── js/                        # Client-side JS (htmx, ciprnode.js)
│   ├── profiles/cipr.json         # ALPS profile
│   ├── sw.js                      # Service worker (PWA)
│   └── manifest.webmanifest       # PWA manifest
├── scripts/                       # Build, CLI control, report generation
├── tests/                         # Deno test suites
└── data/                          # Runtime data (ciprdup.db, PID file)
```

### Tech Stack

- **Runtime**: Deno
- **Database**: SQLite (via FFI, `@db/sqlite`)
- **Templating**: Eta (`@eta-dev/eta`)
- **Architecture**: Modular Monolith (Core, API, Bot/Scheduler, DB)

## External Dependencies

Built with minimalism in mind, relying on the Deno Standard Library plus two focused third-party modules.

| Dependency          | Purpose                                               |
|:--------------------|:------------------------------------------------------|
| **`@std/http`**     | Core HTTP server and request handling.                |
| **`@std/toml`**     | Parsing `ciprnode.toml` configuration files.          |
| **`@std/path`**     | Cross-platform file path manipulation.                |
| **`@std/fs`**       | File system operations (copy, exists, mkdir).         |
| **`@std/dotenv`**   | Loading environment variables from `.env`.            |
| **`@std/crypto`**   | Cryptographic utilities (SHA-256).                    |
| **`@std/encoding`** | Hex and Base64 encoding/decoding.                     |
| **`@std/assert`**   | Assertion library for tests.                          |
| **`@db/sqlite`**    | Zero-dependency SQLite driver for the local database. |
| **`@eta-dev/eta`**  | Lightweight templating engine for the ciprface.       |

---

## Cipr for users

Those who are already familiar with search engine service providers^[Say, Google Search.] probably know how they work:

― They crawl the web with software-made bots that follow links to discover content.

― They index, parse and organize the content of every website the bot visits to create their searchable map of the Internet.

― When a search is performed, the query is pre-processed by some sort of algorithm to handle spell-checking, identify synonyms, and understand the intent behind the query.

― Once the query is processed and submitted to the index, the resulting matching set is *weighted* using another sort of algorithm that determine quality, relevance, credibility and authority.

― The final matching set is generated after applying a last sort of algorithm to personalize based in the user context^[Location, language settings, device in use, search history, known preferences, previous interactions, and other collected data.].

― Search engine service providers in the advertising business join their clients' related links together with the final matching set.

― Search engine service providers in the AI business include relevant AI-generated content on top of the final matching set.

### The Cipr comes different, because:

― It has no provider, no person or organization runs it, its *searchable map of the Internet* is collectively made.

― It does not crawls the web, only indexes what people willingly publish^[Although this could be a major drawback while adoption is low, focused or specialized communities can take full advantage of the Cipr from the start.].

― It knows nothing about its users, so query optimization and filtering by location, language, and time, can only be made purposely by them.

― The result set when searching the Cipr is *weighted* using a single and dead simple algorithm that only cares about text matching and user applied filtering. No one's valuation, assessment, opinion, views, judgement, beliefs, interpretation, appraisal, values, interests or criteria is considered, nobody but the user decides what is of quality, relevant, credible, or authoritative.

― When querying the Cipr, the user have alternatives when it comes to advertisement and AI generated content, and it's very easy to avoid all of that.

## Cipr for resource owners, website publishers, content creators

When it comes to have a resource indexed by a regular search engine, there are two options:

― Wait days, weeks, months, years or an eternity for the bots to discover it by themselves.

― Submit a request accomplishing the search engine service provider requisites, and wait for weeks or months for their acceptance or rejection.

### The Cipr comes different:

― Get indexed in is just about configuring and deploying a simple node―a ciprnode―on the Internet. *Configuring* in this context means: naming and describing the resource, defining the keywords to make it discoverable, and adding some optional entries^[Location, language, offensiveness level, offering, etc.] to ease filtering.

― Once the aforementioned node is up and running, it takes only a few minutes for the resource to be already indexed and discoverable, no one's approval is needed.

― Once indexed, a resource becomes as important as any other one in the Cipr and the game of having it found is played only between the publishers and their potential audience^[Instead of SEO, lets call this game CDO: Cipr Discoverability Optimization.].

― Updating an entry in the Cipr is also easy and a matter of minutes. Same thing for opting out, the de-indexing process is as quick as stopping the deployed node and wait a few minutes for it to disappear from the index.

## Cipr for developers or service providers

The Cipr opens the door to creating a unique environment of applications and services around it. Some of them could be:

- Full ciprnode implementations
- Ciprface alternative UIs
- DNS providers integrations
- ISE (Internal Search Engine) adapters
- Resource discoverability optimizers
- LLM based resource discoverability optimizers
- Configuration file generators and optimizers
- LLM based configuration file generators and optimizers
- Automation tolls
- LLM based automation tolls
- Analysis tools
- LLM based analysis tools
- Query optimization tools
- LLM based query optimization tools
- Query pre-processing tools
- LLM based query pre-processing tools
- Ciprnode multi-tenancy applications and platforms

---
