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
const net = require("node:net");
const cheerio = require("cheerio");
const axios = require("axios");
const { SocksProxyAgent } = require("socks-proxy-agent");

const DEBUG_LINKS = true;
const MAX_PAGES = 20;
const DELAY_MS = 1000;
const TIMEOUT_MS = 8000;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanUrls(fileContent) {
    const result = [];
    const lines = fileContent.split(/\r?\n/);

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
        try {
            const parsed = new URL(url);
            parsed.hostname = parsed.hostname.toLowerCase();
            parsed.hash = "";
            uniqueUrls.add(parsed.toString());
        } catch {
            console.log(`Skipping invalid seed URL: ${url}`);
        }
    }

    return uniqueUrls;
}

function buildQueue(finalUrls) {
    return [...finalUrls];
}

function isOnion(url) {
    try {
        const parsed = new URL(url);
        return parsed.hostname.endsWith(".onion");
    } catch {
        return false;
    }
}

function checkPort(port, host = "127.0.0.1", timeout = 1500) {
    return new Promise((resolve) => {
        const socket = new net.Socket();

        socket.setTimeout(timeout);

        socket.once("connect", () => {
            socket.destroy();
            resolve(true);
        });

        socket.once("error", () => {
            resolve(false);
        });

        socket.once("timeout", () => {
            socket.destroy();
            resolve(false);
        });

        socket.connect(port, host);
    });
}

async function findTorPort() {
    const ports = [9050, 9150];

    for (const port of ports) {
        const isOpen = await checkPort(port);
        if (isOpen) return port;
    }

    return null;
}

async function fetchUrl(url, torAgent) {
    try {
        const useTor = isOnion(url);

        const response = await axios.get(url, {
            timeout: TIMEOUT_MS,
            responseType: "text",
            validateStatus: () => true,
            maxRedirects: 5,
            httpAgent: useTor ? torAgent : undefined,
            httpsAgent: useTor ? torAgent : undefined
        });

        return {
            url,
            status: response.status,
            server: response.headers["server"] ?? null,
            poweredBy: response.headers["x-powered-by"] ?? null,
            html: response.data
        };
    } catch (error) {
        return {
            url,
            error: error.message
        };
    }
}

function parseUrl(rawHtml, baseUrl) {
    const $ = cheerio.load(rawHtml);
    const links = [];

    $("a[href]").each((_, element) => {
        const href = $(element).attr("href");

        try {
            const absolute = new URL(href, baseUrl);
            absolute.hostname = absolute.hostname.toLowerCase();
            absolute.hash = "";
            links.push(absolute.toString());
        } catch {
            // skip invalid href values
        }
    });

    return links;
}

function enqueueSameDomainLinks(links, queue, visited, queued, baseHost) {
    for (const link of links) {
        try {
            const parsed = new URL(link);

            if (parsed.hostname !== baseHost) continue;
            if (visited.has(link)) continue;
            if (queued.has(link)) continue;

            queue.push(link);
            queued.add(link);
        } catch {
            // skip invalid links
        }
    }
}

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
        }

        console.log("");
        await sleep(DELAY_MS);
    }

    return {
        processedCount,
        visitedCount: visited.size
    };
}

async function main() {
    const torPort = await findTorPort();

    if (!torPort) {
        console.error("Tor is not running on 127.0.0.1:9050 or 127.0.0.1:9150");
        console.error("Start Tor service or Tor Browser, then try again.");
        process.exit(1);
    }

    console.log(`Tor detected on port ${torPort}`);

    const torAgent = new SocksProxyAgent(`socks5h://127.0.0.1:${torPort}`);

    const filePath = path.join(__dirname, "urls.txt");
    const fileContent = fs.readFileSync(filePath, "utf-8");

    const cleaned = cleanUrls(fileContent);
    const finalUrls = normalizeUrls(cleaned);
    const queue = buildQueue(finalUrls);

    const result = await processQueue(queue, torAgent);

    console.log("Total processed:", result.processedCount);
    console.log("Total visited:", result.visitedCount);
}

if (require.main === module) {
    main().catch(console.error);
}
