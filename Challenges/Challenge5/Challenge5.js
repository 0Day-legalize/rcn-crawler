/*
🎯 Task

Create challenge5.js that:

Reads URLs from urls.txt
Cleans each line with .trim()
Ignores empty lines
Normalizes each URL:
lowercase hostname
remove fragment (#something)
Removes duplicates
Puts the final URLs into a queue
Processes the queue in FIFO order
Prints:
each URL as it is processed
how many URLs were processed total
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
    let count = 0;

    while (queue.length > 0) {
        const next = queue.shift();
        console.log("Processing:", next);
        count++;
    }

    return count;
}

function main() {
    const filePath = path.join(__dirname, "urls.txt");
    const fileContent = fs.readFileSync(filePath, "utf-8");

    const cleaned = cleanUrls(fileContent);
    const finalUrls = normalizeUrls(cleaned);
    const queue = buildQueue(finalUrls);
    const total = processQueue(queue);

    console.log("Total processed:", total);
}

if (require.main === module) {
    main();
}

main()