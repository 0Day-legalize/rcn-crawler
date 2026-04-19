// ---------- CLI HELP ----------
function showHelp() {
    console.log(`
🕷️ RCN WebCrawler

Usage:
    node src/main.js [options]

Options:
    --max-pages=NUMBER    Max pages to crawl (default: 20)
    --delay=MS            Delay between requests (default: 1000)
    --timeout=MS          Request timeout (default: 8000)
    --debug=true|false    Show extracted links (default: true)
    --help                Show this help message

Examples:
    node src/main.js --max-pages=50
    node src/main.js --delay=500 --debug=false

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

function parsePositiveInt(value, name, defaultValue) {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) {
        console.error(`Invalid value for --${name}: "${value}". Using default ${defaultValue}.`);
        return defaultValue;
    }
    return n;
}

// ---------- CONFIG VALUES ----------
const DEBUG_LINKS = getArg("debug", "true") === "true";
const MAX_PAGES = parsePositiveInt(getArg("max-pages", 20), "max-pages", 20);
const DELAY_MS = parsePositiveInt(getArg("delay", 1000), "delay", 1000);
const TIMEOUT_MS = parsePositiveInt(getArg("timeout", 8000), "timeout", 8000);

const TOR_HOST = "127.0.0.1";
const TOR_PORTS = [9050, 9150];

// ---------- EXPORT ----------
module.exports = {
    DEBUG_LINKS,
    MAX_PAGES,
    DELAY_MS,
    TIMEOUT_MS,
    TOR_HOST,
    TOR_PORTS
};