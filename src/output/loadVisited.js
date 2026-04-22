/**
 * @file loadVisited.js
 * @description Reads previously visited URLs from data/visited.json on startup,
 * enabling the crawler to resume without re-crawling known pages.
 */

const fs              = require("node:fs");
const { log }         = require("../utils/logger");
const { OUTPUT_PATH } = require("./saveVisited");

/**
 * Loads the visited URL set from data/visited.json.
 *
 * Behaviour by state:
 * - File absent        → returns empty Set (first run)
 * - File unparseable   → logs a warning, returns empty Set
 * - Invalid structure  → logs a warning, returns empty Set
 * - Valid file         → filters out non-http(s) entries, logs dropped count,
 *                        returns populated Set
 *
 * @returns {Set<string>} - Set of previously visited URLs safe to skip this run
 */
function loadVisited() {
    try {
        if (!fs.existsSync(OUTPUT_PATH)) return new Set();

        const raw    = fs.readFileSync(OUTPUT_PATH, "utf-8");
        const parsed = JSON.parse(raw);

        if (!parsed || !Array.isArray(parsed.urls)) {
            log.warn("visited.json has unexpected structure — starting fresh");
            return new Set();
        }

        const valid = parsed.urls.filter((entry) => {
            if (typeof entry !== "string") return false;
            try {
                const { protocol } = new URL(entry);
                return protocol === "http:" || protocol === "https:";
            } catch {
                return false;
            }
        });

        if (valid.length !== parsed.urls.length) {
            log.warn("Dropped invalid entries from visited.json", {
                dropped: parsed.urls.length - valid.length,
            });
        }

        log.info("Resuming from previous run", { previouslyVisited: valid.length });
        return new Set(valid);

    } catch {
        log.warn("Could not read visited.json — starting fresh");
        return new Set();
    }
}

module.exports = { loadVisited };