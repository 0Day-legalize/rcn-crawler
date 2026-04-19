const fs   = require("node:fs");
const { OUTPUT_PATH } = require("./saveVisited");

function loadVisited() {
    try {
        if (!fs.existsSync(OUTPUT_PATH)) return new Set();

        const raw    = fs.readFileSync(OUTPUT_PATH, "utf-8");
        const parsed = JSON.parse(raw);

        // Schema validation — must have a urls array of strings
        if (!parsed || !Array.isArray(parsed.urls)) {
            console.warn("[loadVisited] visited.json has unexpected structure — starting fresh");
            return new Set();
        }

        // Filter out anything that isn't a valid http(s) URL
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
            console.warn(`[loadVisited] Dropped ${parsed.urls.length - valid.length} invalid entries from visited.json`);
        }

        console.log(`Resuming — ${valid.length} URL(s) already visited from previous run(s)`);
        return new Set(valid);

    } catch {
        console.warn("[loadVisited] Could not read visited.json — starting fresh");
        return new Set();
    }
}

module.exports = { loadVisited };