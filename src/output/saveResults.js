/**
 * @file saveResults.js
 * @description Persists the full crawl result to data/results.json.
 *
 * On every write, the previous results.json is compressed into
 * data/archive/results-<timestamp>.json.gz before being overwritten,
 * preserving a full history of every crawl run.
 * Only the most recent MAX_RESULTS_ARCHIVES snapshots are kept.
 */

const fs   = require("node:fs");
const path = require("node:path");
const { ensureDir, compressFile, pruneArchive } = require("../utils/compress");

/** @type {string} Directory for all live data files. */
const DATA_DIR = path.join(__dirname, "..", "..", "data");

/** @type {string} Directory for compressed snapshots of previous runs. */
const ARCHIVE_DIR = path.join(DATA_DIR, "archive");

/** @type {string} Absolute path of the live results file. */
const OUTPUT_PATH = path.join(DATA_DIR, "results.json");

/**
 * How many compressed results archives to retain in data/archive/.
 * @type {number}
 */
const MAX_RESULTS_ARCHIVES = 10;

/**
 * Serialises the current crawl state to data/results.json.
 *
 * If a previous results.json exists it is archived to
 * data/archive/results-<ISO>.json.gz before being overwritten.
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
 * @returns {string} - Absolute path of the written live file
 */
function saveResults(result) {
    ensureDir(DATA_DIR);
    ensureDir(ARCHIVE_DIR);

    if (fs.existsSync(OUTPUT_PATH)) {
        const ts      = new Date().toISOString().replaceAll(/[:.]/g, "-");
        const staging = path.join(DATA_DIR, `results-${ts}.json`);

        try {
            fs.renameSync(OUTPUT_PATH, staging);
            compressFile(staging, ARCHIVE_DIR)
                .then(() => pruneArchive(ARCHIVE_DIR, /^results-.*\.json\.gz$/, MAX_RESULTS_ARCHIVES))
                .catch((err) => process.stderr.write(`[saveResults] Archive error: ${err.message}\n`));
        } catch (err) {
            process.stderr.write(`[saveResults] Failed to stage previous results: ${err.message}\n`);
        }
    }

    const output = {
        summary: {
            processedCount: result.processedCount,
            visitedCount:   result.visitedCount,
            exportedAt:     new Date().toISOString(),
        },
        pages: result.results,
    };

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");
    return OUTPUT_PATH;
}

module.exports = { saveResults, OUTPUT_PATH };