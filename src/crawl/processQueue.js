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
 *   - Each domain gets its own SocksProxyAgent with unique SOCKS credentials,
 *     causing Tor to allocate a separate circuit per domain.
 *   - Circuits rotate every CIRCUIT_ROTATE_EVERY requests to limit correlation.
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
    CIRCUIT_ROTATE_EVERY,
    IGNORE_ROBOTS,
    ADAPTIVE_RATE,
    AUTO_COMPRESS,
    SEARCH_TERMS,
    SEARCH_TERMS_ONLY,
} = require("../config");
const { sleep, jitteredSleep, Semaphore } = require("../utils/sleep");
const { smartFetch }        = require("../http/smartFetch");
const { closeBrowser }      = require("../http/puppeteerFetch");
const { parsePage }         = require("../parser/parseLinks");
const { enqueueLinks }      = require("./enqueueLinks");
const { saveResults }       = require("../output/saveResults");
const { saveVisited }       = require("../output/saveVisited");
const { saveQueue, clearQueue } = require("../output/saveQueue");
const { generateGraph }     = require("../output/generateGraph");
const { notify }            = require("../utils/notify");
const { savePageContent, hashContent } = require("../output/savePageContent");
const { checkAndCompress }             = require("../utils/diskCheck");
const { getRobots }         = require("../robots/getRobots");
const { isAllowed }         = require("../robots/isAllowed");
const { TOR_HOST }          = require("../config");
const { log }               = require("../utils/logger");

// ─────────────────────────────────────────────
// Adaptive rate limiting
// ─────────────────────────────────────────────

/** Per-domain EWMA of response times (ms). */
const domainTiming = new Map();
const EWMA_ALPHA   = 0.3;
const MIN_DELAY    = 500;
const MAX_DELAY    = 10000;

function recordResponseTime(domain, ms) {
    const prev = domainTiming.get(domain) ?? { ewma: DELAY_MS, samples: 0 };
    prev.ewma    = EWMA_ALPHA * ms + (1 - EWMA_ALPHA) * prev.ewma;
    prev.samples++;
    domainTiming.set(domain, prev);
}

function adaptiveDelay(domain) {
    if (!ADAPTIVE_RATE) return DELAY_MS;
    const t = domainTiming.get(domain);
    if (!t || t.samples < 3) return DELAY_MS;
    return Math.max(MIN_DELAY, Math.min(MAX_DELAY, Math.round(t.ewma * 0.5)));
}

// ─────────────────────────────────────────────
// Search-term matching
// ─────────────────────────────────────────────

/**
 * Returns the list of search terms found in the page HTML, or an empty array.
 * When SEARCH_TERMS is empty every page is considered a match.
 *
 * @param {string} html
 * @returns {string[]}
 */
function matchedTerms(html) {
    if (SEARCH_TERMS.length === 0) return [];
    const lower = html.toLowerCase();
    return SEARCH_TERMS.filter(t => lower.includes(t));
}

// ─────────────────────────────────────────────
// Tor circuit helpers
// ─────────────────────────────────────────────

/**
 * Creates a new SocksProxyAgent with unique SOCKS5 credentials.
 *
 * Tor's IsolateSOCKSAuth feature (enabled by default) allocates a distinct
 * circuit for each unique username/password pair, so encoding the domain
 * and a timestamp into the username gives every new agent its own circuit
 * without touching the control port.
 *
 * @param {string} baseHost - Domain this agent will serve
 * @param {number} torPort  - Tor SOCKS5 port
 * @returns {SocksProxyAgent}
 */
function makeAgent(baseHost, torPort) {
    const id = `${encodeURIComponent(baseHost)}-${Date.now()}`;
    return new SocksProxyAgent(`socks5h://${id}:x@${TOR_HOST}:${torPort}`);
}

