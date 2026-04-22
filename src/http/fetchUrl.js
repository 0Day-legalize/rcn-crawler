/**
 * @file fetchUrl.js
 * @description HTTP fetcher with SSRF protection, manual redirect handling,
 * gzip bomb defence, response size capping, and browser-fingerprint hardening.
 */

const axios           = require("axios");
const zlib            = require("node:zlib");
const { PassThrough } = require("node:stream");
const {
    TIMEOUT_MS,
    MAX_RESPONSE_SIZE,
    USER_AGENT_PROFILES,
    ACCEPT_LANGUAGES,
} = require("../config");
const { isSafeUrl } = require("../utils/ipSafety");

/** @type {number} Maximum redirect hops to follow before returning an error. */
const MAX_REDIRECTS = 5;

/**
 * Maximum raw compressed bytes read from a response stream.
 * Prevents gzip bomb decompression from beginning on oversized payloads.
 * @type {number}
 */
const MAX_COMPRESSED_BYTES = 2 * 1024 * 1024;

/**
 * Accept header value used on every request. Matches the long form that
 * Chromium sends by default — sending the short `text/html,application/xhtml+xml`
 * string is a crawler tell, since real browsers advertise image and signed
 * exchange formats too.
 */
const DEFAULT_ACCEPT =
    "text/html,application/xhtml+xml,application/xml;q=0.9," +
    "image/avif,image/webp,image/apng,*/*;q=0.8," +
    "application/signed-exchange;v=b3;q=0.7";

/**
 * Returns a random browser profile from the configured pool.
 *
 * Each profile bundles a User-Agent with the Client Hint headers that the
 * matching browser actually sends. Keeping the two tied together prevents
 * the common "Chrome UA with no Sec-CH-UA" or "Firefox UA with Sec-CH-UA"
 * mismatch that flags obvious crawlers.
 *
 * @returns {{ua: string, secChUa?: string, secChUaMobile?: string, secChUaPlatform?: string}}
 */
function pickProfile() {
    return USER_AGENT_PROFILES[Math.floor(Math.random() * USER_AGENT_PROFILES.length)];
}

/**
 * Picks a random Accept-Language value from the configured pool.
 *
 * @returns {string}
 */
function pickAcceptLanguage() {
    return ACCEPT_LANGUAGES[Math.floor(Math.random() * ACCEPT_LANGUAGES.length)];
}

/**
 * Computes the Sec-Fetch-Site value for a navigation request.
 *
 * Mirrors what browsers send by default:
 *   - No referrer (direct/seed navigation) → "none"
 *   - Same origin (scheme + host + port identical) → "same-origin"
 *   - Different origin → "cross-site"
 *
 * (True "same-site" requires eTLD+1 comparison; "cross-site" is the safe
 * default for the cross-origin case without a tldts dependency.)
 *
 * @param {string|undefined|null} referrer
 * @param {string} target
 * @returns {"none"|"same-origin"|"cross-site"}
 */
function computeSecFetchSite(referrer, target) {
    if (!referrer) return "none";
    try {
        const src = new URL(referrer);
        const dst = new URL(target);
        if (src.origin === dst.origin) return "same-origin";
        return "cross-site";
    } catch {
        return "none";
    }
}

/**
 * Shuffles an array in place using Fisher-Yates.
 *
 * @template T
 * @param {T[]} items
 * @returns {T[]} the same array, reordered
 */
function shuffle(items) {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
}

/**
 * Computes a same-origin-safe Referer value for cross-origin requests.
 *
 * Mirrors the `strict-origin-when-cross-origin` referrer policy that modern
 * browsers apply by default:
 *   - same-origin target: full previous URL
 *   - cross-origin target: just the origin of the previous URL
 *   - downgrades (https -> http) or invalid URLs: no Referer
 *
 * Returning null means "do not set Referer at all" — which is the correct
 * behaviour for seed URLs (no previous page) and HTTPS -> HTTP hops.
 *
 * @param {string|undefined|null} referrer  - URL of the page that linked to `target`
 * @param {string} target                    - Absolute URL about to be requested
 * @returns {string|null}
 */
function buildReferer(referrer, target) {
    if (!referrer) return null;

    let src, dst;
    try {
        src = new URL(referrer);
        dst = new URL(target);
    } catch {
        return null;
    }

    // Never downgrade the scheme when sending Referer (browsers strip it).
    if (src.protocol === "https:" && dst.protocol === "http:") return null;

    if (src.origin === dst.origin) return src.href;
    return `${src.origin}/`;
}

/**
 * Assembles the full request header set for a single fetch.
 *
 * All per-request randomisation lives here so the shape of a request — the
 * set of headers, their values, and their transmission order — varies across
 * requests the way a real browsing session does.
 *
 * @param {string} target                     - Absolute URL being requested
 * @param {string|undefined|null} referrer    - URL of the page that linked here (if any)
 * @returns {Record<string,string>}           - Header object in randomised insertion order
 */
