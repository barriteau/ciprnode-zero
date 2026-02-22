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
