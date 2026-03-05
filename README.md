# Ciprnode zero

**Ciprnode zero** is the reference implementation of a *ciprnode*, the fundamental building block of the **Cosmic Index of Public Resources (Cipr)**. It is a proof-of-concept designed to test the viability of a decentralized, distributed, and censorship-resistant web index.

This software allows any domain owner to host a copy of the Cipr and consequently be a part of it: the deployment of a ciprnode implies the inclusion of anything under the owned domain in the Cipr.

A deployed ciprnode is also a search-engine-like front-end offering a two level search: first level is in the index itself and second level is deep inside the content exposed by any cipred resource.

> **Disclaimer**: This is alpha software intended for testing in controlled environments. It is expected to be unstable.

## Key Features

### 1. Ciprdup

A local **SQLite** database (`data/ciprdup.db`) that stores the local copy of the distributed index, optimized for fast Full-Text Search (FTS) and high-volume reads.

### 2. CiprAPI implementation

The CiprAPI is a strict **Semantic RESTful Web API** supporting **HAL+JSON** for machine-to-machine interaction and **HTML** for human interaction.

### 3. Ciprpulse

The *heartbeat* that keeps all ciprnodes in sync, and for instance, keeps the Cipr up to date through three mechanisms:

- **Validation of entries**: Ensures data integrity by verifying every entry against 3 random DoH (DNS over HTTPS) resolvers using a **Custom Secure TLS Client**. It also verifies **HTTP Reachability** by sending a HEAD request to the node's URL (with **6 retries** to handle temporary network issues).
- **Viral propagation tasks**: Valid updates are propagated to other ciprnodes using an algorithm based on expected propagation times for the current number of entries.
- **Self-Healing tasks**: Nodes automatically validate their own integrity or self-destruct when their become invalid by decision or by technical failures.

### 4. **Ciprface**

- A built-in web interface served directly by the node, accessible at `https://ciprnode.your-domain.com/`, it provides a human-friendly search utility, is also kind of a ciprnode status dashboard.

### 5. **Security & Safety**

- **DoS Protection**: Enforces a strict 512KB limit on request bodies to prevent memory exhaustion.
- **Secure Custom DNS**: Bypasses OS DNS for trust-anchor bootstrapping while maintaining **Strict TLS Certificate Verification** via a custom TLS client.
- **Network Hardening**: All network operations enforced with timeouts; SSRF protection blocks interaction with private/local IPs.
- **Input Validation**: Strict type and format checks on all configuration and indexed data.

### 6. Automated DNS Management

Ciprnode can automatically limit the friction of maintaining a node by managing the required DNS TXT records (`_cipr.<your-domain>`) in certain cases.

- **Supported Providers**: Native integration with **Cloudflare** and **deSEC**.
- **Extensible Design**: The provider system is modular, allowing developers to easily implement adapters for other DNS providers.
- **Zero-Touch Maintenance**: If your configuration changes, the ciprnode updates the DNS records automatically if the necessary credentials are provided.

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
# Or manually:
deno run --allow-net --allow-read --allow-write --allow-env --allow-ffi --unstable main.js
```

## Configuration

The node is configured via `ciprnode.toml`.

```toml
[cipr_entry]
za = "example.com"           # Zone Apex (Your Domain)
title = "My Node"            # Node Title
description = "A description" # Node Description
primary_lang = "en"          # Primary Language code (ISO 639-1)

[network]
port = 8443
bootstrap_node = "https://ciprnode.cipr.info"

# DNS Resolvers (Custom Trust Anchors)
# Ciprnode uses these SPECIFIC servers to resolve DoH providers, bypassing OS DNS.
do53 = ["1.1.1.1", "8.8.8.8", ...]
doh = ["https://dns.google/dns-query", ...]

