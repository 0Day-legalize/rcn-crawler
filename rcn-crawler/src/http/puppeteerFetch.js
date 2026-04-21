/**
 * @file puppeteerFetch.js
 * @description Puppeteer-based fetcher used as a fallback when axios cannot
 * retrieve meaningful content (JS-rendered pages, bot-gated responses, etc.).
 *
 * A single Chromium instance is shared across all calls and lazily launched on
 * first use. It is routed through the same Tor SOCKS5 proxy as the axios layer,
 * so all traffic — including Puppeteer navigations — exits through Tor.
 *
 * Stealth hardening (via puppeteer-extra-plugin-stealth) removes the most
 * common automation fingerprints: navigator.webdriver, Chrome runtime leaks,
 * iframe contentWindow checks, etc.
 */

const puppeteerExtra  = require("puppeteer-extra");
const StealthPlugin   = require("puppeteer-extra-plugin-stealth");
const { USER_AGENT_PROFILES, ACCEPT_LANGUAGES, TIMEOUT_MS } = require("../config");
const { log } = require("../utils/logger");

puppeteerExtra.use(StealthPlugin());

/** @type {import("puppeteer").Browser|null} */
let browser     = null;
let activeTorPort = null;

// ─────────────────────────────────────────────
// Browser lifecycle
// ─────────────────────────────────────────────

/**
 * Returns (or lazily launches) the shared Chromium instance.
 * If the browser has crashed or was closed, a fresh one is launched.
 *
 * @param {number} torPort
 * @returns {Promise<import("puppeteer").Browser>}
 */
async function getBrowser(torPort) {
    if (browser && activeTorPort === torPort) {
        try {
            await browser.version(); // throws if the process is gone
            return browser;
        } catch {
            browser = null;
        }
    }

    log.info("Launching Puppeteer browser");
    browser = await puppeteerExtra.launch({
        headless: true,
        args: [
            `--proxy-server=socks5://127.0.0.1:${torPort}`,
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
        ],
    });
    activeTorPort = torPort;

    browser.once("disconnected", () => {
        log.warn("Puppeteer browser disconnected");
        browser = null;
    });

    return browser;
}

/**
 * Closes the shared browser. Call on clean exit or SIGINT.
 * @returns {Promise<void>}
 */
async function closeBrowser() {
    if (browser) {
        log.info("Closing Puppeteer browser");
        await browser.close().catch(() => {});
        browser = null;
    }
}

// ─────────────────────────────────────────────
// Profile helpers
// ─────────────────────────────────────────────

/**
 * Picks a random Chrome profile from the pool.
 * Puppeteer uses Chromium, so only Chrome profiles are appropriate here.
 *
 * @returns {object}
 */
function pickChromeProfile() {
    const chrome = USER_AGENT_PROFILES.filter(p => p.browser === "chrome");
    return chrome[Math.floor(Math.random() * chrome.length)];
}

/** @returns {string} */
function pickAcceptLanguage() {
    return ACCEPT_LANGUAGES[Math.floor(Math.random() * ACCEPT_LANGUAGES.length)];
}

// ─────────────────────────────────────────────
// Fetch
// ─────────────────────────────────────────────

/**
 * Fetches a URL using a headless Chromium browser routed through Tor.
 * Returns the fully JS-rendered HTML.
 *
 * @async
 * @param {string} url
 * @param {number} torPort
 * @param {string|null} referrer
 * @returns {Promise<{url: string, status?: number, server?: string|null, poweredBy?: string|null, html?: string, error?: string}>}
 */
async function fetchWithPuppeteer(url, torPort, referrer) {
    let page;
    try {
        const b       = await getBrowser(torPort);
        page          = await b.newPage();
        const profile = pickChromeProfile();

        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent(profile.ua);

        // Build extra headers consistent with the chosen profile
        const extra = {
            "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "Accept-Language": pickAcceptLanguage(),
            "Accept-Encoding": "gzip, deflate, br",
            "Connection":      "keep-alive",
            "Upgrade-Insecure-Requests": "1",
        };
        if (profile.secChUa) {
            extra["Sec-CH-UA"]          = profile.secChUa;
            extra["Sec-CH-UA-Mobile"]   = profile.secChUaMobile;
            extra["Sec-CH-UA-Platform"] = profile.secChUaPlatform;
        }
        if (referrer) extra["Referer"] = referrer;

        await page.setExtraHTTPHeaders(extra);

        // Capture response metadata from the main-frame navigation response
        let status    = null;
        let server    = null;
        let poweredBy = null;

        page.on("response", (response) => {
            if (response.frame() === page.mainFrame() && response.url() === page.url()) {
                status    = response.status();
                const h   = response.headers();
                server    = h["server"]       ?? null;
                poweredBy = h["x-powered-by"] ?? null;
            }
        });

        const response = await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout:   TIMEOUT_MS,
        });

        if (response) {
            status    = response.status();
            const h   = response.headers();
            server    = h["server"]       ?? null;
            poweredBy = h["x-powered-by"] ?? null;
        }

        // Give JS a moment to render after DOMContentLoaded
        await new Promise(r => setTimeout(r, 2000));

        const html     = await page.content();
        const finalUrl = page.url();

        return { url: finalUrl, status: status ?? 200, server, poweredBy, html };

    } catch (error) {
        return { url, error: `[puppeteer] ${error.message}` };
    } finally {
        if (page) await page.close().catch(() => {});
    }
}

module.exports = { fetchWithPuppeteer, closeBrowser };
