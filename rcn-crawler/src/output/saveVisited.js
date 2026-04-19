const fs   = require("node:fs");
const path = require("node:path");

const OUTPUT_PATH = path.join(__dirname, "..", "..", "visited.json");

function saveVisited(visited) {
    const final = {
        summary: {
            totalVisited: visited.size,
            lastRunAt: new Date().toISOString()
        },
        urls: [...visited].sort((a, b) => a.localeCompare(b))
    };

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(final, null, 2), "utf-8");
    return OUTPUT_PATH;
}

module.exports = { saveVisited, OUTPUT_PATH };