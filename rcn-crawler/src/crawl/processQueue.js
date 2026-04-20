/**
 * @file processQueue.js
 * @description Multi-domain crawl dispatcher and per-domain worker.
 *
 * Architecture:
 *   processQueue   — top-level dispatcher; watches the shared queue and spawns
 *                    one crawlDomain worker per discovered domain.
 *   crawlDomain    — BFS worker for a single domain; pulls batches from the
 *                    shared queue, fetches pages, and enqueues discovered links.
 *
 * Concurrency model:
 *   - MAX_CONCURRENT_DOMAINS  controls how many domain workers run in parallel.
 *   - MAX_CONCURRENT_REQUESTS controls how many pages within one domain are
 *     fetched simultaneously.
 *   - Each domain gets its own SocksProxyAgent (separate Tor circuit).
 *   - All workers share a single queue, visited set, and counters object.
 */

const { SocksProxyAgent } = require("socks-proxy-agent");
const {
    DEBUG_LINKS,
    MAX_PAGES,
    DELAY_MS,
    DELAY_JITTER,
    MAX_CONCURRENT_DOMAINS,
    MAX_CONCURRENT_REQUESTS,
    VISITED_SAVE_INTERVAL,
} = require("../config");
const { sleep, jitteredSleep, Semaphore } = require("../utils/sleep");
const { fetchUrl }          = require("../http/fetchUrl");
const { parsePage }         = require("../parser/parseLinks");
const { enqueueLinks }      = require("./enqueueLinks");
const { saveResults }       = require("../output/saveResults");
const { saveVisited }       = require("../output/saveVisited");
const { getRobots }         = require("../robots/getRobots");
const { isAllowed }         = require("../robots/isAllowed");
const { TOR_HOST }          = require("../config");

// ─────────────────────────────────────────────
// Limit guard
// ─────────────────────────────────────────────

/**
 * Returns true when MAX_PAGES is set and the processed count has reached it.
 * When MAX_PAGES is 0 (unlimited), always returns false.
 *
 * @param {{ processed: number }} sharedCounters - Shared mutable counters object
 * @returns {boolean}
 */
function isAtLimit(sharedCounters) {
    return MAX_PAGES > 0 && sharedCounters.processed >= MAX_PAGES;
}

// ─────────────────────────────────────────────
// Result builders
// ─────────────────────────────────────────────

/**
 * Triggers an intermediate save of results.json.
 * Called after every page so the file is always up to date.
 *
 * @param {number}   processedCount - Pages successfully processed so far
 * @param {number}   visitedCount   - Total URLs claimed (including errors)
 * @param {object[]} results        - Array of per-page result objects
 * @returns {void}
 */
function saveProgress(processedCount, visitedCount, results) {
    saveResults({ processedCount, visitedCount, results });
}

/**
 * Builds a result object for a page that failed to fetch.
 *
 * @param {string} next     - URL that failed
 * @param {string} baseHost - Domain the URL belongs to
 * @param {string} error    - Error message from fetchUrl
 * @returns {{ url: string, baseHost: string, success: false, error: string, crawledAt: string }}
 */
function buildErrorResult(next, baseHost, error) {
    return { url: next, baseHost, success: false, error, crawledAt: new Date().toISOString() };
}

/**
 * Builds a result object for a page blocked by robots.txt.
 *
 * @param {string} next     - URL that was blocked
 * @param {string} baseHost - Domain the URL belongs to
 * @returns {{ url: string, baseHost: string, success: false, blockedByRobots: true, crawledAt: string }}
 */
function buildBlockedResult(next, baseHost) {
    return { url: next, baseHost, success: false, blockedByRobots: true, crawledAt: new Date().toISOString() };
}

/**
 * Builds a result object for a successfully crawled page.
 *
 * @param {string}   next              - URL that was crawled
 * @param {string}   baseHost          - Domain the URL belongs to
 * @param {object}   result            - Raw fetchUrl result (status, server, poweredBy, html)
 * @param {string[]} links             - All links parsed from the page (before filtering)
 * @param {string[]} enqueuedLinks     - Links actually enqueued after robots filtering
 * @param {string[]} downloads         - Downloadable file URLs found on the page
 * @param {import("./parseLinks").PageMeta} meta - Extracted page metadata
 * @returns {object}
 */
