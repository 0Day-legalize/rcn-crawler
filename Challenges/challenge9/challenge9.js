/*
🎯 Task
Upgrade your crawler so it:

Adds them back into the queue
BUT:
only if they are on the same domain
only if not already visited
Adds a limit (so it doesn’t crawl forever)
*/


const fs = require("node:fs");
const path = require("node:path");
const cheerio = require("cheerio");
const { SocksProxyAgent } = require("socks-proxy-agent");

const agent = new SocksProxyAgent("socks5h://127.0.0.1:9050");
const DEBUG_LINKS = true;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanUrls(fileContent) {
    const result = [];
    const lines = fileContent.split("\n");

    for (const line of lines) {
        const cleaned = line.trim();
        if (!cleaned) continue;
        result.push(cleaned);
    }

    return result;
}

function normalizeUrls(urls) {
    const uniqueUrls = new Set();

    for (const url of urls) {
        const parsed = new URL(url);
        parsed.hostname = parsed.hostname.toLowerCase();
        parsed.hash = "";

        const normalized = parsed.toString();
        uniqueUrls.add(normalized);
    }

    return uniqueUrls;
}

function buildQueue(finalUrls) {
    const queue = [];

    for (const url of finalUrls) {
        queue.push(url);
    }

    return queue;
}

function isOnion(url) {
    try {
        const parsed = new URL(url);
        return parsed.hostname.endsWith(".onion");
    } catch {
        return false;
    }
}

async function fetchUrl(url) {
    // creates a controller
    const controller = new AbortController();
    // abort if it takes to long
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
        const options = isOnion(url)
        // object being passed to fetch()
            ? { agent, signal: controller.signal }
        // connects the request to that controller
            : { signal: controller.signal };

        const response = await fetch(url, options);
        const html = await response.text();

        return {
            url,
            status: response.status,
            server: response.headers.get("server"),
            poweredBy: response.headers.get("x-powered-by"),
            html
        };
    } catch (error) {
        return {
            url,
            error: error.message
        };
    } finally {
        clearTimeout(timeout);
    }
}

function parseUrl(rawhtml, baseUrl) {
    const $ = cheerio.load(rawhtml);
    const links = [];

    $("a[href]").each((_, element) => {
        const href = $(element).attr("href");

        try {
            const absolute = new URL(href, baseUrl).toString();
            links.push(absolute);
        } catch {
            // skip invalid href values
        }
    });

    return links;
}

function enqueueSameDomainLinks(links, queue, visited, queued, baseHost) {
    for (const link of links) {
        try {
            const linkUrl = new URL(link);

            if (linkUrl.hostname !== baseHost) continue;
            if (visited.has(link)) continue;
            if (queued.has(link)) continue;

            queue.push(link);
            queued.add(link);
        } catch {
            // skip invalid
        }
    }
}

async function processQueue(queue) {
    const visited = new Set();
    const queued = new Set(queue);
    let count = 0;

    if (queue.length === 0) {
        return {
            processedCount: 0,
            visitedCount: 0
        };
    }

    const baseHost = new URL(queue[0]).hostname;
    const MAX_PAGES = 20;
    const DELAY_MS = 1000;

    while (queue.length > 0 && visited.size < MAX_PAGES) {
        const next = queue.shift();

        if (visited.has(next)) {
            console.log(`Skipping: ${next}`);
            console.log("");
            await sleep(DELAY_MS);
            continue;
        }

        visited.add(next);
        console.log(`Processing: ${next}`);

        const result = await fetchUrl(next);

        if (result.error) {
            console.log(`Fetch failed: ${result.error}`);
        } else {
            console.log(`Status: ${result.status}`);
            console.log(`Server: ${result.server}`);
            console.log(`X-Powered-By: ${result.poweredBy}`);

            const links = parseUrl(result.html, next);

            console.log(`Links found: ${links.length}`);

            if (DEBUG_LINKS) {
                for (const link of links) {
                    console.log(link);
                }
            }

            enqueueSameDomainLinks(links, queue, visited, queued, baseHost);
            count++;
        }

        console.log("");
        await sleep(DELAY_MS);
    }

    return {
        processedCount: count,
        visitedCount: visited.size
    };
}

async function main() {
    const filePath = path.join(__dirname, "urls.txt");
    const fileContent = fs.readFileSync(filePath, "utf-8");

    const cleaned = cleanUrls(fileContent);
    const finalUrls = normalizeUrls(cleaned);
    const queue = buildQueue(finalUrls);
    const result = await processQueue(queue);

    console.log("Total processed:", result.processedCount);
    console.log("Total visited:", result.visitedCount);
}

if (require.main === module) {
    main().catch(console.error);
}

main()