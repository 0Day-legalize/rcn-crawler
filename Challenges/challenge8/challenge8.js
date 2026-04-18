/*
🎯 Task

Create challenge8.js that:

Reads URLs from urls.txt
Cleans each line with .trim()
Ignores empty lines
Normalizes each URL:
lowercase hostname
remove fragment
Removes duplicates
Puts the final URLs into a queue
Processes the queue in FIFO order
Uses a visited Set
Fetches each URL with fetch()
Parses the returned HTML with Cheerio
Extracts all links from: a href

Prints for each URL:
Processing: <url>
Status: <status>
extracted links
Prints total processed and total visited
*/

const fs = require("node:fs");
const path = require("node:path");
const cheerio = require("cheerio");

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

async function fetchUrl(url) {
    try {
        const response = await fetch(url);
        const html = await response.text();

        return {
            url,
            status: response.status,
            html
        };
    } catch (error) {
        return {
            url,
            error: error.message
        };
    }
}

function parseUrl(rawhtml, baseUrl) {
    const $ = cheerio.load(rawhtml);
    const links = [];

    $("a[href]").each((index, element) => {
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

async function processQueue(queue) {
    const visited = new Set();
    let count = 0;

    while (queue.length > 0) {
        const next = queue.shift();

        if (visited.has(next)) {
            console.log("Skipping:", next);
            continue;
        }

        visited.add(next);
        console.log("Processing:", next);

        const result = await fetchUrl(next);

        if (result.error) {
            console.log("Fetch failed:", result.error);
        } else {
            console.log("Status:", result.status);

            const links = parseUrl(result.html, next);
            console.log("Links found:");

            for (const link of links) {
                console.log(link);
            }

            count++;
        }

        console.log("");
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
