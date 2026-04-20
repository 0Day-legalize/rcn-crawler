/**
 * @file loadVisited.js
 * @description Reads previously visited URLs from visited.json on startup,
 * enabling the crawler to resume without re-crawling known pages.
 */

const fs                  = require("node:fs");
const { OUTPUT_PATH }     = require("./saveVisited");

/**
 * Loads the visited URL set from visited.json.
 *
 * Behaviour by state:
 * - File absent        → returns empty Set (first run)
 * - File unparseable   → logs a warning, returns empty Set
 * - Invalid structure  → logs a warning, returns empty Set
 * - Valid file         → filters out non-http(s) entries, logs dropped count, returns populated Set
 *
 * @returns {Set<string>} - Set of previously visited URLs safe to skip this run
 */
function loadVisited() {
    try {
        if (!fs.existsSync(OUTPUT_PATH)) return new Set();

        const raw    = fs.readFileSync(OUTPUT_PATH, "utf-8");
        const parsed = JSON.parse(raw);

        if (!parsed || !Array.isArray(parsed.urls)) {
            console.warn("[loadVisited] visited.json has unexpected structure — starting fresh");
            return new Set();
        }

        // Only accept valid http(s) URLs — drops corrupt or injected entries
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
            console.warn(
                `[loadVisited] Dropped ${parsed.urls.length - valid.length} invalid entries from visited.json`
            );
        }

        console.log(`Resuming — ${valid.length} URL(s) already visited from previous run(s)`);
        return new Set(valid);

    } catch {
        console.warn("[loadVisited] Could not read visited.json — starting fresh");
        return new Set();
    }
}

module.exports = { loadVisited };