function buildSuccessResult(next, baseHost, result, links, enqueuedLinks, downloads, meta) {
    return {
        url: next, baseHost, success: true,
        status:           result.status,
        server:           result.server,
        poweredBy:        result.poweredBy,
        meta,
        linksFoundRaw:    links.length,
        linksFoundUnique: enqueuedLinks.length,
        links:            enqueuedLinks,
        downloads,
        crawledAt: new Date().toISOString(),
    };
}

/**
 * Prints extracted links to the console when DEBUG_LINKS is enabled.
 *
 * @param {string[]} links - Links to log
 * @returns {void}
 */
function logLinks(links) {
    if (!DEBUG_LINKS) return;
    for (const link of links) console.log(link);
}

// ─────────────────────────────────────────────
// Per-page handlers
// ─────────────────────────────────────────────

/**
 * Records a robots.txt block, saves progress, and waits DELAY_MS.
 *
 * @async
 * @param {string}   next           - Blocked URL
 * @param {string}   baseHost       - Domain of the blocked URL
 * @param {{ processed: number, sinceLastSave: number }} sharedCounters
 * @param {Set<string>}  sharedVisited
 * @param {object[]}     sharedResults
 * @returns {Promise<void>}
 */
async function handleBlockedByRobots(next, baseHost, sharedCounters, sharedVisited, sharedResults) {
    console.log(`Blocked by robots.txt: ${next}`);
    sharedResults.push(buildBlockedResult(next, baseHost));
    saveProgress(sharedCounters.processed, sharedVisited.size, sharedResults);
    console.log("");
    await jitteredSleep(DELAY_MS, DELAY_JITTER);
}

/**
 * Records a fetch error, saves progress, and waits DELAY_MS.
 *
 * @async
 * @param {string}   next           - URL that failed
 * @param {string}   baseHost       - Domain of the failed URL
 * @param {string}   error          - Error message
 * @param {{ processed: number, sinceLastSave: number }} sharedCounters
 * @param {Set<string>}  sharedVisited
 * @param {object[]}     sharedResults
 * @returns {Promise<void>}
 */
async function handleFetchError(next, baseHost, error, sharedCounters, sharedVisited, sharedResults) {
    console.log(`Fetch failed: ${error}`);
    sharedResults.push(buildErrorResult(next, baseHost, error));
    saveProgress(sharedCounters.processed, sharedVisited.size, sharedResults);
    console.log("");
    await jitteredSleep(DELAY_MS, DELAY_JITTER);
}

/**
 * Processes a successfully fetched page:
 * parses links and metadata, applies robots rules, enqueues new links,
 * records the result, and waits DELAY_MS.
 *
 * @async
 * @param {{
 *   next:           string,
 *   baseHost:       string,
 *   result:         object,
 *   sharedQueue:    Array<{url: string, baseHost: string}>,
 *   sharedVisited:  Set<string>,
 *   sharedQueued:   Set<string>,
 *   sharedCounters: { processed: number, sinceLastSave: number },
 *   sharedResults:  object[],
 *   domainAgent:    object
 * }} ctx - Crawl context for the current page
 * @returns {Promise<void>}
 */