function buildHeaders(target, referrer) {
    const profile = pickProfile();

    // Build the header list as [key, value] pairs so we can shuffle the order
    // before turning it into an object. Node's HTTP client preserves object
    // key insertion order, so a shuffled object yields a shuffled wire order.
    const pairs = [
        ["User-Agent",      profile.ua],
        ["Accept",          DEFAULT_ACCEPT],
        ["Accept-Language", pickAcceptLanguage()],
        // `br` (Brotli) is handled by decompressStream below.
        ["Accept-Encoding", "gzip, deflate, br"],
        ["Connection",      "keep-alive"],
    ];

    // Client Hints: Chromium profiles carry them; Firefox/Safari profiles
    // must NOT — an inconsistent hint set is a stronger fingerprint than
    // sending nothing.
    if (profile.secChUa) {
        pairs.push(["Sec-CH-UA",          profile.secChUa]);
        pairs.push(["Sec-CH-UA-Mobile",   profile.secChUaMobile]);
        pairs.push(["Sec-CH-UA-Platform", profile.secChUaPlatform]);
    }

    // Sec-Fetch-* and Upgrade-Insecure-Requests: Chrome and Firefox both send
    // these on every navigation; Safari does not. Gate on profile.browser.
    if (profile.browser !== "safari") {
        pairs.push(["Upgrade-Insecure-Requests", "1"]);
        pairs.push(["Sec-Fetch-Site",             computeSecFetchSite(referrer, target)]);
        pairs.push(["Sec-Fetch-Mode",             "navigate"]);
        pairs.push(["Sec-Fetch-User",             "?1"]);
        pairs.push(["Sec-Fetch-Dest",             "document"]);
    }

    const referer = buildReferer(referrer, target);
    if (referer) pairs.push(["Referer", referer]);

    const headers = {};
    for (const [k, v] of shuffle(pairs)) headers[k] = v;
    return headers;
}

/**
 * Fetches a URL through Tor, enforcing SSRF protection, redirect safety,
 * and response size limits.
 *
 * @async
 * @param {string} url                        - Absolute URL to fetch
 * @param {object} torAgent                   - SOCKS5 proxy agent (SocksProxyAgent instance)
 * @param {string|undefined|null} [referrer]  - URL of the page that linked to `url`, if any.
 *                                              Used to set a realistic Referer header.
 * @returns {Promise<{url: string, status?: number, server?: string|null, poweredBy?: string|null, html?: string, error?: string}>}
 */
async function fetchUrl(url, torAgent, referrer) {
    if (!(await isSafeUrl(url))) {
        return { url, error: "Blocked: URL resolves to a private/internal address" };
    }

    try {
        const response = await makeRequest(url, torAgent, referrer);

        if (response.status >= 300 && response.status < 400) {
            return await followRedirects(url, response, torAgent, 0);
        }

        const html = await decompressStream(response);
        if (html === null) {
            return { url, error: "Response exceeded size limit" };
        }

        return buildResult(url, response, html);

    } catch (error) {
        return { url, error: error.message };
    }
}

/**
 * Issues a raw GET request with streaming enabled and auto-redirect disabled.
 * Decompression is also disabled so size caps can be applied manually.
 *
 * @async
 * @param {string} url                        - Absolute URL to request
 * @param {object} torAgent                   - SOCKS5 proxy agent
 * @param {string|undefined|null} [referrer]  - URL of the page that linked to `url`, if any
 * @returns {Promise<import("axios").AxiosResponse>}
 */
async function makeRequest(url, torAgent, referrer) {
    // All traffic routes through Tor — both .onion and clearnet.
    // Sending clearnet requests direct would expose the crawler's real IP.
    return axios.get(url, {
        timeout:        TIMEOUT_MS,
        responseType:   "stream",
        validateStatus: () => true,
        maxRedirects:   0,       // redirects are handled manually (SSRF check per hop)
        decompress:     false,   // decompression handled manually (gzip bomb protection)
        httpAgent:      torAgent,
        httpsAgent:     torAgent,
        headers:        buildHeaders(url, referrer),
    });
}

/**
 * Follows a redirect chain up to MAX_REDIRECTS hops, performing an SSRF
 * check on every Location header before issuing the next request.
 *
 * The previous URL in the chain is used as the referrer for the next hop,
 * matching how real browsers propagate Referer across redirects.
 *
 * @async
 * @param {string} originalUrl                      - URL that produced the first redirect
 * @param {import("axios").AxiosResponse} response  - The redirect response
 * @param {object} torAgent                         - SOCKS5 proxy agent
 * @param {number} depth                            - Current redirect depth (starts at 0)
 * @returns {Promise<{url: string, status?: number, server?: string|null, poweredBy?: string|null, html?: string, error?: string}>}
 */
