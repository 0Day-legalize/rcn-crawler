const fs   = require("node:fs");
const { OUTPUT_PATH } = require("./saveVisited");

function loadVisited() {
    try {
        if (!fs.existsSync(OUTPUT_PATH)) return new Set();
        const raw    = fs.readFileSync(OUTPUT_PATH, "utf-8");
        const parsed = JSON.parse(raw);
        const urls   = parsed.urls ?? [];
        console.log(`Resuming — ${urls.length} URL(s) already visited from previous run(s)`);
        return new Set(urls);
    } catch {
        console.warn("[loadVisited] Could not read visited.json — starting fresh");
        return new Set();
    }
}

module.exports = { loadVisited };