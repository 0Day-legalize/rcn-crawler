const { DEBUG_LINKS, MAX_PAGES, DELAY_MS } = require("../config");
const { sleep } = require("../utils/sleep");
const { fetchUrl } = require("../http/fetchUrl");
const { parseLinks } = require("../parser/parseLinks");
const { enqueueSameDomainLinks } = require("./enqueueSameDomainLinks");
const { saveResults } = require("../output/saveResults");
const { getRobots } = require("../robots/getRobots");
const { isAllowed } = require("../robots/isAllowed");

function saveProgress(processedCount, visitedCount, results) {
    saveResults({
        processedCount,
        visitedCount,
        results
    });
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

    for (const link of links) {
        console.log(link);
    }
}

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
        next,
        baseHost,
        result,
        queue,
        visited,
        queued,
        processedCount,
        visitedCount,
        results,
        torAgent
    } = ctx;

    console.log(`Status: ${result.status}`);
    console.log(`Server: ${result.server}`);
    console.log(`X-Powered-By: ${result.poweredBy}`);

    const links = parseLinks(result.html, next);
    const robotsRules = await getRobots(next, torAgent);
    const uniqueSameDomainLinks = getUniqueAllowedSameDomainLinks(
        links,
        baseHost,
        robotsRules
    );

    console.log(`Links found: ${links.length}`);
    console.log(`Unique same-domain links: ${uniqueSameDomainLinks.length}`);

    logLinks(uniqueSameDomainLinks);

    enqueueSameDomainLinks(
        uniqueSameDomainLinks,
        queue,
        visited,
        queued,
        baseHost
    );

    results.push(
        buildSuccessResult(next, baseHost, result, links, uniqueSameDomainLinks)
    );

    saveProgress(processedCount, visitedCount, results);

    console.log("");
    await sleep(DELAY_MS);
}

async function processQueue(queue, torAgent) {
    const visited = new Set();
    const queued = new Set(queue.map((item) => item.url));
    const results = [];
    let processedCount = 0;

    if (queue.length === 0) {
        return {
            processedCount: 0,
            visitedCount: 0,
            results
        };
    }

    while (queue.length > 0 && visited.size < MAX_PAGES) {
        const current = queue.shift();
        const { url: next, baseHost } = current;

        queued.delete(next);

        if (visited.has(next)) {
            console.log(`Skipping duplicate: ${next}`);
            console.log("");
            await sleep(DELAY_MS);
            continue;
        }

        const robotsRules = await getRobots(next, torAgent);

        if (!isAllowed(next, robotsRules)) {
            await handleBlockedByRobots(
                next,
                baseHost,
                processedCount,
                visited.size,
                results
            );
            continue;
        }

        visited.add(next);
        processedCount++;

        console.log(`Processing: ${next}`);

        const result = await fetchUrl(next, torAgent);

        if (result.error) {
            await handleFetchError(
                next,
                baseHost,
                result.error,
                processedCount,
                visited.size,
                results
            );
            continue;
        }

        await handleSuccess({
            next,
            baseHost,
            result,
            queue,
            visited,
            queued,
            processedCount,
            visitedCount: visited.size,
            results,
            torAgent
        });
    }

    if (visited.size >= MAX_PAGES) {
        console.log(`Reached MAX_PAGES limit (${MAX_PAGES})`);
    } else if (queue.length === 0) {
        console.log("Queue is empty. Crawl finished.");
    }

    return {
        processedCount,
        visitedCount: visited.size,
        results
    };
}

module.exports = { processQueue };