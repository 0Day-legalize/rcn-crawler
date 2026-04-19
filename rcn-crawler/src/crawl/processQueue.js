const { DEBUG_LINKS, MAX_PAGES, DELAY_MS, MAX_CONCURRENT_DOMAINS, MAX_CONCURRENT_REQUESTS } = require("../config");
const { sleep, Semaphore } = require("../utils/sleep");
const { fetchUrl } = require("../http/fetchUrl");
const { parseLinks } = require("../parser/parseLinks");
const { enqueueSameDomainLinks } = require("./enqueueSameDomainLinks");
const { saveResults } = require("../output/saveResults");
const { getRobots } = require("../robots/getRobots");
const { isAllowed } = require("../robots/isAllowed");
const { saveVisited } = require("../output/saveVisited");

// ─────────────────────────────────────────────
// Result builders — unchanged from original
// ─────────────────────────────────────────────

function saveProgress(processedCount, visitedCount, results) {
    saveResults({ processedCount, visitedCount, results });
}

function buildErrorResult(next, baseHost, error) {
    return {
        url: next,
        baseHost,
        success: false,
        error,
        crawledAt: new Date().toISOString()
    };
}

function buildBlockedResult(next, baseHost) {
    return {
        url: next,
        baseHost,
        success: false,
        blockedByRobots: true,
        crawledAt: new Date().toISOString()
    };
}

function buildSuccessResult(next, baseHost, result, links, uniqueSameDomainLinks) {
    return {
        url: next,
        baseHost,
        success: true,
        status: result.status,
        server: result.server,
        poweredBy: result.poweredBy,
        linksFoundRaw: links.length,
        linksFoundUnique: uniqueSameDomainLinks.length,
        links: uniqueSameDomainLinks,
        crawledAt: new Date().toISOString()
    };
}

function getUniqueAllowedSameDomainLinks(links, baseHost, robotsRules) {
    return [...new Set(
        links.filter((link) => {
            try {
                const parsed = new URL(link);
                return (
                    parsed.hostname.toLowerCase() === baseHost &&
                    isAllowed(link, robotsRules)
                );
            } catch {
                return false;
            }
        })
    )];
}

function logLinks(links) {
    if (!DEBUG_LINKS) return;
    for (const link of links) console.log(link);
}

// ─────────────────────────────────────────────
// Per-page handlers — unchanged from original
// ─────────────────────────────────────────────

async function handleBlockedByRobots(next, baseHost, processedCount, visitedCount, results) {
    console.log(`Blocked by robots.txt: ${next}`);
    results.push(buildBlockedResult(next, baseHost));
    saveProgress(processedCount, visitedCount, results);
    console.log("");
    await sleep(DELAY_MS);
}

async function handleFetchError(next, baseHost, error, processedCount, visitedCount, results) {
    console.log(`Fetch failed: ${error}`);
    results.push(buildErrorResult(next, baseHost, error));
    saveProgress(processedCount, visitedCount, results);
    console.log("");
    await sleep(DELAY_MS);
}

async function handleSuccess(ctx) {
    const {
        next, baseHost, result,
        queue, visited, queued,
        processedCount, visitedCount,
        results, torAgent
    } = ctx;

    console.log(`Status: ${result.status}`);
    console.log(`Server: ${result.server}`);
    console.log(`X-Powered-By: ${result.poweredBy}`);

    const links = parseLinks(result.html, next);
    const robotsRules = await getRobots(baseHost, torAgent);
    const uniqueSameDomainLinks = getUniqueAllowedSameDomainLinks(links, baseHost, robotsRules);

    console.log(`Links found: ${links.length}`);
    console.log(`Unique same-domain links: ${uniqueSameDomainLinks.length}`);
    logLinks(uniqueSameDomainLinks);

    enqueueSameDomainLinks(uniqueSameDomainLinks, queue, visited, queued, baseHost);
    results.push(buildSuccessResult(next, baseHost, result, links, uniqueSameDomainLinks));
    saveProgress(processedCount, visitedCount, results);

    console.log("");
    await sleep(DELAY_MS);
}

// ─────────────────────────────────────────────
// Single-domain crawler
// Crawls one domain BFS-style with a per-domain
// request semaphore (MAX_CONCURRENT_REQUESTS).
// ─────────────────────────────────────────────

