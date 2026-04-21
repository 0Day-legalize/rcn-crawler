/**
 * @file saveVisited.js
 * @description Persists the set of visited URLs to data/visited.json so crawl
 * progress survives process restarts.
 *
 * visited.json is a live operational file — it is read on every startup and
 * written every VISITED_SAVE_INTERVAL pages. It is NOT archived on each write
 * (that would be extremely wasteful for a file written every 10 pages).
 * It is simply overwritten in place; the resume logic in loadVisited.js is
 * robust to partial writes via atomic rename.
 */

const fs   = require("node:fs");
const path = require("node:path");
const { ensureDir } = require("../utils/compress");

/** @type {string} Directory for all live data files. */
const DATA_DIR = path.join(__dirname, "..", "..", "data");

/**
 * Absolute path of the visited URLs persistence file.
 * Exported so loadVisited.js can reference the same path without duplication.
 * @type {string}
 */
const OUTPUT_PATH = path.join(DATA_DIR, "visited.json");

/**
 * Writes the current visited URL set to data/visited.json atomically.
 * Uses a write-then-rename pattern so a crash mid-write never leaves a
 * corrupt file — the previous good version survives until the new one
 * is fully flushed.
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
    ensureDir(DATA_DIR);

    const final = {
        summary: {
            totalVisited: visited.size,
            lastRunAt:    new Date().toISOString(),
        },
        urls: [...visited].sort((a, b) => a.localeCompare(b)),
    };

    const tmp = `${OUTPUT_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(final, null, 2), "utf-8");
    fs.renameSync(tmp, OUTPUT_PATH); // atomic on most OS/FS combinations
    return OUTPUT_PATH;
}

module.exports = { saveVisited, OUTPUT_PATH };