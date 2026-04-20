/**
 * @file config.js
 * @description CLI argument parser and central configuration for RCN WebCrawler.
 * All runtime settings are resolved once at startup and exported as constants.
 * CLI flags always override the hardcoded defaults.
 */

// ---------- CLI HELP ----------

/**
 * Prints usage instructions to stdout and exits.
 * Triggered by the --help flag.
 *
 * @returns {void}
 */
function showHelp() {
    console.log(`
🕷️ RCN WebCrawler

Usage:
    node src/main.js [options]

Options:
    --max-pages=NUMBER              Max pages to crawl, 0 = unlimited (default: 0)
    --delay=MS                      Delay between requests (default: 1000)
    --timeout=MS                    Request timeout (default: 8000)
    --debug=true|false              Show extracted links (default: true)
    --max-concurrent-domains=N      Domains crawled in parallel (default: 3)
    --max-concurrent-requests=N     Requests in parallel per domain (default: 2)
    --help                          Show this help message

Examples:
    node src/main.js                          Runs forever until no links remain
    node src/main.js --max-pages=500          Stop after 500 pages
    node src/main.js --delay=500 --debug=false
    node src/main.js --max-concurrent-domains=5 --max-concurrent-requests=3

Notes:
    Make sure Tor is running for .onion crawling
    visited.json is saved every ${VISITED_SAVE_INTERVAL} pages so progress survives restarts
`);
}

if (process.argv.includes("--help")) {
    showHelp();
    process.exit(0);
}

// ---------- CLI ARG PARSER ----------

/**
 * Reads a named CLI flag of the form --name=value.
 *
 * @param {string} name         - Flag name without the leading --
 * @param {string} defaultValue - Value to return when the flag is absent
 * @returns {string}            - Raw string value of the flag or the default
 */
