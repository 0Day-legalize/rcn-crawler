/**
 * @file loadQueue.js
 * @description Reads the pending crawl queue from data/queue.json on startup,
 * enabling the crawler to resume from where it was interrupted.
 */

const fs              = require("node:fs");
const { log }         = require("../utils/logger");
const { OUTPUT_PATH } = require("./saveQueue");

/**
 * Loads the pending queue from data/queue.json.
 *
 * Returns null (not an empty array) when no saved queue exists, so callers
 * can distinguish "first run" from "resumed run with nothing left to do".
 *
 * @returns {Array<{url: string, baseHost: string, referrer?: string|null}>|null}
 */
function loadQueue() {
    try {
        if (!fs.existsSync(OUTPUT_PATH)) return null;

        const parsed = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf-8"));

        if (!parsed || !Array.isArray(parsed.items)) {
            log.warn("queue.json has unexpected structure — ignoring saved queue");
            return null;
        }

        const valid = parsed.items.filter(
            item => item && typeof item.url === "string" && typeof item.baseHost === "string"
        );

        if (valid.length !== parsed.items.length) {
            log.warn("Dropped malformed entries from queue.json", {
                dropped: parsed.items.length - valid.length,
            });
        }

        log.info("Resuming from saved queue", { pendingItems: valid.length });
        return valid;

    } catch {
        log.warn("Could not read queue.json — starting fresh");
        return null;
    }
}

module.exports = { loadQueue };
