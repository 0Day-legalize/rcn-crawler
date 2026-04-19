const fs = require("node:fs");
const path = require("node:path");

function saveResults(result) {
    const outputPath = path.join(__dirname, "..", "..", "results.json");

    const output = {
        summary: {
            processedCount: result.processedCount,
            visitedCount: result.visitedCount,
            exportedAt: new Date().toISOString()
        },
        pages: result.results
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");
    return outputPath;
}

module.exports = { saveResults };