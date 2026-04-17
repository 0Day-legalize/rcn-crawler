/*
🎯 Task

Create challenge4.js that:

Reads URLs from urls.txt
Cleans each line with .trim()
Ignores empty lines
Normalizes each URL:
lowercase hostname
remove fragment (#something)
Removes duplicates
Prints:
each final URL
total count of unique URLs
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

function getUrlData(urls) {
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

function main() {
    const filePath = path.join(__dirname, "urls.txt");
    const fileContent = fs.readFileSync(filePath, "utf-8");

    const cleaned = cleanUrls(fileContent);
    const finalUrls = getUrlData(cleaned);

    for (const url of finalUrls) {
        console.log(url);
    }

    console.log("\nUnique URLs:", finalUrls.size);
}

if (require.main === module) {
    main();
}

main()