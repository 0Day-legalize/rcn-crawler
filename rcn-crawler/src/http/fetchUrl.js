/**
 * @file fetchUrl.js
 * @description HTTP fetcher with SSRF protection, manual redirect handling,
 * gzip bomb defence, and response size capping.
 */

const axios           = require("axios");
const zlib            = require("node:zlib");
const { PassThrough } = require("node:stream");
const { TIMEOUT_MS, MAX_RESPONSE_SIZE, USER_AGENTS } = require("../config");
const { isOnion }   = require("../utils/urls");
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
 * Returns a random User-Agent string from the configured pool.
 * Called on every outgoing request to reduce fingerprinting.
 *
 * @returns {string} - A browser-style User-Agent header value
 */
function randomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Fetches a URL through Tor, enforcing SSRF protection, redirect safety,
 * and response size limits.
 *
 * @async
 * @param {string} url       - Absolute URL to fetch
 * @param {object} torAgent  - SOCKS5 proxy agent (SocksProxyAgent instance)
 * @returns {Promise<{url: string, status?: number, server?: string|null, poweredBy?: string|null, html?: string, error?: string}>}
 */
async function fetchUrl(url, torAgent) {
    if (!(await isSafeUrl(url))) {
        return { url, error: "Blocked: URL resolves to a private/internal address" };
    }

    try {
        const response = await makeRequest(url, torAgent);

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
 * @param {string} url      - Absolute URL to request
 * @param {object} torAgent - SOCKS5 proxy agent
 * @returns {Promise<import("axios").AxiosResponse>}
 */
async function makeRequest(url, torAgent) {
    const useTor = isOnion(url);
    return axios.get(url, {
        timeout:        TIMEOUT_MS,
        responseType:   "stream",
        validateStatus: () => true,
        maxRedirects:   0,       // redirects are handled manually (SSRF check per hop)
        decompress:     false,   // decompression handled manually (gzip bomb protection)
        httpAgent:      useTor ? torAgent : undefined,
        httpsAgent:     useTor ? torAgent : undefined,
        headers: {
            "User-Agent":      randomUserAgent(),
            "Accept":          "text/html,application/xhtml+xml",
            "Accept-Encoding": "gzip, deflate",
        },
    });
}

/**
 * Follows a redirect chain up to MAX_REDIRECTS hops, performing an SSRF
 * check on every Location header before issuing the next request.
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
        const nextResponse = await makeRequest(nextUrl, torAgent);

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

module.exports = { fetchUrl };