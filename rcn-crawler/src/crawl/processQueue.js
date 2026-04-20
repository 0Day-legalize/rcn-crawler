const { SocksProxyAgent } = require("socks-proxy-agent");
const {
    DEBUG_LINKS,
    MAX_PAGES,
    DELAY_MS,
    MAX_CONCURRENT_DOMAINS,
    MAX_CONCURRENT_REQUESTS,
    VISITED_SAVE_INTERVAL
} = require("../config");
const { sleep, Semaphore } = require("../utils/sleep");
const { fetchUrl } = require("../http/fetchUrl");
const { parseLinks } = require("../parser/parseLinks");
const { enqueueLinks } = require("./enqueueLinks");
const { saveResults } = require("../output/saveResults");
const { saveVisited } = require("../output/saveVisited");
const { getRobots } = require("../robots/getRobots");
const { isAllowed } = require("../robots/isAllowed");
const { TOR_HOST } = require("../config");


// Returns true if MAX_PAGES is set and we've hit or exceeded it
function isAtLimit(sharedCounters) {
    return MAX_PAGES > 0 && sharedCounters.processed >= MAX_PAGES;
}

// ─────────────────────────────────────────────
// Result builders
// ─────────────────────────────────────────────

function saveProgress(processedCount, visitedCount, results) {
    saveResults({ processedCount, visitedCount, results });
}

function buildErrorResult(next, baseHost, error) {
    return { url: next, baseHost, success: false, error, crawledAt: new Date().toISOString() };
}

function buildBlockedResult(next, baseHost) {
    return { url: next, baseHost, success: false, blockedByRobots: true, crawledAt: new Date().toISOString() };
}

function buildSuccessResult(next, baseHost, result, links, enqueuedLinks) {
    return {
        url: next, baseHost, success: true,
        status: result.status, server: result.server, poweredBy: result.poweredBy,
        linksFoundRaw: links.length,
        linksFoundUnique: enqueuedLinks.length,
        links: enqueuedLinks,
        crawledAt: new Date().toISOString()
    };
}

function logLinks(links) {
    if (!DEBUG_LINKS) return;
    for (const link of links) console.log(link);
}

// ─────────────────────────────────────────────
// Per-page handlers
// ─────────────────────────────────────────────

async function handleBlockedByRobots(next, baseHost, sharedCounters, sharedVisited, sharedResults) {
    console.log(`Blocked by robots.txt: ${next}`);
    sharedResults.push(buildBlockedResult(next, baseHost));
    saveProgress(sharedCounters.processed, sharedVisited.size, sharedResults);
    console.log("");
    await sleep(DELAY_MS);
}

async function handleFetchError(next, baseHost, error, sharedCounters, sharedVisited, sharedResults) {
    console.log(`Fetch failed: ${error}`);
    sharedResults.push(buildErrorResult(next, baseHost, error));
    saveProgress(sharedCounters.processed, sharedVisited.size, sharedResults);
    console.log("");
    await sleep(DELAY_MS);
}

async function handleSuccess(ctx) {
    const {
        next, baseHost, result,
        sharedQueue, sharedVisited, sharedQueued,
        sharedCounters, sharedResults, domainAgent
    } = ctx;

    console.log(`Status: ${result.status}`);
    console.log(`Server: ${result.server}`);
    console.log(`X-Powered-By: ${result.poweredBy}`);

    const links = parseLinks(result.html, next);
    const robotsRules = await getRobots(baseHost, domainAgent);

    // Same-domain links — apply this domain's robots rules
    // Cross-domain links — pass through, their own worker will check robots
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
    logLinks(allowedLinks);

    enqueueLinks(allowedLinks, sharedQueue, sharedVisited, sharedQueued);

    sharedResults.push(buildSuccessResult(next, baseHost, result, links, allowedLinks));
    saveProgress(sharedCounters.processed, sharedVisited.size, sharedResults);
    console.log("");
    await sleep(DELAY_MS);
}

// ─────────────────────────────────────────────
// Single-domain worker
// Runs until no more unvisited URLs exist for
// this domain in the shared queue.
// ─────────────────────────────────────────────

async function crawlDomain(baseHost, torPort, shared) {
    const { sharedQueue, sharedVisited, sharedQueued, sharedResults, sharedCounters } = shared;
    const sem = new Semaphore(MAX_CONCURRENT_REQUESTS);
    const domainAgent = new SocksProxyAgent(`socks5h://${TOR_HOST}:${torPort}`);

    console.log(`[${baseHost}] Worker started`);

    // Keep going until there's nothing left for this domain (or limit hit)
    while (!isAtLimit(sharedCounters)) {
        const idx = sharedQueue.findIndex(
            (item) => item.baseHost === baseHost && !sharedVisited.has(item.url)
        );
        if (idx === -1) break;

        // Pull a batch for this domain
        const batch = [];
        let searchIdx = idx;
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

        await Promise.all(batch.map(async ({ url: next }) => {
            await sem.acquire();
            try {
                if (sharedVisited.has(next)) return;
                if (isAtLimit(sharedCounters)) return;

                const robotsRules = await getRobots(baseHost, domainAgent);

                if (!isAllowed(next, robotsRules)) {
                    await handleBlockedByRobots(next, baseHost, sharedCounters, sharedVisited, sharedResults);
                    return;
                }

                sharedVisited.add(next);
                sharedCounters.sinceLastSave++;

                if (sharedCounters.sinceLastSave >= VISITED_SAVE_INTERVAL) {
                    saveVisited(sharedVisited);
                    sharedCounters.sinceLastSave = 0;
                }

                console.log(`[${baseHost}] Processing: ${next}`);
                const result = await fetchUrl(next, domainAgent);

                if (result.error) {
                    await handleFetchError(next, baseHost, result.error, sharedCounters, sharedVisited, sharedResults);
                    return;
                }

                sharedCounters.processed++;

                await handleSuccess({
                    next, baseHost, result,
                    sharedQueue, sharedVisited, sharedQueued,
                    sharedCounters, sharedResults, domainAgent
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
// Watches the shared queue and spawns a worker
// for each new domain as it appears.
// Stops only when the queue is empty AND all
// workers have finished — no link left uncrawled.
// ─────────────────────────────────────────────

async function processQueue({ queue, torPort, preloadedVisited = new Set() }) {
    if (!queue || queue.length === 0) {
        return { processedCount: 0, visitedCount: 0, results: [] };
    }

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

    // Dispatcher loop — runs until queue is empty AND no workers are active (or limit hit)
    while (!isAtLimit(sharedCounters)) {
        const pending = sharedQueue.find(
            (item) => !activeWorkers.has(item.baseHost) && !sharedVisited.has(item.url)
        );

        if (!pending) {
            // Nothing new to dispatch
            if (activeWorkers.size === 0) {
                // Queue empty, no workers running — truly done
                break;
            }
            // Workers still running — they may enqueue new domains, wait and re-check
            await sleep(100);
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
        await sleep(50);
    }

    await Promise.all(workerPromises);

    // Final visited.json flush
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
        results:        sharedResults
    };
}

module.exports = { processQueue };