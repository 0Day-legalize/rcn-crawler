/**
 * @file smartFetch.js
 * @description Two-layer fetch strategy:
 *
 *   1. axios (fast, low overhead) — tried first with exponential-backoff retries
 *   2. Puppeteer (JS-capable, heavier) — used when axios errors or returns
 *      content that appears to require JavaScript execution
 *
 * Callers receive the same result shape regardless of which layer succeeded.
 */

const { fetchUrl }          = require("./fetchUrl");
const { fetchWithPuppeteer } = require("./puppeteerFetch");
const { jitteredSleep }     = require("../utils/sleep");
const { log }               = require("../utils/logger");

/** Delays (ms) between successive axios retry attempts. */
const RETRY_DELAYS = [2000, 8000, 30000];

/** Transient network errors worth retrying before falling back to Puppeteer. */
const TRANSIENT_ERROR = /timeout|ECONNRESET|ECONNREFUSED|socket hang(ed)? up|ETIMEDOUT|EPIPE/i;

// ─────────────────────────────────────────────
// JS-render detection
// ─────────────────────────────────────────────

/**
 * Returns true when the HTML looks like it requires JavaScript to render.
 *
 * Heuristics (any one triggers the fallback):
 *   - Response body is very short (likely an empty shell)
 *   - Page explicitly tells the user to enable JavaScript
 *   - Stripping all tags leaves almost no readable text
 *
 * @param {string|undefined} html
 * @returns {boolean}
 */
function looksJsRendered(html) {
    if (!html || html.length < 250) return true;
    if (/enable javascript|javascript is required|please enable js|noscript/i.test(html)) {
        // Only trigger on noscript if the body outside it is near-empty
        const bodyText = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (bodyText.length < 150) return true;
    }
    // Strip all tags and check if meaningful text survives
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return text.length < 100;
}

// ─────────────────────────────────────────────
// Smart fetch
// ─────────────────────────────────────────────

/**
 * Fetches a URL using axios first; falls back to Puppeteer if axios fails
 * (after retries) or returns JS-rendered content.
 *
 * @async
 * @param {string} url
 * @param {object} agent    - SocksProxyAgent for the axios layer
 * @param {string|null} referrer
 * @param {number} torPort  - Tor port forwarded to Puppeteer for its proxy config
 * @returns {Promise<object>} fetchUrl-compatible result object
 */
async function smartFetch(url, agent, referrer, torPort) {
    let axiosResult;

    // ── Axios with retries ──────────────────────────────────────────────
    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
        axiosResult = await fetchUrl(url, agent, referrer);

        // Success and content looks real — done
        if (!axiosResult.error && !looksJsRendered(axiosResult.html)) {
            return axiosResult;
        }

        // Transient network error — retry before giving up
        if (axiosResult.error && attempt < RETRY_DELAYS.length && TRANSIENT_ERROR.test(axiosResult.error)) {
            log.warn(`axios retry ${attempt + 1}/${RETRY_DELAYS.length} for ${url}`, { error: axiosResult.error });
            await jitteredSleep(RETRY_DELAYS[attempt], 0.25);
            continue;
        }

        break; // non-transient error or JS-rendered — fall through to Puppeteer
    }

    // ── Puppeteer fallback ──────────────────────────────────────────────
    const reason = axiosResult.error ?? "JS-rendered content detected";
    log.info(`[puppeteer fallback] ${url}`, { reason });

    const puppeteerResult = await fetchWithPuppeteer(url, torPort, referrer);

    if (!puppeteerResult.error) return puppeteerResult;

    // Both layers failed — return axios result (usually more informative error)
    log.warn(`Both fetchers failed for ${url}`, { puppeteerError: puppeteerResult.error });
    return axiosResult;
}

module.exports = { smartFetch };