async function followRedirects(originalUrl, response, torAgent, depth) {
    if (depth >= MAX_REDIRECTS) {
        return { url: originalUrl, error: "Too many redirects" };
    }

    const location = response.headers["location"];
    if (!location) {
        return { url: originalUrl, error: "Redirect with no Location header" };
    }

    let nextUrl;
    try {
        nextUrl = new URL(location, originalUrl).href;
    } catch {
        return { url: originalUrl, error: `Invalid redirect Location: ${location}` };
    }

    if (!(await isSafeUrl(nextUrl))) {
        return { url: originalUrl, error: `Blocked redirect to private address: ${nextUrl}` };
    }

    try {
        const nextResponse = await makeRequest(nextUrl, torAgent, originalUrl);

        if (nextResponse.status >= 300 && nextResponse.status < 400) {
            return await followRedirects(nextUrl, nextResponse, torAgent, depth + 1);
        }

        const html = await decompressStream(nextResponse);
        if (html === null) {
            return { url: nextUrl, error: "Response exceeded size limit" };
        }

        return buildResult(nextUrl, nextResponse, html);

    } catch (error) {
        return { url: nextUrl, error: error.message };
    }
}

/**
 * Constructs a normalised fetch result object from a completed response.
 *
 * @param {string} url                              - Final URL after any redirects
 * @param {import("axios").AxiosResponse} response  - Completed HTTP response
 * @param {string} html                             - Decompressed response body
 * @returns {{url: string, status: number, server: string|null, poweredBy: string|null, html: string}}
 */
function buildResult(url, response, html) {
    return {
        url,
        status:    response.status,
        server:    response.headers["server"]       ?? null,
        poweredBy: response.headers["x-powered-by"] ?? null,
        html,
    };
}

/**
 * Decompresses a response stream while enforcing two independent size caps:
 *   1. MAX_COMPRESSED_BYTES — applied to the raw compressed stream
 *   2. MAX_RESPONSE_SIZE    — applied to the decompressed output
 * Both caps protect against gzip bomb attacks.
 *
 * Supports gzip, deflate, and brotli. Brotli is included because we now
 * advertise `br` in Accept-Encoding — if we only supported gzip/deflate,
 * real browsers would look suspicious by comparison.
 *
 * @async
 * @param {import("axios").AxiosResponse} response - Streaming HTTP response
 * @returns {Promise<string|null>} - Decoded response body, or null if a cap was exceeded
 */
async function decompressStream(response) {
    const encoding = (response.headers["content-encoding"] || "").toLowerCase();

    const capped = await capStream(response.data, MAX_COMPRESSED_BYTES);
    if (capped === null) return null;

    let stream;
    if (encoding === "gzip" || encoding === "x-gzip") {
        stream = capped.pipe(zlib.createGunzip());
    } else if (encoding === "deflate") {
        stream = capped.pipe(zlib.createInflate());
    } else if (encoding === "br") {
        stream = capped.pipe(zlib.createBrotliDecompress());
    } else {
        stream = capped;
    }

    return readStream(stream, MAX_RESPONSE_SIZE);
}

/**
 * Wraps a readable stream in a PassThrough that hard-stops after maxBytes.
 * Returns null if the byte limit is exceeded before the stream ends.
 *
 * @param {import("stream").Readable} stream - Source stream to cap
 * @param {number} maxBytes                  - Maximum bytes to forward
 * @returns {Promise<import("stream").PassThrough|null>}
 */
function capStream(stream, maxBytes) {
    return new Promise((resolve) => {
        let total    = 0;
        let resolved = false;
        const pass   = new PassThrough();

        stream.on("data", (chunk) => {
            if (resolved) return;
            total += chunk.length;
            if (total > maxBytes) {
                resolved = true;
                stream.destroy();
                resolve(null);
                return;
            }
            pass.push(chunk);
        });

        stream.on("end",   () => { if (!resolved) { pass.end(); resolve(pass); } });
        stream.on("error", () => { if (!resolved) { resolved = true; resolve(null); } });
    });
}

/**
 * Reads a readable stream into a UTF-8 string.
 * Returns null if the total byte count exceeds maxBytes.
 *
 * @param {import("stream").Readable} stream - Stream to read
 * @param {number} maxBytes                  - Maximum decompressed bytes to accept
 * @returns {Promise<string|null>}
 */
function readStream(stream, maxBytes) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let total    = 0;

        stream.on("data", (chunk) => {
            total += chunk.length;
            if (total > maxBytes) {
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

module.exports = { fetchUrl, buildHeaders };