async function crawlDomain(domainQueue, torAgent, sharedVisited, sharedResults, sharedCounters) {
    const queue   = [...domainQueue];             // local BFS queue for this domain
    const queued  = new Set(queue.map(i => i.url));
    const sem     = new Semaphore(MAX_CONCURRENT_REQUESTS);

    const { baseHost } = queue[0];

    while (queue.length > 0 && sharedVisited.size < MAX_PAGES) {
        // Take up to MAX_CONCURRENT_REQUESTS items from the front
        const batch = [];
        while (queue.length > 0 && batch.length < MAX_CONCURRENT_REQUESTS) {
            const item = queue.shift();
            if (!item) break;

            queued.delete(item.url);

            if (sharedVisited.has(item.url)) {
                console.log(`Skipping duplicate: ${item.url}\n`);
                continue;
            }

            batch.push(item);
        }

        if (batch.length === 0) continue;

        // Run the batch concurrently, each slot guarded by the semaphore
        await Promise.all(batch.map(async ({ url: next }) => {
            await sem.acquire();
            try {
                const robotsRules = await getRobots(baseHost, torAgent);

                if (!isAllowed(next, robotsRules)) {
                    await handleBlockedByRobots(
                        next, baseHost,
                        sharedCounters.processed,
                        sharedVisited.size,
                        sharedResults
                    );
                    return;
                }

                // Re-check limit here — another concurrent task may have
                // already filled the last slot while this one was awaiting
                if (sharedVisited.size >= MAX_PAGES) return;

                sharedVisited.add(next);
                saveVisited(sharedVisited);
                sharedCounters.processed++;

                console.log(`Processing: ${next}`);

                const result = await fetchUrl(next, torAgent);

                if (result.error) {
                    await handleFetchError(
                        next, baseHost,
                        result.error,
                        sharedCounters.processed,
                        sharedVisited.size,
                        sharedResults
                    );
                    return;
                }

                await handleSuccess({
                    next,
                    baseHost,
                    result,
                    queue,       // local domain queue so new links stay in-domain
                    visited: sharedVisited,
                    queued,
                    processedCount: sharedCounters.processed,
                    visitedCount:   sharedVisited.size,
                    results:        sharedResults,
                    torAgent
                });
            } finally {
                sem.release();
            }
        }));
    }
}

// ─────────────────────────────────────────────
// Main entry point
// Groups seeds by domain, then runs each domain
// concurrently up to MAX_CONCURRENT_DOMAINS.
// ─────────────────────────────────────────────

async function processQueue(queue, torAgent, preloadedVisited = new Set()) {
    if (queue.length === 0) {
        return { processedCount: 0, visitedCount: 0, results: [] };
    }

    // Group seed items by domain
    const domainMap = new Map();
    for (const item of queue) {
        const d = item.baseHost;
        if (!domainMap.has(d)) domainMap.set(d, []);
        domainMap.get(d).push(item);
    }

    console.log(`Crawling ${domainMap.size} domain(s) — up to ${MAX_CONCURRENT_DOMAINS} in parallel\n`);

    // Shared state across all domain workers
    const sharedVisited  = new Set(preloadedVisited);  // seeded from previous runs
    const sharedResults  = [];
    const sharedCounters = { processed: 0 };

    // Build one task per domain
    const domainTasks = [...domainMap.values()].map(
        (domainQueue) => () => crawlDomain(domainQueue, torAgent, sharedVisited, sharedResults, sharedCounters)
    );

    // Run with a global domain concurrency cap
    const domainSem = new Semaphore(MAX_CONCURRENT_DOMAINS);
    await Promise.all(
        domainTasks.map(async (task) => {
            await domainSem.acquire();
            try { await task(); }
            finally { domainSem.release(); }
        })
    );

    if (sharedVisited.size >= MAX_PAGES) {
        console.log(`Reached MAX_PAGES limit (${MAX_PAGES})`);
    } else {
        console.log("All queues empty. Crawl finished.");
    }

    return {
        processedCount: sharedCounters.processed,
        visitedCount:   sharedVisited.size,
        results:        sharedResults
    };
}

module.exports = { processQueue };