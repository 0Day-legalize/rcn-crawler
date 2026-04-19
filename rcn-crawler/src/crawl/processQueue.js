const { DEBUG_LINKS, MAX_PAGES, DELAY_MS } = require("../config");
const { sleep } = require("../utils/sleep");
const { fetchUrl } = require("../http/fetchUrl");
const { parseLinks } = require("../parser/parseLinks");
const { enqueueSameDomainLinks } = require("./enqueueSameDomainLinks");

async function processQueue(queue, torAgent) {
    const visited = new Set();
    const queued = new Set(queue);
    let processedCount = 0;

    if (queue.length === 0) {
        return {
        processedCount: 0,
        visitedCount: 0
        };
    }

    const baseHost = new URL(queue[0]).hostname.toLowerCase();

    while (queue.length > 0 && visited.size < MAX_PAGES) {
        const next = queue.shift();
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
        console.log("");
        await sleep(DELAY_MS);
        continue;
    }

    console.log(`Status: ${result.status}`);
    console.log(`Server: ${result.server}`);
    console.log(`X-Powered-By: ${result.poweredBy}`);

    const links = parseLinks(result.html, next);

    console.log(`Links found: ${links.length}`);

    if (DEBUG_LINKS) {
        for (const link of links) {
            console.log(link);
        }
        }

        enqueueSameDomainLinks(links, queue, visited, queued, baseHost);

        console.log("");
        await sleep(DELAY_MS);
    }
    return {
        processedCount,
        visitedCount: visited.size
    };
}

module.exports = { processQueue };