async function handleSuccess(ctx) {
    const {
        next, baseHost, result,
        sharedQueue, sharedVisited, sharedQueued,
        sharedCounters, sharedResults, domainAgent,
    } = ctx;

    console.log(`Status: ${result.status}`);
    console.log(`Server: ${result.server}`);
    console.log(`X-Powered-By: ${result.poweredBy}`);

    const { links, downloads, meta } = parsePage(result.html, next);
    const robotsRules = await getRobots(baseHost, domainAgent);

    // Apply this domain's robots rules to same-domain links only.
    // Cross-domain links pass through — their own worker will check robots.
    const allowedLinks = [...new Set(
        links.filter((link) => {
            try {
                const linkHost = new URL(link).hostname.toLowerCase();
                if (linkHost === baseHost) return isAllowed(link, robotsRules);
                return true;
            } catch {
                return false;
            }
        })
    )];

    console.log(`Links found: ${links.length}`);
    console.log(`Allowed links: ${allowedLinks.length}`);
    console.log(`Downloads found: ${downloads.length}`);
    if (meta.title) console.log(`Title: ${meta.title}`);
    logLinks(allowedLinks);

    // Tag each newly discovered link with the page it was found on. The
    // worker reads this back off the queue item and emits a realistic
    // Referer header on the next request (see handleSuccess -> fetchUrl).
    enqueueLinks(allowedLinks, sharedQueue, sharedVisited, sharedQueued, next);

    sharedResults.push(buildSuccessResult(next, baseHost, result, links, allowedLinks, downloads, meta));
    saveProgress(sharedCounters.processed, sharedVisited.size, sharedResults);
    console.log("");
    await jitteredSleep(DELAY_MS, DELAY_JITTER);
}

// ─────────────────────────────────────────────
// Single-domain worker
// ─────────────────────────────────────────────

/**
 * BFS worker that crawls all reachable pages for a single domain.
 *
 * Pulls items for `baseHost` from the shared queue in batches of up to
 * MAX_CONCURRENT_REQUESTS, fetches them in parallel (guarded by a Semaphore),
 * and stops when no more unvisited items exist for this domain or the global
 * page limit is reached.
 *
 * Each domain worker uses its own SocksProxyAgent so Tor allocates a fresh
 * circuit per domain, preventing cross-domain traffic correlation.
 *
 * @async
 * @param {string} baseHost       - Hostname this worker is responsible for
 * @param {number} torPort        - Tor SOCKS5 port (used to create a fresh agent)
 * @param {{
 *   sharedQueue:    Array<{url: string, baseHost: string}>,
 *   sharedVisited:  Set<string>,
 *   sharedQueued:   Set<string>,
 *   sharedResults:  object[],
 *   sharedCounters: { processed: number, sinceLastSave: number }
 * }} shared - Shared state object passed to all workers
 * @returns {Promise<void>}
 */
async function crawlDomain(baseHost, torPort, shared) {
    const { sharedQueue, sharedVisited, sharedQueued, sharedResults, sharedCounters } = shared;
    const sem         = new Semaphore(MAX_CONCURRENT_REQUESTS);
    const domainAgent = new SocksProxyAgent(`socks5h://${TOR_HOST}:${torPort}`);

    console.log(`[${baseHost}] Worker started`);

    while (!isAtLimit(sharedCounters)) {
        // Find the next unvisited item for this domain in the shared queue
        const idx = sharedQueue.findIndex(
            (item) => item.baseHost === baseHost && !sharedVisited.has(item.url)
        );
        if (idx === -1) break;

        // Pull a batch of up to MAX_CONCURRENT_REQUESTS items
        const batch      = [];
        let   searchIdx  = idx;

        while (batch.length < MAX_CONCURRENT_REQUESTS) {
            const found = sharedQueue.findIndex(
                (item, i) => i >= searchIdx && item.baseHost === baseHost && !sharedVisited.has(item.url)
            );
            if (found === -1) break;
            const [item] = sharedQueue.splice(found, 1);
            batch.push(item);
            searchIdx = found;
        }

        if (batch.length === 0) break;

        await Promise.all(batch.map(async ({ url: next, referrer }) => {
            await sem.acquire();
            try {
                if (sharedVisited.has(next))     return;
                if (isAtLimit(sharedCounters))   return;

                const robotsRules = await getRobots(baseHost, domainAgent);

                if (!isAllowed(next, robotsRules)) {
                    await handleBlockedByRobots(next, baseHost, sharedCounters, sharedVisited, sharedResults);
                    return;
                }

                sharedVisited.add(next);
                sharedCounters.sinceLastSave++;

                // Batch visited.json writes to reduce disk I/O
                if (sharedCounters.sinceLastSave >= VISITED_SAVE_INTERVAL) {
                    saveVisited(sharedVisited);
                    sharedCounters.sinceLastSave = 0;
                }

                console.log(`[${baseHost}] Processing: ${next}`);
                // `referrer` is the URL of the page that linked to `next`, set by
                // enqueueLinks when the link was discovered. fetchUrl uses it to
                // build a strict-origin-when-cross-origin Referer header.
                const result = await fetchUrl(next, domainAgent, referrer);

                if (result.error) {
                    await handleFetchError(next, baseHost, result.error, sharedCounters, sharedVisited, sharedResults);
                    return;
                }

                sharedCounters.processed++;

                await handleSuccess({
                    next, baseHost, result,
                    sharedQueue, sharedVisited, sharedQueued,
                    sharedCounters, sharedResults, domainAgent,
                });

            } finally {
                sem.release();
            }
        }));
    }

    console.log(`[${baseHost}] Done`);
}

