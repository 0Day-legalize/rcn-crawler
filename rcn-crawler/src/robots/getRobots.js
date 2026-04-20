/**
 * @file getRobots.js
 * @description Fetches, parses, and caches robots.txt for each domain.
 * Cache entries expire after 30 minutes so long-running crawls pick up rule changes.
 */

const axios = require("axios");
const { MAX_ROBOTS_SIZE } = require("../config");
const { buildHeaders }    = require("../http/fetchUrl");

/** @type {number} Cache TTL in milliseconds (30 minutes). */
const CACHE_TTL_MS = 30 * 60 * 1000;

/**
 * In-memory robots.txt cache.
 * Keys are base hostnames; values are { rules, expiresAt }.
 * @type {Map<string, {rules: string[], expiresAt: number}>}
 */
const cache = new Map();

/**
 * Returns the list of disallowed path prefixes for the given domain.
 * Results are cached for CACHE_TTL_MS milliseconds.
 *
 * Failure modes (network error, 4xx status, oversized response) all return
 * an empty rules array so the crawl continues unblocked.
 *
 * @async
 * @param {string} baseHost  - Hostname of the target domain (e.g. "example.com")
 * @param {object} torAgent  - SOCKS5 proxy agent used for the robots.txt request
 * @returns {Promise<string[]>} - Array of disallowed path prefixes from User-agent: *
 */
async function getRobots(baseHost, torAgent) {
    const cached = cache.get(baseHost);
    if (cached && Date.now() < cached.expiresAt) {
        return cached.rules;
    }

    const url = `http://${baseHost}/robots.txt`;

    try {
        const response = await axios.get(url, {
            timeout:        5000,
            responseType:   "stream",
            validateStatus: () => true,
            maxRedirects:   3,
            httpAgent:      torAgent,
            httpsAgent:     torAgent,
            // Reuse the main fetcher's header builder so robots.txt requests
            // present the same browser fingerprint surface as regular pages.
            // A minimal "User-Agent: bot" robots request followed by a full
            // browser-like page request would be a clean correlation signal.
            headers:        buildHeaders(url, null),
        });

        if (response.status >= 400) {
            setCache(baseHost, []);
            return [];
        }

        const text = await readStream(response.data, MAX_ROBOTS_SIZE);

        if (text === null) {
            console.warn(`[robots] ${baseHost} robots.txt exceeded size limit — treating as empty`);
            setCache(baseHost, []);
            return [];
        }

        const rules = parseRobots(text);
        setCache(baseHost, rules);
        return rules;

    } catch {
        setCache(baseHost, []);
        return [];
    }
}

/**
 * Stores parsed robots rules in the cache with a TTL-based expiry timestamp.
 *
 * @param {string}   baseHost - Hostname to cache rules for
 * @param {string[]} rules    - Parsed disallowed path prefixes
 * @returns {void}
 */
function setCache(baseHost, rules) {
    cache.set(baseHost, { rules, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Reads a Node.js readable stream into a string, up to maxBytes.
 * Returns null if the byte limit is exceeded (signals oversized response).
 *
 * @param {import("stream").Readable} stream - Stream to read
 * @param {number} maxBytes                  - Maximum bytes to accept
 * @returns {Promise<string|null>}
 */
function readStream(stream, maxBytes) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let totalBytes = 0;

        stream.on("data", (chunk) => {
            totalBytes += chunk.length;
            if (totalBytes > maxBytes) {
                stream.destroy();
                resolve(null);
                return;
            }
            chunks.push(chunk);
        });

        stream.on("end",   () => resolve(Buffer.concat(chunks).toString("utf-8")));
        stream.on("error", (err) => reject(err));
    });
}

/**
 * Parses robots.txt text and extracts Disallow paths for the wildcard agent (*).
 * Only User-agent: * blocks are processed; all other agents are ignored.
 *
 * @param {string}   text - Raw robots.txt content
 * @returns {string[]}    - Disallowed path prefixes (e.g. ["/admin", "/private/"])
 */
function parseRobots(text) {
    const lines   = text.split(/\r?\n/);
    const rules   = [];
    let applies   = false;

    for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith("#")) continue;

        if (line.toLowerCase().startsWith("user-agent:")) {
            const agent = line.slice("user-agent:".length).trim();
            applies = agent === "*";
            continue;
        }

        if (applies && line.toLowerCase().startsWith("disallow:")) {
            const rulePath = line.slice("disallow:".length).trim();
            if (rulePath) rules.push(rulePath);
        }
    }

    return rules;
}

module.exports = { getRobots };