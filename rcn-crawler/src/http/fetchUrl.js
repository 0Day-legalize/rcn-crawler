const axios  = require("axios");
const zlib   = require("node:zlib");
const { PassThrough } = require("node:stream");
const { TIMEOUT_MS, MAX_RESPONSE_SIZE, USER_AGENTS } = require("../config");
const { isOnion } = require("../utils/urls");
const { isSafeUrl } = require("../utils/ipSafety");

const MAX_REDIRECTS        = 5;
const MAX_COMPRESSED_BYTES = 2 * 1024 * 1024;  // 2MB compressed cap (gzip bomb protection)

function randomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function fetchUrl(url, torAgent) {
    // SSRF check before any network activity
    if (!(await isSafeUrl(url))) {
        return { url, error: "Blocked: URL resolves to a private/internal address" };
    }

    try {
        const response = await makeRequest(url, torAgent);

        // Handle redirects manually so we can SSRF-check each hop
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

async function makeRequest(url, torAgent) {
    const useTor = isOnion(url);
    return axios.get(url, {
        timeout:        TIMEOUT_MS,
        responseType:   "stream",
        validateStatus: () => true,
        maxRedirects:   0,          // manual redirect handling
        decompress:     false,      // manual decompression (gzip bomb protection)
        httpAgent:      useTor ? torAgent : undefined,
        httpsAgent:     useTor ? torAgent : undefined,
        headers: {
            "User-Agent":      randomUserAgent(),
            "Accept":          "text/html,application/xhtml+xml",
            "Accept-Encoding": "gzip, deflate",
        }
    });
}

// Follows up to MAX_REDIRECTS hops, SSRF-checking each Location header
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

    // SSRF check on every redirect destination
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

function buildResult(url, response, html) {
    return {
        url,
        status:    response.status,
        server:    response.headers["server"]       ?? null,
        poweredBy: response.headers["x-powered-by"] ?? null,
        html
    };
}

// Decompresses the response stream with two size caps:
//   1. MAX_COMPRESSED_BYTES — cap on raw compressed bytes (stops gzip bomb setup)
//   2. MAX_RESPONSE_SIZE    — cap on decompressed output  (stops memory explosion)
async function decompressStream(response) {
    const encoding = (response.headers["content-encoding"] || "").toLowerCase();

    // Cap compressed bytes first
    const capped = await capStream(response.data, MAX_COMPRESSED_BYTES);
    if (capped === null) return null;

    // Apply decompressor if needed
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

// Wraps a stream in a PassThrough that hard-stops after maxBytes
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

// Reads a stream to string, returning null if maxBytes exceeded
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