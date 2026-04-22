# 🕷️ RCN WebCrawler

<p align="center">
  <img src="./assets/logo.png" width="320">
</p>

<p align="center">
  Dark Web Crawler • Onion Support • Multi-Domain • Indefinite Crawling
</p>

[![Node](https://img.shields.io/badge/node-%3E=18-green)](https://nodejs.org/)
[![Status](https://img.shields.io/badge/status-active-success)]()
[![Tor](https://img.shields.io/badge/tor-supported-purple)](https://www.torproject.org/)

---

## ⚡ Quick Start

```bash
git clone https://github.com/0Day-legalize/rcn-crawler.git
cd rcn-crawler
npm install
npm start
```

Output → `data/results.json` · `data/visited.json` · `data/unique-links.json`

---

## 🚀 Features

* 🌐 Crawl standard websites and `.onion` hidden services
* 🗺️ Interactive connection map — auto-generated force-directed domain graph on exit
* 🧅 All traffic routed through Tor — clearnet and onion alike
* 🔁 Indefinite crawling — runs until no new links are found
* 🔀 Multi-domain crawling — follows cross-domain links automatically
* ♻️ Full resume support — `Ctrl+C` saves visited URLs and the pending queue; next run continues exactly where it left off
* 🤖 Two-layer fetching — axios first, Puppeteer fallback for JS-rendered pages
* 🕵️ Anti-fingerprinting — UA rotation with matching Client Hints, Sec-Fetch-\* headers, header-order shuffling, jittered delays
* 🔄 Tor circuit rotation — fresh circuit every 10 requests per domain via SOCKS5 credential isolation
* ⚡ Concurrent crawling — configurable parallel domains and requests
* 📊 Adaptive rate limiting — per-domain delay auto-adjusts (500 ms – 10 s) based on response times
* 🔍 Search-term filtering — tag or restrict crawl to pages matching keywords
* 🌲 Depth limiting — stop following links beyond N hops from seed
* 🚫 Domain allowlist / blocklist — whitelist or blacklist domains at enqueue time
* 🔔 Finish notifications — POST a summary to Discord, Slack, Telegram, or any webhook on exit
* 🤖 robots.txt support with 30-minute cache expiry
* 🛡️ SSRF protection — blocks private/internal IP ranges and IPv4-mapped IPv6 across all redirect hops
* 💣 Gzip bomb protection — dual compressed + decompressed size caps
* 🔒 Scheme filtering — only `http:` and `https:` hrefs accepted
* 💾 Structured JSON logging — rotating daily log files in `logs/`

---

## 🧠 Architecture

```text
main.js
  └── processQueue.js (dispatcher + SIGINT handler + adaptive rate + search terms)
        ├── crawlDomain (worker per domain)
        │     ├── smartFetch
        │     │     ├── fetchUrl (axios + retries) → Tor SOCKS5 → Internet / Onion
        │     │     └── fetchWithPuppeteer (fallback, JS-rendered, isolated context)
        │     ├── parseLinks → enqueueLinks (depth, allowlist, blocklist, onion-only)
        │     └── getRobots → isAllowed
        ├── generateGraph (auto on exit → data/graph.html)
        ├── notify (webhook POST on exit)
        └── shared state (queue, visited, results, counters)
```

* Every domain gets its own Tor circuit via unique SOCKS5 credentials (`IsolateSOCKSAuth`)
* Circuits rotate every 10 requests to limit long-lived circuit correlation
* Dispatcher watches the shared queue and spawns workers for new domains as they appear
* `visited.json` and `queue.json` are written together every 10 pages
* Each Puppeteer fetch runs in an isolated browser context — no shared cookies or storage between sites

---

## ⚙️ Requirements

* Node.js >= 18
* Tor (required for `.onion` crawling and routing all traffic)

```bash
node -v
npm -v
```

---

## 📦 Installation

```bash
git clone https://github.com/0Day-legalize/rcn-crawler.git
cd rcn-crawler
npm install
```

---

## 📄 Input (urls.txt)

Add seed URLs, one per line:

```text
https://example.com
http://exampleonionaddress.onion/
```

Rules:
* One URL per line
* Must include `http://` or `https://`
* Blank lines are ignored

---

## 🧅 Tor Setup

### Linux

```bash
sudo apt update && sudo apt install tor
sudo systemctl start tor
sudo systemctl enable tor
```

### Windows

Download Tor from `https://www.torproject.org/`, extract to `C:\tor`, then create `C:\tor\torrc`:

```text
SocksPort 127.0.0.1:9050
DataDirectory C:\tor\data
```

Start Tor:

```bash
cd C:\tor
.\tor.exe -f .\torrc
```

Wait for `Bootstrapped 100% (done)`.

### Verify

Linux: `ss -tulnp | grep 9050`  
Windows: `Test-NetConnection 127.0.0.1 -Port 9050`

---

## ⚙️ Configuration

All settings are CLI flags. Defaults are defined in `src/config.js`.

| Flag | Default | Description |
|---|---|---|
| `--max-pages=N` | `0` (unlimited) | Stop after N pages |
| `--max-depth=N` | `0` (unlimited) | Stop following links beyond N hops from seed |
| `--delay=MS` | `1000` | Base delay between requests per domain (ms) |
| `--timeout=MS` | `20000` | Request timeout — 20 s default suits onion circuit build times |
| `--onion-only=true\|false` | `false` | Drop all non-`.onion` URLs at enqueue time |
| `--adaptive-rate=true\|false` | `true` | Auto-adjust delay per domain based on response times (500 ms – 10 s) |
| `--max-concurrent-domains=N` | `3` | Domains crawled in parallel |
| `--max-concurrent-requests=N` | `2` | Requests in parallel per domain |
| `--debug=true\|false` | `true` | Print extracted links to console |
| `--search-terms=a,b,c` | `""` | Tag pages containing these keywords; results include `matchedTerms` |
| `--search-terms-only=true\|false` | `false` | Only follow outbound links from pages that match search terms |
| `--allow-domains=a.com,b.onion` | `""` | Whitelist — drop all links not on these domains (subdomains included) |
| `--block-domains=a.com,b.onion` | `""` | Blacklist — drop links to these domains (subdomains included) |
| `--notify-url=URL` | `""` | POST a JSON summary to this URL when the crawl ends |
| `--ignore-robots=true\|false` | `false` | Ignore robots.txt rules entirely |

```bash
node src/main.js --help
```

### Examples

```bash
# Run indefinitely (default)
node src/main.js

# Onion-only crawl — ignore all clearnet links
node src/main.js --onion-only=true

# Stop after 500 pages, max 3 hops from seed
node src/main.js --max-pages=500 --max-depth=3

# Targeted keyword crawl — only follow links from matching pages
node src/main.js --search-terms=bitcoin,wallet --search-terms-only=true

# Stay within specific domains
node src/main.js --allow-domains=example.onion,other.onion

# Block known junk domains
node src/main.js --block-domains=spam.onion,ads.com

# Faster crawl, less logging
node src/main.js --max-concurrent-domains=5 --max-concurrent-requests=3 --debug=false

# Conservative Tor-friendly settings
node src/main.js --max-concurrent-domains=2 --max-concurrent-requests=1 --delay=2000

# Notify a Discord webhook when done
node src/main.js --notify-url=https://discord.com/api/webhooks/your/webhook
```

> **Tor note:** Total simultaneous connections = `max-concurrent-domains × max-concurrent-requests`.  
> At `3 × 2 = 6` the default is safe. Going above `15` may cause Tor timeouts.

### Finish notifications

The `--notify-url` flag sends a POST request with a crawl summary when the crawl ends (clean exit or Ctrl+C). The target format is auto-detected by URL:

| Target | URL pattern | Format sent |
|---|---|---|
| Discord | `discord.com/api/webhooks/…` | Rich embed with fields |
| Slack | `hooks.slack.com/…` | `{ text: "…" }` |
| Telegram | `api.telegram.org/bot…?chat_id=…` | `{ chat_id, text }` |
| Custom | anything else | Raw JSON summary |

---

## ♻️ Resuming a Crawl

Every 10 pages the crawler writes both `data/visited.json` (crawled URLs) and `data/queue.json` (pending URLs). Pressing `Ctrl+C` finishes active requests then flushes both files before exiting.

```bash
# Stop anytime
Ctrl+C
# → "Interrupted — state saved. Resume with the same command to continue."

# Resume — visited.json + queue.json are loaded automatically
npm start
```

To start completely fresh, delete `data/visited.json` and `data/queue.json`.

---

## 🤖 Two-Layer Fetching

Each URL is first attempted with **axios** (fast, low overhead):

1. Up to 3 retries with exponential backoff (2 s → 8 s → 30 s) for transient errors
2. If axios errors or returns a near-empty / JS-only body, **Puppeteer** takes over

Puppeteer launches a headless Chromium browser:
* Routed through the same Tor SOCKS5 proxy
* Hardened with `puppeteer-extra-plugin-stealth` (removes `navigator.webdriver`, runtime leaks, etc.)
* Each fetch runs in an isolated browser context — no cookies or storage shared between sites
* Uses a matching Chrome UA and Client Hint headers
* Waits for `DOMContentLoaded` + 2 s for JS execution before capturing HTML

---

## 🗺️ Connection Map

The graph is generated automatically every time the crawler exits (Ctrl+C or natural completion). To regenerate manually:

```bash
npm run graph
# then open:
xdg-open data/graph.html      # Linux
start data/graph.html          # Windows
```

The graph is written to `data/graph.html` as a self-contained file — open it in any browser.

### What each element means

| Element | Meaning |
|---|---|
| **Purple node** | `.onion` hidden service |
| **Blue node** | Clearnet domain |
| **Node size** | Pages crawled on that domain — bigger = more pages visited |
| **Node label** | Domain name + page title below it |
| **Green edge** | Cross-domain link (one domain links to another) |

### Interactions

| Action | Result |
|---|---|
| Scroll | Zoom in / out |
| Drag background | Pan the canvas |
| Click a node | Highlights connections; opens detail panel with stats and downloads |
| Bright green edges | Outgoing links from the selected domain |
| Amber edges | Incoming links into the selected domain |
| Drag a node | Pins it in place |
| Search bar | Jumps to and selects a domain by name |
| Click background or ✕ | Clears selection |

### Detail panel

Clicking a node opens a panel showing pages crawled, successful fetches, in/out link counts, and the number of downloadable files found. If downloads exist, a toggle expands a scrollable list of every download URL as a clickable link.

> **Note:** The graph requires an internet connection to load D3.js from CDN (`d3js.org`). If you are in an air-gapped environment, download D3 v7 and replace the `<script src>` URL with a local path.

---

## 🔀 Multi-Domain Crawling

When a page links to a different domain, the crawler automatically:

1. Adds the new domain's URL to the shared queue
2. Spawns a dedicated worker for that domain
3. Allocates it a fresh Tor circuit

So starting with one seed can snowball into crawling dozens of linked domains. Use `--allow-domains` or `--max-depth` to keep the scope focused.

---

## 🔒 Security Features

| Protection | Details |
|---|---|
| Tor-only traffic | All requests (clearnet and onion) are forced through Tor — no direct connections |
| Circuit isolation | Each domain uses unique SOCKS5 credentials, allocating a dedicated Tor circuit |
| Circuit rotation | Circuits rotate every 10 requests per domain to limit correlation risk |
| SSRF | Blocks private IPs (`127.x`, `10.x`, `172.16–31.x`, `192.168.x`, `169.254.x`) and IPv4-mapped IPv6 (`::ffff:…`); checked on every redirect hop |
| Gzip bomb | 2 MB cap on compressed stream + 5 MB cap on decompressed output |
| Scheme filtering | Only `http:` and `https:` hrefs accepted |
| Puppeteer isolation | Each fetch uses an isolated browser context — no cross-site cookie or storage leakage |
| robots.txt | Parsed per domain, cached 30 min, size-capped at 100 KB |
| Response size | 5 MB decompressed limit per page |
| Link cap | Max 500 links extracted per page |
| Href length | Max 2048 characters per href (ReDoS protection) |

---

## 📁 Project Structure

```text
rcn-crawler/
├── src/
│   ├── crawl/
│   │   ├── processQueue.js       # dispatcher + workers + adaptive rate + search terms + SIGINT
│   │   └── enqueueLinks.js       # depth limit, domain allowlist/blocklist, onion-only filter
│   ├── http/
│   │   ├── fetchUrl.js           # axios fetch — SSRF, gzip bomb, header fingerprinting
│   │   ├── puppeteerFetch.js     # Puppeteer fallback — isolated context, JS rendering via Tor
│   │   └── smartFetch.js         # axios-first, Puppeteer-fallback coordinator
│   ├── output/
│   │   ├── generateGraph.js      # D3.js force-directed domain graph → data/graph.html
│   │   ├── saveResults.js        # writes data/results.json
│   │   ├── saveUniqueLinks.js    # merges discovered links across runs
│   │   ├── saveVisited.js        # atomic write of data/visited.json
│   │   ├── loadVisited.js        # resume support
│   │   ├── saveQueue.js          # atomic write of data/queue.json
│   │   └── loadQueue.js          # loads pending queue for resume
│   ├── parser/
│   │   └── parseLinks.js         # scheme filtering + href sanitisation + download detection
│   ├── robots/
│   │   ├── getRobots.js          # cached, size-capped robots.txt fetcher
│   │   └── isAllowed.js
│   ├── tor/
│   │   ├── findTorPort.js        # probes 9050 / 9150
│   │   └── checkPort.js
│   ├── utils/
│   │   ├── urls.js
│   │   ├── sleep.js              # sleep, jitteredSleep, Semaphore
│   │   ├── ipSafety.js           # SSRF IP range checks (IPv4 + IPv4-mapped IPv6)
│   │   ├── notify.js             # webhook notifications (Discord / Slack / Telegram / custom)
│   │   ├── logger.js             # structured rotating logger
│   │   └── compress.js           # gzip archive utilities
│   ├── config.js                 # CLI flags + all runtime constants
│   └── main.js
├── data/
│   ├── results.json              # per-page crawl results (includes matchedTerms, downloads)
│   ├── graph.html                # interactive domain connection map (auto-generated on exit)
│   ├── unique-links.json         # all discovered links, merged across runs
│   ├── visited.json              # visited URL set (enables resume)
│   ├── queue.json                # pending URL queue (enables resume)
│   └── archive/                  # compressed snapshots of previous results
├── logs/
│   └── crawler-YYYY-MM-DD.log   # structured JSON-Lines logs (daily rotation)
├── urls.txt
└── package.json
```

---

## ⚠️ Notes

* `.onion` domains require Tor — the crawler exits if Tor is not running on port 9050 or 9150
* All traffic is routed through Tor, including clearnet URLs discovered during crawling
* Crawling through Tor is slower than direct connections — tune `--delay` and `--timeout` accordingly
* Adaptive rate limiting adjusts the delay automatically; set `--adaptive-rate=false` to use a fixed delay
* Some sites rate-limit or block Tor exit nodes — errors are logged and the crawl continues
* `unique-links.json` accumulates links across multiple runs — delete it to reset
* Puppeteer uses a system or bundled Chromium (~300 MB downloaded on first `npm install`)

---

## 🔜 Planned

```text
✅ Adaptive rate limiting (per-domain EWMA delay, 500 ms – 10 s)
✅ Search-term filtering (--search-terms, --search-terms-only)
✅ Depth limiting (--max-depth)
✅ Domain allowlist / blocklist (--allow-domains, --block-domains)
✅ Finish notifications (--notify-url — Discord / Slack / Telegram / custom)
✅ Auto-generated connection graph on exit
✅ Downloadable content listing in graph detail panel
🔲 Docker support (containerized crawler runtime)
🔲 Kata Containers integration (secure, isolated execution)
🔲 Crawl metrics dashboard
🔲 Captcha bypass
🔲 Distributed crawling (multiple workers / nodes)
🔲 Database storage backend
```

---

## ⚖️ Disclaimer

This project is for educational and research purposes only.  
Do not use it to crawl systems without explicit permission.

---

## 👨‍💻 Author

<p align="center">
  <b><a href="https://github.com/0Day-legalize">RCN</a></b><br>
  <sub>Cybersecurity • Web Crawling • Tor Research</sub>
</p>
