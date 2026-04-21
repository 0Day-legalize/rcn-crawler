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
    --timeout=MS                    Request timeout (default: 20000)
    --debug=true|false              Show extracted links (default: true)
    --onion-only=true|false         Skip all non-.onion URLs (default: false)
    --ignore-robots=true|false      Ignore robots.txt rules entirely (default: false)
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

/** @type {boolean} When true, non-.onion URLs discovered during crawling are dropped at enqueue time. */
const ONION_ONLY = getArg("onion-only", "false") === "true";

/** @type {boolean} When true, robots.txt rules are not fetched or enforced. */
const IGNORE_ROBOTS = getArg("ignore-robots", "false") === "true";

/**
 * Maximum number of pages to process before stopping.
 * Set to 0 for unlimited (default) — the crawl runs until no new links are found.
 * @type {number}
 */
const MAX_PAGES = Number(getArg("max-pages", 0));

/** @type {number} Milliseconds to wait between requests on the same domain. */
const DELAY_MS = Number(getArg("delay", 1000));

/**
 * Milliseconds before an individual HTTP request times out.
 * Onion services can take 10-20 s to build a circuit on first connect.
 * @type {number}
 */
const TIMEOUT_MS = Number(getArg("timeout", 20000));

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
 * How many pages a single domain worker fetches before rotating to a fresh
 * Tor circuit (via new SOCKS5 credential pair). Lower = stronger unlinkability;
 * higher = fewer NEWNYM round-trips. 10 is a reasonable middle ground.
 * @type {number}
 */
const CIRCUIT_ROTATE_EVERY = 10;

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
 * The `browser` field controls which Sec-Fetch-* headers are emitted:
 *   - "chrome"  → Sec-CH-UA* + Sec-Fetch-* + Upgrade-Insecure-Requests
 *   - "firefox" → Sec-Fetch-* + Upgrade-Insecure-Requests (no Sec-CH-UA)
 *   - "safari"  → none of the above
 *
 * Update versions quarterly — stale browser versions are a reliable crawler tell.
 *
 * @type {Array<{browser: string, ua: string, secChUa?: string, secChUaMobile?: string, secChUaPlatform?: string}>}
 */
const USER_AGENT_PROFILES = [
    // Chrome 140 - Windows
    {
        browser:         "chrome",
        ua:              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        secChUa:         '"Chromium";v="140", "Google Chrome";v="140", "Not-A.Brand";v="8"',
        secChUaMobile:   "?0",
        secChUaPlatform: '"Windows"',
    },
    // Chrome 141 - Windows
    {
        browser:         "chrome",
        ua:              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
        secChUa:         '"Chromium";v="141", "Google Chrome";v="141", "Not-A.Brand";v="24"',
        secChUaMobile:   "?0",
        secChUaPlatform: '"Windows"',
    },
    // Chrome 140 - macOS
    {
        browser:         "chrome",
        ua:              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        secChUa:         '"Chromium";v="140", "Google Chrome";v="140", "Not-A.Brand";v="8"',
        secChUaMobile:   "?0",
        secChUaPlatform: '"macOS"',
    },
    // Chrome 140 - Linux
    {
        browser:         "chrome",
        ua:              "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        secChUa:         '"Chromium";v="140", "Google Chrome";v="140", "Not-A.Brand";v="8"',
        secChUaMobile:   "?0",
        secChUaPlatform: '"Linux"',
    },
    // Safari 18.0 - macOS (no Sec-CH-UA, no Sec-Fetch-*)
    {
        browser: "safari",
        ua:      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    },
    // Firefox 133 - Linux
    {
        browser: "firefox",
        ua:      "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
    },
    // Firefox 134 - Windows
    {
        browser: "firefox",
        ua:      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0",
    },
    // Firefox 135 - Windows
    {
        browser: "firefox",
        ua:      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0",
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
    ONION_ONLY,
    IGNORE_ROBOTS,
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
    CIRCUIT_ROTATE_EVERY,
    USER_AGENT_PROFILES,
    ACCEPT_LANGUAGES,
    TOR_HOST,
    TOR_PORTS,
};