[dns_provider]
name = "cloudflare" # or "desec"
# api_token = "..." # Use CIPR_DNS_API_TOKEN env var instead!
```

### Secrets Management

To avoid committing sensitive credentials (API tokens) to version control, Ciprnode zero supports environment variables. These variables take **precedence** over the values in `ciprnode.toml`.

You can also use a `.env` file in the root directory, which will be automatically loaded on startup.

| Env Variable         | Overrides                |
|:---------------------|:-------------------------|
| `CIPR_DNS_PROVIDER`  | `dns_provider.name`      |
| `CIPR_DNS_API_TOKEN` | `dns_provider.api_token` |
| `CIPR_DNS_ZONE_ID`   | `dns_provider.zone_id`   |

It is **highly recommended** to use environment variables for `api_token` rather than writing it in the configuration file.

## Running the Node

### Manual Start

- **Windows**: Double-click `start.bat`.
- **Linux/Mac**: Run `./start.sh`.

### As a Background Service

A helper script `service.js` is provided to install Ciprnode as a system service (Windows Service, Systemd, LaunchAgent).

**Windows (Admin PowerShell):**

```powershell
deno run -A service.js install
deno run -A service.js start
```

**Linux:**

```bash
sudo deno run -A service.js install
sudo systemctl enable --now ciprnode
```

## Architecture Overview

### Startup Sequence

1. **Config Load**: Validates `ciprnode.toml`.
2. **Hash Generation**: Creates the `ciprHash` from your local config.
3. **DB Init**: Connects to `ciprdup.db` (SQLite).
4. **Sync**: Bootstraps from a trusted peer.
5. **Self-Validation**:
   - Checks if your local `ciprHash` matches the DNS TXT record `_cipr.your-domain.com`.
   - Uses **Triple Validation** (3 random DoH providers verified via Custom TLS).
   - If validation fails, the node will refuse to fully join the network (or attempt auto-repair if configured).
6. **API Start**: Starts the HTTP server.
7. **Scheduler Start**: Begins the CiprPulse loop (Audit -> Propagate -> Valid/Invalid).

### Tech Stack

- **Runtime**: Deno
- **Database**: SQLite (via FFI)
- **Architecture**: Modular Monolith (Core, API, Bot/Scheduler, DB)

## External Dependencies

Built with minimalism in mind, relying mostly on the Deno Standard Library.

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

---

Here is a comprehensive list of software that brings search capabilities to websites and applications. Because your examples range from lightweight browser-based tools (Lunr, Pagefind) to massive enterprise servers (Solr, Elasticsearch), I have categorized them by architecture and use case to help you navigate the options.

### 1. Client-Side & Static Site Search (Like Pagefind & Lunr)

These tools run directly in the user's browser or at the edge. They are perfect for static websites (like blogs or documentation) because they don't require you to host a separate database or backend server.

- **Fuse.js:** A powerful, lightweight fuzzy-search library with zero dependencies. It searches through JSON objects entirely in the browser and is great for small-to-medium datasets.
- **FlexSearch:** Billed as the web's fastest full-text search library. It utilizes an advanced scoring mechanism and is highly optimized for memory and speed in the browser.
- **Orama (formerly Lyra):** A fast, in-memory, typo-tolerant search engine written in TypeScript. It is optimized to run anywhere JavaScript runs, including the browser and edge networks (like Cloudflare Workers).
- **Stork:** Very similar to Pagefind. It indexes content at build time and provides a WebAssembly (WASM) binary and a JavaScript wrapper to deliver fast, highly customized search to static sites.
- **MiniSearch:** A tiny but powerful in-memory full-text search engine for JavaScript. It supports prefix search, fuzzy match, and boosting, making it a great alternative to Lunr.

### 2. Modern, Lightweight Server-Side Search

These are standalone search servers that you host yourself. They bridge the gap between simple client-side tools and complex enterprise engines like Elasticsearch. They are built to be developer-friendly, incredibly fast, and work beautifully out of the box without needing a PhD in search configurations.

- **Meilisearch:** Written in Rust, it provides instant, typo-tolerant "search-as-you-type" experiences. It is incredibly easy to set up, has great defaults, and is highly popular for modern web apps.
- **Typesense:** Written in C++, this is an open-source, typo-tolerant search engine optimized for instant sub-50ms searches. It was explicitly built to be a self-hosted, open-source alternative to Algolia.
- **Manticore Search:** A high-performance, open-source C++ search engine (a fork of Sphinx). It is known for its speed and allows you to query your index using standard SQL, which makes integration very easy for backend developers.

### 3. Enterprise & Heavyweight Search (Like Elasticsearch & Solr)

These are robust, distributed search engines designed for massive scale, complex querying, and massive log analytics.

- **OpenSearch:** A community-driven, open-source fork of Elasticsearch and Kibana, created and maintained by AWS after Elastic changed its licensing model. If you are looking at Elasticsearch today, you should also be looking at OpenSearch.
- **Apache Lucene:** While not a standalone server you can just "plug in" to a website, it is the underlying Java library that actually powers both Elasticsearch and Solr.
- **Vespa:** An open-source big data processing and serving engine developed by Yahoo. It is heavily focused on AI, vector search, and running complex machine learning models over large datasets at serving time.

### 4. Search-as-a-Service (Hosted)

If you don't want to manage indexes at compile time or host a search server yourself, these platforms provide search via an API.

- **Algolia:** The industry standard for hosted search. It is incredibly fast, offers fantastic UI widgets for the frontend, and provides advanced analytics and AI-driven relevance tuning.
- **Elastic Site Search (formerly Swiftype):** A managed service by the creators of Elasticsearch. It acts like a web crawler that automatically indexes your website and gives you a dashboard to manage search weights and synonyms without touching code.

---

Would you like me to help you narrow down this list based on your specific tech stack, dataset size, and hosting preferences?
