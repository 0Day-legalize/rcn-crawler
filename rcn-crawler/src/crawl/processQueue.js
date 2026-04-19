const { DEBUG_LINKS, MAX_PAGES, DELAY_MS } = require("../config");
const { sleep } = require("../utils/sleep");
const { fetchUrl } = require("../http/fetchUrl");
const { parseLinks } = require("../parser/parseLinks");
const { enqueueSameDomainLinks } = require("./enqueueSameDomainLinks");
const { saveResults } = require("../output/saveResults");

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

        visited.add(next);
        processedCount++;

        console.log(`Processing: ${next}`);

        const result = await fetchUrl(next, torAgent);

        if (result.error) {
            console.log(`Fetch failed: ${result.error}`);

            results.push({
                url: next,
                baseHost,
                success: false,
                error: result.error,
                crawledAt: new Date().toISOString()
            });

            saveResults({
                processedCount,
                visitedCount: visited.size,
                results
            });

            console.log("");
            await sleep(DELAY_MS);
            continue;
        }

        console.log(`Status: ${result.status}`);
        console.log(`Server: ${result.server}`);
        console.log(`X-Powered-By: ${result.poweredBy}`);

        const links = parseLinks(result.html, next);

        const uniqueSameDomainLinks = [...new Set(
            links.filter((link) => {
                try {
                    return new URL(link).hostname.toLowerCase() === baseHost;
                } catch {
                    return false;
                }
            })
        )];

        console.log(`Links found: ${links.length}`);
        console.log(`Unique same-domain links: ${uniqueSameDomainLinks.length}`);

        if (DEBUG_LINKS) {
            for (const link of uniqueSameDomainLinks) {
                console.log(link);
            }
        }

        enqueueSameDomainLinks(
            uniqueSameDomainLinks,
            queue,
            visited,
            queued,
            baseHost
        );

        results.push({
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
        });

        saveResults({
            processedCount,
            visitedCount: visited.size,
            results
        });

        console.log("");
        await sleep(DELAY_MS);
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