// ─────────────────────────────────────────────
// Retry logic
// ─────────────────────────────────────────────

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
function buildSuccessResult(next, baseHost, result, links, enqueuedLinks, downloads, meta, terms) {
    return {
        url: next, baseHost, success: true,
        status:           result.status,
        server:           result.server,
        poweredBy:        result.poweredBy,
        meta,
        matchedTerms:     terms,
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
    for (const link of links) log.debug(link);
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
    sharedCounters.blocked++;
    log.warn(`Blocked by robots.txt: ${next}`);
    sharedResults.push(buildBlockedResult(next, baseHost));
    saveProgress(sharedCounters.processed, sharedVisited.size, sharedResults);
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
    sharedCounters.failed++;
    log.warn(`Fetch failed: ${error}`, { url: next });
    sharedResults.push(buildErrorResult(next, baseHost, error));
    saveProgress(sharedCounters.processed, sharedVisited.size, sharedResults);
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
        next, baseHost, result, depth,
        sharedQueue, sharedVisited, sharedQueued,
        sharedCounters, sharedResults, sharedSeenHashes, domainAgent,
    } = ctx;

    log.info(`Status: ${result.status} | Server: ${result.server ?? "—"} | X-Powered-By: ${result.poweredBy ?? "—"}`, { url: next });

    // Content deduplication — hash the body before parsing
    const html         = result.html ?? "";
    const contentHash  = hashContent(html);
    const isDuplicate  = sharedSeenHashes.has(contentHash);

    if (!isDuplicate) {
        sharedSeenHashes.add(contentHash);
        savePageContent(html);
        if (AUTO_COMPRESS) checkAndCompress();
    } else {
        log.info(`Duplicate content (${contentHash}) — skipping page save`, { url: next });
    }

    const { links, downloads, meta } = parsePage(html, next);

    // Search-term matching — tag page and optionally restrict link following
    const terms        = matchedTerms(html);
    const termHit      = SEARCH_TERMS.length === 0 || terms.length > 0;
    if (terms.length > 0) log.info(`Search terms matched: ${terms.join(", ")}`, { url: next });

    // Apply this domain's robots rules to same-domain links only.
    // Cross-domain links pass through — their own worker will check robots.
    // Skipped entirely when IGNORE_ROBOTS is set.
    let allowedLinks;
    if (IGNORE_ROBOTS) {
        allowedLinks = [...new Set(links)];
    } else {
        const robotsRules = await getRobots(baseHost, domainAgent);
        allowedLinks = [...new Set(
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
    }

    log.info(`Links: ${links.length} found, ${allowedLinks.length} allowed, ${downloads.length} downloads${meta.title ? ` | "${meta.title}"` : ""}`, { url: next });
    logLinks(allowedLinks);

    // Only enqueue outbound links when search-terms-only is off or page matched
    if (termHit || !SEARCH_TERMS_ONLY) {
        enqueueLinks(allowedLinks, sharedQueue, sharedVisited, sharedQueued, next, depth);
    }

    const pageResult = buildSuccessResult(next, baseHost, result, links, allowedLinks, downloads, meta, terms);
    pageResult.contentHash = contentHash;
    pageResult.duplicate   = isDuplicate;
    sharedResults.push(pageResult);
    saveProgress(sharedCounters.processed, sharedVisited.size, sharedResults);
    await jitteredSleep(adaptiveDelay(baseHost), DELAY_JITTER);
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
 * Each domain worker uses SOCKS5 credential isolation so Tor allocates a
 * distinct circuit per domain, preventing cross-domain traffic correlation.
 * Circuits rotate every CIRCUIT_ROTATE_EVERY fetches to limit long-lived
 * circuit exposure.
 *
 * @async
 * @param {string} baseHost       - Hostname this worker is responsible for
 * @param {number} torPort        - Tor SOCKS5 port (used to create fresh agents)
 * @param {{
 *   sharedQueue:    Array<{url: string, baseHost: string}>,
 *   sharedVisited:  Set<string>,
 *   sharedQueued:   Set<string>,
 *   sharedResults:  object[],
 *   sharedCounters: { processed: number, sinceLastSave: number }
 * }} shared - Shared state object passed to all workers
 * @returns {Promise<void>}
 */
async function crawlDomain(baseHost, torPort, shared, isInterrupted) {
    const { sharedQueue, sharedVisited, sharedQueued, sharedResults, sharedSeenHashes, sharedCounters } = shared;
    const sem = new Semaphore(MAX_CONCURRENT_REQUESTS);

    let domainAgent          = makeAgent(baseHost, torPort);
    let requestsSinceRotate  = 0;

    log.info(`[${baseHost}] Worker started`);

    while (!isAtLimit(sharedCounters) && !isInterrupted()) {
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

        await Promise.all(batch.map(async ({ url: next, referrer, depth = 0 }) => {
            await sem.acquire();
            try {
                if (sharedVisited.has(next))   return;
                if (isAtLimit(sharedCounters)) return;

                if (!IGNORE_ROBOTS) {
                    const robotsRules = await getRobots(baseHost, domainAgent);
                    if (!isAllowed(next, robotsRules)) {
                        await handleBlockedByRobots(next, baseHost, sharedCounters, sharedVisited, sharedResults);
                        return;
                    }
                }

                sharedVisited.add(next);
                sharedCounters.sinceLastSave++;

                // Batch disk writes to reduce I/O — save both visited and queue together
                if (sharedCounters.sinceLastSave >= VISITED_SAVE_INTERVAL) {
                    saveVisited(sharedVisited);
                    saveQueue(sharedQueue);
                    sharedCounters.sinceLastSave = 0;
                }

                // Rotate Tor circuit after every CIRCUIT_ROTATE_EVERY requests
                if (requestsSinceRotate >= CIRCUIT_ROTATE_EVERY) {
                    domainAgent         = makeAgent(baseHost, torPort);
                    requestsSinceRotate = 0;
                    log.info(`[${baseHost}] Circuit rotated`);
                }
                requestsSinceRotate++;

                log.info(`[${baseHost}] Processing (depth ${depth}): ${next}`);
                const t0     = Date.now();
                const result = await smartFetch(next, domainAgent, referrer, torPort);
                recordResponseTime(baseHost, Date.now() - t0);

                if (result.error) {
                    await handleFetchError(next, baseHost, result.error, sharedCounters, sharedVisited, sharedResults);
                    return;
                }

                sharedCounters.processed++;

                await handleSuccess({
                    next, baseHost, result, depth,
                    sharedQueue, sharedVisited, sharedQueued,
                    sharedCounters, sharedResults, sharedSeenHashes, domainAgent,
                });

            } finally {
                sem.release();
            }
        }));
    }

    log.info(`[${baseHost}] Done`);
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
    const sharedQueue      = [...queue];
    const sharedVisited    = new Set(preloadedVisited);
    const sharedQueued     = new Set(queue.map(i => i.url));
    const sharedResults    = [];
    const sharedSeenHashes = new Set();
    const sharedCounters   = { processed: 0, sinceLastSave: 0, failed: 0, blocked: 0 };

    const shared = { sharedQueue, sharedVisited, sharedQueued, sharedResults, sharedSeenHashes, sharedCounters };

    const activeWorkers  = new Set();
    const domainSem      = new Semaphore(MAX_CONCURRENT_DOMAINS);
    const workerPromises = [];
    const startedAt      = Date.now();

    // ── Interrupt handling ────────────────────────────────────────────────
    // When Ctrl-C is pressed, stop accepting new work and flush state to disk
    // so the next run can resume from where we stopped.
    let interrupted = false;

    function flushState() {
        saveVisited(sharedVisited);
        saveQueue(sharedQueue);
        saveResults({ processedCount: sharedCounters.processed, visitedCount: sharedVisited.size, results: sharedResults });
    }

    process.once("SIGINT", () => {
        interrupted = true;
        log.info("SIGINT received — finishing active requests then saving state for resume...");
    });

    log.info(`Starting crawl — up to ${MAX_CONCURRENT_DOMAINS} domains in parallel, circuit rotation every ${CIRCUIT_ROTATE_EVERY} requests`);

    // ── Dispatcher loop ───────────────────────────────────────────────────
    while (!isAtLimit(sharedCounters) && !interrupted) {
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
                await crawlDomain(baseHost, torPort, shared, () => interrupted);
            } finally {
                domainSem.release();
                activeWorkers.delete(baseHost);
            }
        })();

        workerPromises.push(workerPromise);
        await sleep(50); // yield so the worker can start before the next dispatch cycle
    }

    await Promise.all(workerPromises);

    const domains     = new Set(sharedResults.map(r => r.baseHost).filter(Boolean)).size;
    const uniquePages = sharedSeenHashes.size;

    const notifyStats = {
        processedCount: sharedCounters.processed,
        visitedCount:   sharedVisited.size,
        domains,
        startedAt,
    };

    function logSummary() {
        log.info(
            `✓ ${sharedCounters.processed} ok  ` +
            `✗ ${sharedCounters.failed} failed  ` +
            `⊘ ${sharedCounters.blocked} blocked  ` +
            `📄 ${uniquePages} unique pages saved  ` +
            `🌐 ${domains} domains`
        );
    }

    if (interrupted) {
        flushState();
        await closeBrowser();
        log.info(`Interrupted — state saved. Resume with the same command to continue.`);
        log.info(`Queue remaining: ${sharedQueue.length}`);
        logSummary();
        await generateGraph();
        await notify(notifyStats);
        process.exit(0);
    }

    // Clean exit: persist final state and remove the queue file (nothing left to resume)
    saveVisited(sharedVisited);
    clearQueue();
    await closeBrowser();

    if (MAX_PAGES > 0 && sharedCounters.processed >= MAX_PAGES) {
        log.info(`Reached MAX_PAGES limit (${MAX_PAGES})`);
    } else {
        log.info("No more links found. Crawl complete.");
    }

    logSummary();
    await generateGraph();
    await notify(notifyStats);

    return {
        processedCount: sharedCounters.processed,
        visitedCount:   sharedVisited.size,
        results:        sharedResults,
    };
}

module.exports = { processQueue };
