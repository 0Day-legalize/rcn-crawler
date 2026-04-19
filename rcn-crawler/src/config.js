// ---------- CLI HELP ----------
function showHelp() {
    console.log(`
🕷️ RCN WebCrawler

Usage:
    node src/main.js [options]

Options:
    --max-pages=NUMBER              Max pages to crawl (default: 20)
    --delay=MS                      Delay between requests (default: 1000)
    --timeout=MS                    Request timeout (default: 8000)
    --debug=true|false              Show extracted links (default: true)
    --max-concurrent-domains=N      Domains crawled in parallel (default: 3)
    --max-concurrent-requests=N     Requests in parallel per domain (default: 2)
    --help                          Show this help message

Examples:
    node src/main.js --max-pages=50
    node src/main.js --delay=500 --debug=false
    node src/main.js --max-concurrent-domains=5 --max-concurrent-requests=3

Notes:
    Make sure Tor is running for .onion crawling
`);
}

if (process.argv.includes("--help")) {
    showHelp();
    process.exit(0);
}

// ---------- CLI ARG PARSER ----------
function getArg(name, defaultValue) {
    const prefix = `--${name}=`;
    const arg = process.argv.find(a => a.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : defaultValue;
}

// ---------- CONFIG VALUES ----------
const DEBUG_LINKS             = getArg("debug", "true") === "true";
const MAX_PAGES               = Number(getArg("max-pages", 20));
const DELAY_MS                = Number(getArg("delay", 1000));
const TIMEOUT_MS              = Number(getArg("timeout", 8000));
const MAX_CONCURRENT_DOMAINS  = Number(getArg("max-concurrent-domains", 3));
const MAX_CONCURRENT_REQUESTS = Number(getArg("max-concurrent-requests", 2));

// Max decompressed bytes read from a page (5MB) — prevents memory crash
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;

// Max bytes read from robots.txt (100KB)
const MAX_ROBOTS_SIZE = 100 * 1024;

// Max links extracted from a single page — prevents queue explosion
const MAX_LINKS_PER_PAGE = 500;

// Max length of a single href value — prevents ReDoS on pathological input
const MAX_HREF_LENGTH = 2048;

// How many pages to crawl between visited.json writes (reduces disk I/O)
const VISITED_SAVE_INTERVAL = 10;

// Rotated per request to avoid fingerprinting
const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
];

const TOR_HOST  = "127.0.0.1";
const TOR_PORTS = [9050, 9150];

// ---------- EXPORT ----------
module.exports = {
    DEBUG_LINKS,
    MAX_PAGES,
    DELAY_MS,
    TIMEOUT_MS,
    MAX_CONCURRENT_DOMAINS,
    MAX_CONCURRENT_REQUESTS,
    MAX_RESPONSE_SIZE,
    MAX_ROBOTS_SIZE,
    MAX_LINKS_PER_PAGE,
    MAX_HREF_LENGTH,
    VISITED_SAVE_INTERVAL,
    USER_AGENTS,
    TOR_HOST,
    TOR_PORTS
};