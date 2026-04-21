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
* 🗺️ Interactive connection map — force-directed domain graph with one command
* 🧅 All traffic routed through Tor — clearnet and onion alike
* 🔁 Indefinite crawling — runs until no new links are found
* 🔀 Multi-domain crawling — follows cross-domain links automatically
* ♻️ Full resume support — `Ctrl+C` saves both visited URLs and the pending queue; next run continues exactly where it left off
* 🤖 Two-layer fetching — axios first, Puppeteer fallback for JS-rendered pages
* 🕵️ Anti-fingerprinting — UA rotation with matching Client Hints, Sec-Fetch-\* headers, header-order shuffling, jittered delays
* 🔄 Tor circuit rotation — fresh circuit every 10 requests per domain via SOCKS5 credential isolation
* ⚡ Concurrent crawling — configurable parallel domains and requests
* 🤖 robots.txt support with 30-minute cache expiry
* 🛡️ SSRF protection — blocks private/internal IP ranges across all redirect hops
* 💣 Gzip bomb protection — dual compressed + decompressed size caps
* 🔒 Scheme filtering — only `http:` and `https:` hrefs accepted
* 💾 Structured JSON logging — rotating daily log files in `logs/`

---

## 🧠 Architecture

```text
main.js
  └── processQueue.js (dispatcher + SIGINT handler)
        ├── crawlDomain (worker per domain)
        │     ├── smartFetch
        │     │     ├── fetchUrl (axios + retries) → Tor SOCKS5 → Internet / Onion
        │     │     └── fetchWithPuppeteer (fallback, JS-rendered pages)
        │     ├── parseLinks → enqueueLinks (cross-domain aware, onion-only filter)
        │     └── getRobots → isAllowed
        └── shared state (queue, visited, results, counters)
```

* Every domain gets its own Tor circuit via unique SOCKS5 credentials (`IsolateSOCKSAuth`)
* Circuits rotate every 10 requests to limit long-lived circuit correlation
* Dispatcher watches the shared queue and spawns workers for new domains as they appear
* `visited.json` and `queue.json` are written together every 10 pages

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
git clone https://github.com/0Day-legalize/WebCrawler.git
cd WebCrawler/rcn-crawler
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
| `--delay=MS` | `1000` | Delay between requests per domain (ms) |
| `--timeout=MS` | `20000` | Request timeout — 20 s default suits onion circuit build times |
| `--onion-only=true\|false` | `false` | Drop all non-`.onion` URLs at enqueue time |
| `--max-concurrent-domains=N` | `3` | Domains crawled in parallel |
| `--max-concurrent-requests=N` | `2` | Requests in parallel per domain |
| `--debug=true\|false` | `true` | Print extracted links to console |

```bash
node src/main.js --help
```

### Examples

```bash
# Run indefinitely (default)
node src/main.js

# Onion-only crawl — ignore all clearnet links
node src/main.js --onion-only=true

# Stop after 500 pages
node src/main.js --max-pages=500

# Faster crawl, less logging
node src/main.js --max-concurrent-domains=5 --max-concurrent-requests=3 --debug=false

# Conservative Tor-friendly settings
node src/main.js --max-concurrent-domains=2 --max-concurrent-requests=1 --delay=2000
```

> **Tor note:** Total simultaneous connections = `max-concurrent-domains × max-concurrent-requests`.  
> At `3 × 2 = 6` the default is safe. Going above `15` may cause Tor timeouts.

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
* Uses a matching Chrome UA and Client Hint headers
* Waits for `DOMContentLoaded` + 2 s for JS execution before capturing HTML

The Puppeteer browser is a shared singleton — one launch per run, one page opened and closed per request.

---

## 🗺️ Connection Map

Generate an interactive visual graph of all domain connections discovered during a crawl:

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
| Click a node | Highlights all direct connections; opens a detail panel |
| Bright green edges | Outgoing links from the selected domain |
| Amber edges | Incoming links into the selected domain |
| Drag a node | Pins it in place |
| Search bar | Jumps to and selects a domain by name |
| Click background or ✕ | Clears selection |

> **Note:** The graph requires an internet connection to load D3.js from CDN (`d3js.org`). If you are in an air-gapped environment, download D3 v7 and replace the `<script src>` URL with a local path.

---

## 🔀 Multi-Domain Crawling

When a page links to a different domain, the crawler automatically:

1. Adds the new domain's URL to the shared queue
2. Spawns a dedicated worker for that domain
3. Allocates it a fresh Tor circuit

So starting with one seed can snowball into crawling dozens of linked domains.

---

## 🔒 Security Features

| Protection | Details |
|---|---|
| Tor-only traffic | All requests (clearnet and onion) are forced through Tor — no direct connections |
| Circuit isolation | Each domain uses unique SOCKS5 credentials, allocating a dedicated Tor circuit |
| Circuit rotation | Circuits rotate every 10 requests per domain to limit correlation risk |
| SSRF | Blocks private IPs (`127.x`, `10.x`, `172.16–31.x`, `192.168.x`, `169.254.x`) and checks every redirect hop |
| Gzip bomb | 2 MB cap on compressed stream + 5 MB cap on decompressed output |
| Scheme filtering | Only `http:` and `https:` hrefs accepted |
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
│   │   ├── processQueue.js       # dispatcher + domain workers + SIGINT handler
│   │   └── enqueueLinks.js       # cross-domain link queuing, onion-only filter
│   ├── http/
│   │   ├── fetchUrl.js           # axios fetch — SSRF, gzip bomb, header fingerprinting
│   │   ├── puppeteerFetch.js     # Puppeteer fallback — JS rendering via Tor
│   │   └── smartFetch.js        # axios-first, Puppeteer-fallback coordinator
│   ├── output/
│   │   ├── saveResults.js        # writes data/results.json
│   │   ├── saveUniqueLinks.js    # merges discovered links across runs
│   │   ├── saveVisited.js        # atomic write of data/visited.json
│   │   ├── loadVisited.js        # resume support
│   │   ├── saveQueue.js          # atomic write of data/queue.json
│   │   └── loadQueue.js          # loads pending queue for resume
│   ├── parser/
│   │   └── parseLinks.js         # scheme filtering + href sanitisation
│   ├── robots/
│   │   ├── getRobots.js          # cached, size-capped robots.txt fetcher
│   │   └── isAllowed.js
│   ├── tor/
│   │   ├── findTorPort.js        # probes 9050 / 9150
│   │   └── checkPort.js
│   ├── utils/
│   │   ├── urls.js
│   │   ├── sleep.js              # sleep, jitteredSleep, Semaphore
│   │   ├── ipSafety.js           # SSRF IP range checks
│   │   ├── logger.js             # structured rotating logger
│   │   └── compress.js           # gzip archive utilities
│   ├── config.js                 # CLI flags + all runtime constants
│   └── main.js
├── data/
│   ├── results.json              # per-page crawl results
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
* Some sites rate-limit or block Tor exit nodes — errors are logged and the crawl continues
* `unique-links.json` accumulates links across multiple runs — delete it to reset
* Puppeteer downloads a bundled Chromium on first `npm install` (~300 MB)

---

## 🔜 Planned

```text
🔲 Docker support (containerized crawler runtime)
🔲 Kata Containers integration (secure, isolated execution)
🔲 Adaptive rate limiting (per-domain throttling based on response times)
🔲 Crawl metrics dashboard
🔲 Search-term filtering
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