// ─────────────────────────────────────────────
// Dispatcher
// ─────────────────────────────────────────────

/**
 * Orchestrates the full crawl across all domains.
 *
 * Watches the shared queue in a loop and spawns a crawlDomain worker whenever
 * a domain appears that does not already have an active worker.
 * The loop exits only when both conditions are true:
 *   1. No pending items exist in the queue for any worker-less domain
 *   2. No workers are currently running
 *
 * This guarantees that links discovered mid-crawl (including cross-domain ones)
 * are always processed before the crawl is considered complete.
 *
 * @async
 * @param {{
 *   queue:             Array<{url: string, baseHost: string}>,
 *   torPort:           number,
 *   preloadedVisited?: Set<string>
 * }} options
 *   - queue:             Seed URLs built from urls.txt
 *   - torPort:           Tor SOCKS5 port detected at startup
 *   - preloadedVisited:  Previously visited URLs loaded from visited.json
 * @returns {Promise<{ processedCount: number, visitedCount: number, results: object[] }>}
 */
async function processQueue({ queue, torPort, preloadedVisited = new Set() }) {
    if (!queue || queue.length === 0) {
        return { processedCount: 0, visitedCount: 0, results: [] };
    }

    // ── Shared state ──────────────────────────────────────────────────────
    const sharedQueue    = [...queue];
    const sharedVisited  = new Set(preloadedVisited);
    const sharedQueued   = new Set(queue.map(i => i.url));
    const sharedResults  = [];
    const sharedCounters = { processed: 0, sinceLastSave: 0 };

    const shared = { sharedQueue, sharedVisited, sharedQueued, sharedResults, sharedCounters };

    const activeWorkers  = new Set();
    const domainSem      = new Semaphore(MAX_CONCURRENT_DOMAINS);
    const workerPromises = [];

    console.log(`Starting crawl — up to ${MAX_CONCURRENT_DOMAINS} domains in parallel`);
    console.log(`Running indefinitely until no more links are found\n`);

    // ── Dispatcher loop ───────────────────────────────────────────────────
    while (!isAtLimit(sharedCounters)) {
        // Find a domain with queued items and no active worker
        const pending = sharedQueue.find(
            (item) => !activeWorkers.has(item.baseHost) && !sharedVisited.has(item.url)
        );

        if (!pending) {
            if (activeWorkers.size === 0) break; // queue empty, all workers done
            await sleep(100);                    // workers running — re-check shortly
            continue;
        }

        const { baseHost } = pending;
        activeWorkers.add(baseHost);

        const workerPromise = (async () => {
            await domainSem.acquire();
            try {
                await crawlDomain(baseHost, torPort, shared);
            } finally {
                domainSem.release();
                activeWorkers.delete(baseHost);
            }
        })();

        workerPromises.push(workerPromise);
        await sleep(50); // yield so the worker can start before the next dispatch cycle
    }

    await Promise.all(workerPromises);

    saveVisited(sharedVisited);

    if (MAX_PAGES > 0 && sharedCounters.processed >= MAX_PAGES) {
        console.log(`\nReached MAX_PAGES limit (${MAX_PAGES})`);
    } else {
        console.log(`\nNo more links found. Crawl complete.`);
    }

    console.log(`Total processed: ${sharedCounters.processed}`);
    console.log(`Total visited:   ${sharedVisited.size}`);

    return {
        processedCount: sharedCounters.processed,
        visitedCount:   sharedVisited.size,
        results:        sharedResults,
    };
}

module.exports = { processQueue };