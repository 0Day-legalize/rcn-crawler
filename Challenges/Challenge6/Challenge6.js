/*
🎯 Task

Create challenge6.js that:

Reads URLs from urls.txt
Cleans each line with .trim()
Ignores empty lines
Normalizes each URL:
lowercase hostname
remove fragment (#something)
Removes duplicates
Puts the final URLs into a queue
Processes the queue in FIFO order
Uses a visited Set
Skips URLs that were already visited
Prints:
each URL as it is processed
when a URL is skipped because it was already visited
total processed count
total visited count
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

function processQueue(queue) {
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
        count++;
    }

    return {
        processedCount: count,
        visitedCount: visited.size
    };
}


function main() {
    const filePath = path.join(__dirname, "urls.txt");
    const fileContent = fs.readFileSync(filePath, "utf-8");

    const cleaned = cleanUrls(fileContent);
    const finalUrls = normalizeUrls(cleaned);
    const queue = buildQueue(finalUrls);
    const result = processQueue(queue);

    console.log("Total processed:", result.processedCount);
    console.log("Total visited:", result.visitedCount);
}

if (require.main === module) {
    main();
}

main()