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

Output → `results.json` + `unique-links.json` + `visited.json`

---

## 🚀 Features

* 🌐 Crawl standard websites and `.onion` hidden services
* 🧅 Full Tor SOCKS5 support with per-domain circuit isolation
* 🔁 Indefinite crawling — runs until no new links are found
* 🔀 Multi-domain crawling — follows cross-domain links automatically
* ♻️ Resume support — restarts pick up where they left off via `visited.json`
* ⚡ Concurrent crawling — configurable parallel domains and requests
* 🤖 robots.txt support with 30-minute cache expiry
* 🛡️ SSRF protection — blocks private/internal IP ranges and redirect chains
* 💣 Gzip bomb protection — dual compressed + decompressed size caps
* 🔒 Input sanitisation — blocks `javascript:`, `file:`, `data:` and other unsafe schemes
* 🕵️ User-Agent rotation — avoids fingerprinting
* 💾 Batched disk writes — reduces I/O overhead on long runs

---

## 🧠 Architecture

```text
main.js
  └── processQueue.js (dispatcher)
        ├── crawlDomain (worker per domain)
        │     ├── fetchUrl → Tor SOCKS5 → Internet / Onion
        │     ├── parseLinks → enqueueLinks (cross-domain aware)
        │     └── getRobots → isAllowed
        └── shared state (queue, visited, results, counters)
```

* Each domain gets its own Tor circuit (fresh `SocksProxyAgent`)
* Dispatcher watches the shared queue and spawns workers for new domains as they appear
* `visited.json` is written every N pages so progress survives restarts

---

## ⚙️ Requirements

* Node.js >= 18
* Tor (required for `.onion` crawling)

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
* Lines starting with `#` are treated as comments

---

## 🧅 Tor Setup

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

### Linux

```bash
sudo apt update && sudo apt install tor
sudo systemctl start tor
sudo systemctl enable tor
```

### Verify

Windows: `Test-NetConnection 127.0.0.1 -Port 9050`  
Linux: `ss -tulnp | grep 9050`

---

## ⚙️ Configuration

All settings can be passed as CLI flags. Defaults are defined in `src/config.js`.

| Flag | Default | Description |
|---|---|---|
| `--max-pages=N` | `0` (unlimited) | Stop after N pages. `0` = run forever |
| `--delay=MS` | `1000` | Delay between requests per domain (ms) |
| `--timeout=MS` | `8000` | Request timeout (ms) |
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

The crawler saves visited URLs to `visited.json` every 10 pages. If you stop it (Ctrl+C) and restart, it automatically picks up where it left off — no URLs are re-crawled.

```bash
# Stop anytime
Ctrl+C

# Resume — visited.json is loaded automatically
npm start
```

To start fresh, delete `visited.json`.

---

## 🔀 Multi-Domain Crawling

When a page links to a different domain, the crawler automatically:

1. Adds the new domain's URL to the shared queue
2. Spawns a dedicated worker for that domain
3. Gives it its own isolated Tor circuit

So starting with `example.com` and finding a link to `other-site.com` will crawl both, then follow any new domains those pages link to — indefinitely.

---

## 🔒 Security Features

| Protection | Details |
|---|---|
| SSRF | Blocks private IPs (`127.x`, `10.x`, `172.16-31.x`, `192.168.x`, `169.254.x`) and checks every redirect hop |
| Gzip bomb | 2MB cap on compressed stream + 5MB cap on decompressed output |
| Scheme filtering | Only `http:` and `https:` hrefs accepted — `javascript:`, `file:`, `data:` etc. are dropped |
| robots.txt | Parsed per domain, cached 30 minutes, size-capped at 100KB |
| Response size | 5MB decompressed limit per page |
| Link cap | Max 500 links extracted per page |
| Href length | Max 2048 characters per href |
| Tor isolation | Each domain gets a fresh SOCKS5 agent (separate Tor circuit) |

---

## 🚀 Run

```bash
npm start
```

---

## 🧪 Example Output

```text
✓  Tor detected on port 9050
   Loaded 3 seed URL(s)
Resuming — 142 URL(s) already visited from previous run(s)
Starting crawl — up to 3 domains in parallel

[example.com] Worker started
[example.com] Processing: https://example.com
Status: 200
Server: nginx
Links found: 12
Allowed links: 9

[other-site.com] Worker started   ← discovered from example.com
[example.com] Processing: https://example.com/about
...

No more links found. Crawl complete.
Total processed: 161
Total visited:   161
```

---

## 📁 Project Structure

```text
rcn-crawler/
├── src/
│   ├── crawl/
│   │   ├── processQueue.js       # dispatcher + domain workers
│   │   └── enqueueLinks.js       # cross-domain aware link queuing
│   ├── http/
│   │   └── fetchUrl.js           # fetch with SSRF + gzip bomb protection
│   ├── output/
│   │   ├── saveResults.js
│   │   ├── saveUniqueLinks.js    # merges links across runs
│   │   ├── saveVisited.js
│   │   └── loadVisited.js        # resume support
│   ├── parser/
│   │   └── parseLinks.js         # scheme filtering + href sanitisation
│   ├── robots/
│   │   ├── getRobots.js          # cached, size-capped robots.txt fetcher
│   │   └── isAllowed.js
│   ├── tor/
│   │   ├── findTorPort.js
│   │   └── checkPort.js
│   ├── utils/
│   │   ├── urls.js
│   │   ├── sleep.js              # sleep + Semaphore
│   │   └── ipSafety.js           # SSRF IP range checks
│   ├── config.js
│   └── main.js
├── urls.txt
├── results.json                  # crawl results (overwritten each run)
├── unique-links.json             # all discovered links (merged across runs)
├── visited.json                  # visited URLs (enables resume)
└── package.json
```

---

## ⚠️ Notes

* `.onion` domains require Tor — the crawler exits with an error if Tor is not running
* Crawling through Tor is slower than direct connections — tune `--delay` accordingly
* Some sites rate-limit or block Tor exit nodes — errors are logged and the crawl continues
* `unique-links.json` accumulates links across multiple runs — delete it to reset

---

## 🚧 In Progress

```text
🔲 External configuration file (JSON/YAML)
🔲 Structured logging with log levels (info / warn / error)
```

---

## 🔜 Planned

```text
🔲 Docker support (containerized crawler runtime)
🔲 Kata Containers integration (secure, isolated execution)
🔲 Adaptive rate limiting (per-domain throttling based on response times)
🔲 Headless browser support (Puppeteer for JS-heavy sites)
🔲 Crawl metrics dashboard
```

---

## 🧠 Long-Term

```text
🔲 Distributed crawling (multiple workers / nodes)
🔲 Storage backend (database instead of JSON files)
🔲 OSINT modules (metadata extraction, fingerprinting)
🔲 Crawl scheduling (cron / periodic jobs)
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