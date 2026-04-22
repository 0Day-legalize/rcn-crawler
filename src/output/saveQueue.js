/**
 * @file saveQueue.js
 * @description Persists the pending crawl queue to data/queue.json so that
 * interrupted runs can resume without losing discovered-but-unvisited URLs.
 */

const fs   = require("node:fs");
const path = require("node:path");
const { ensureDir } = require("../utils/compress");

const DATA_DIR   = path.join(__dirname, "..", "..", "data");
const OUTPUT_PATH = path.join(DATA_DIR, "queue.json");

/**
 * Atomically writes the current queue to data/queue.json.
 *
 * @param {Array<{url: string, baseHost: string, referrer?: string|null}>} queue
 * @returns {void}
 */
function saveQueue(queue) {
    ensureDir(DATA_DIR);

    const payload = {
        summary: { totalPending: queue.length, savedAt: new Date().toISOString() },
        items: queue,
    };

    const tmp = `${OUTPUT_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload), "utf-8");
    fs.renameSync(tmp, OUTPUT_PATH);
}

/**
 * Removes queue.json after a clean (non-interrupted) crawl completes.
 * @returns {void}
 */
function clearQueue() {
    try { fs.unlinkSync(OUTPUT_PATH); } catch { /* already absent */ }
}

module.exports = { saveQueue, clearQueue, OUTPUT_PATH };
