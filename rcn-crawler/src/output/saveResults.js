/**
 * @file saveResults.js
 * @description Persists the full crawl result to results.json after each page
 * and as a final write at the end of a run.
 */

const fs   = require("node:fs");
const path = require("node:path");

/**
 * Serialises the current crawl state to results.json.
 * Overwrites the file on every call — the file always reflects the latest state.
 *
 * Output shape:
 * ```json
 * {
 *   "summary": { "processedCount": N, "visitedCount": N, "exportedAt": "ISO" },
 *   "pages": [ ...page result objects... ]
 * }
 * ```
 *
 * @param {{ processedCount: number, visitedCount: number, results: object[] }} result
 *   - processedCount: pages successfully fetched and parsed this run
 *   - visitedCount:   total URLs claimed (includes errors and robots blocks)
 *   - results:        array of per-page result objects built by processQueue
 * @returns {string} - Absolute path of the written file
 */
function saveResults(result) {
    const outputPath = path.join(__dirname, "..", "..", "results.json");

    const output = {
        summary: {
            processedCount: result.processedCount,
            visitedCount:   result.visitedCount,
            exportedAt:     new Date().toISOString(),
        },
        pages: result.results,
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");
    return outputPath;
}

module.exports = { saveResults };