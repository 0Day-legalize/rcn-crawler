const fs = require("node:fs");
const path = require("node:path");

function saveUniqueLinks(result) {
    const outputPath = path.join(__dirname, "..", "..", "unique-links.json");

    const grouped = {};

    for (const page of result.results) {
        if (!page.baseHost || !page.links) continue;

        const baseKey = new URL(page.url).origin;

        if (!grouped[baseKey]) {
            grouped[baseKey] = new Set();
        }

        for (const link of page.links) {
            grouped[baseKey].add(link);
        }
    }

    // convert Sets → Arrays
    const output = {};

    for (const key in grouped) {
        output[key] = [...grouped[key]].sort();
    }

    const final = {
        summary: {
            totalDomains: Object.keys(output).length,
            totalUniqueLinks: Object.values(output)
                .reduce((acc, arr) => acc + arr.length, 0),
            exportedAt: new Date().toISOString()
        },
        domains: output
    };

    fs.writeFileSync(outputPath, JSON.stringify(final, null, 2), "utf-8");
    return outputPath;
}

module.exports = { saveUniqueLinks };