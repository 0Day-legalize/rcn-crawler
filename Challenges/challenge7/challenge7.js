/*
🎯 Task

Create challenge7.js that:

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
Prints for each URL:
Processing: <url>
Status: <status code>
Prints at the end:
total processed
total visited
*/

const fs = require("node:fs");
const path = require("node:path");

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
        return {
            url,
            status: response.status
        };
    } catch (error) {
        return {
            url,
            error: error.message
        };
    }
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
