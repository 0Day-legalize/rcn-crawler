/**
 * @file saveVisited.js
 * @description Persists the set of visited URLs to visited.json so crawl
 * progress survives process restarts.
 */

const fs   = require("node:fs");
const path = require("node:path");

/**
 * Absolute path of the visited URLs persistence file.
 * Exported so loadVisited.js can reference the same path without duplication.
 * @type {string}
 */
const OUTPUT_PATH = path.join(__dirname, "..", "..", "visited.json");

/**
 * Writes the current visited URL set to visited.json.
 * Called every VISITED_SAVE_INTERVAL pages during a crawl and once on completion.
 *
 * Output shape:
 * ```json
 * {
 *   "summary": { "totalVisited": N, "lastRunAt": "ISO" },
 *   "urls": [ ...sorted URL strings... ]
 * }
 * ```
 *
 * @param {Set<string>} visited - Complete set of visited URLs for this and previous runs
 * @returns {string}            - Absolute path of the written file
 */
function saveVisited(visited) {
    const final = {
        summary: {
            totalVisited: visited.size,
            lastRunAt:    new Date().toISOString(),
        },
        urls: [...visited].sort((a, b) => a.localeCompare(b)),
    };

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(final, null, 2), "utf-8");
    return OUTPUT_PATH;
}

module.exports = { saveVisited, OUTPUT_PATH };