function getArg(name, defaultValue) {
    const prefix = `--${name}=`;
    const arg = process.argv.find(a => a.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : defaultValue;
}

// ---------- CONFIG VALUES ----------

/** @type {boolean} Print extracted links to the console when true. */
const DEBUG_LINKS = getArg("debug", "true") === "true";

/**
 * Maximum number of pages to process before stopping.
 * Set to 0 for unlimited (default) — the crawl runs until no new links are found.
 * @type {number}
 */
const MAX_PAGES = Number(getArg("max-pages", 0));

/** @type {number} Milliseconds to wait between requests on the same domain. */
const DELAY_MS = Number(getArg("delay", 1000));

/** @type {number} Milliseconds before an individual HTTP request times out. */
const TIMEOUT_MS = Number(getArg("timeout", 8000));

/** @type {number} How many domains are crawled concurrently. */
const MAX_CONCURRENT_DOMAINS = Number(getArg("max-concurrent-domains", 3));

/**
 * How many pages within a single domain are fetched simultaneously.
 * Total concurrent connections = MAX_CONCURRENT_DOMAINS × MAX_CONCURRENT_REQUESTS.
 * @type {number}
 */
const MAX_CONCURRENT_REQUESTS = Number(getArg("max-concurrent-requests", 2));

/**
 * Maximum decompressed response body size in bytes (5 MB).
 * Requests exceeding this limit are aborted to prevent memory exhaustion.
 * @type {number}
 */
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;

/**
 * Maximum size of a fetched robots.txt in bytes (100 KB).
 * Oversized files are treated as empty to prevent memory exhaustion.
 * @type {number}
 */
const MAX_ROBOTS_SIZE = 100 * 1024;

/**
 * Maximum number of links extracted from a single page.
 * Prevents the shared queue from exploding on link-farm pages.
 * @type {number}
 */
const MAX_LINKS_PER_PAGE = 500;

/**
 * Maximum character length of a single href attribute value.
 * Hrefs longer than this are dropped before URL parsing (ReDoS protection).
 * @type {number}
 */
const MAX_HREF_LENGTH = 2048;

/**
 * Number of pages crawled between batched writes to visited.json.
 * Lower values increase durability; higher values reduce disk I/O.
 * @type {number}
 */
const VISITED_SAVE_INTERVAL = 10;

/**
 * Browser fingerprint profiles rotated per request.
 *
 * Each profile bundles a User-Agent with the Client Hint headers that the
 * matching browser would actually send. Mismatching these (e.g. sending
 * Sec-CH-UA with a Firefox UA) is a stronger fingerprint than sending none,
 * so Chromium profiles include Client Hints and Firefox/Safari profiles
 * intentionally omit them.
 *
 * Keep this list diverse but realistic — every profile here must correspond
 * to a real browser/OS combination that ships today.
 *
 * @type {Array<{ua: string, secChUa?: string, secChUaMobile?: string, secChUaPlatform?: string}>}
 */
const USER_AGENT_PROFILES = [
    // Chromium-family profiles (send Sec-CH-UA*)
    {
        ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        secChUa:         '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        secChUaMobile:   "?0",
        secChUaPlatform: '"Windows"',
    },
    {
        ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        secChUa:         '"Chromium";v="125", "Google Chrome";v="125", "Not.A/Brand";v="24"',
        secChUaMobile:   "?0",
        secChUaPlatform: '"Windows"',
    },
    {
        ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        secChUa:         '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        secChUaMobile:   "?0",
        secChUaPlatform: '"macOS"',
    },
    {
        ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        secChUa:         '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        secChUaMobile:   "?0",
        secChUaPlatform: '"Linux"',
    },
    // Non-Chromium profiles (must NOT send Sec-CH-UA*)
    {
        ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
    },
    {
        ua: "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
    },
    {
        ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    },
    {
        ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
    },
];

/**
 * Accept-Language values rotated per request.
 *
 * Always sending a single fixed Accept-Language (or none at all) is a reliable
 * crawler tell. Real browsers vary across users and locales, and the q-weight
 * syntax also varies. Keep a small pool of realistic values — adding too many
 * exotic locales would just create a different fingerprint.
 *
 * @type {string[]}
 */
const ACCEPT_LANGUAGES = [
    "en-US,en;q=0.9",
    "en-GB,en;q=0.9",
    "en-US,en;q=0.5",
    "en;q=0.9",
    "en-US,en;q=0.8,de;q=0.6",
    "en-US,en;q=0.9,fr;q=0.5",
];

/**
 * Fractional jitter applied to every inter-request delay.
 *
 * Real browsing traffic isn't perfectly periodic. A fixed DELAY_MS between
 * requests forms a machine-detectable rhythm, so each sleep is perturbed by
 * ±DELAY_JITTER * DELAY_MS. 0.25 = ±25%, which is noisy enough to break
 * the rhythm without meaningfully changing throughput.
 *
 * @type {number}
 */
const DELAY_JITTER = 0.25;

/** @type {string} Loopback address where the Tor SOCKS5 proxy is expected. */
const TOR_HOST = "127.0.0.1";

/**
 * Ordered list of SOCKS5 ports to probe when detecting Tor.
 * 9050 is the system Tor daemon; 9150 is Tor Browser.
 * @type {number[]}
 */
const TOR_PORTS = [9050, 9150];

// ---------- EXPORT ----------

module.exports = {
    DEBUG_LINKS,
    MAX_PAGES,
    DELAY_MS,
    DELAY_JITTER,
    TIMEOUT_MS,
    MAX_CONCURRENT_DOMAINS,
    MAX_CONCURRENT_REQUESTS,
    MAX_RESPONSE_SIZE,
    MAX_ROBOTS_SIZE,
    MAX_LINKS_PER_PAGE,
    MAX_HREF_LENGTH,
    VISITED_SAVE_INTERVAL,
    USER_AGENT_PROFILES,
    ACCEPT_LANGUAGES,
    TOR_HOST,
    TOR_PORTS,
};