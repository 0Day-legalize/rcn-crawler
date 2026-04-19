const fs   = require("node:fs");
const path = require("node:path");

const OUTPUT_PATH = path.join(__dirname, "..", "..", "unique-links.json");

// Load existing file and return its domains object
function loadExisting() {
    try {
        if (!fs.existsSync(OUTPUT_PATH)) return {};
        const raw = fs.readFileSync(OUTPUT_PATH, "utf-8");
        const parsed = JSON.parse(raw);
        return parsed.domains ?? {};
    } catch {
        console.warn("[saveUniqueLinks] Could not read existing file — starting fresh");
        return {};
    }
}

function saveUniqueLinks(result) {
    // Load what was saved in previous runs so we dont rerun the same pages
    const existing = loadExisting();

    // Merge existing links into Sets
    const merged = {};
    for (const [key, links] of Object.entries(existing)) {
        merged[key] = new Set(links);
    }

    //Add links from this run 
    for (const page of result.results) {
        if (!page.baseHost || !page.links) continue;

        const baseKey = `http://${page.baseHost}`;
        if (!merged[baseKey]) merged[baseKey] = new Set();

        for (const link of page.links) {
            merged[baseKey].add(link);
        }
    }

    const output = {};
    for (const [key, set] of Object.entries(merged)) {
        output[key] = [...set].sort();
    }

    const final = {
        summary: {
            totalDomains: Object.keys(output).length,
            totalUniqueLinks: Object.values(output)
                .reduce((acc, arr) => acc + arr.length, 0),
            lastRunAt: new Date().toISOString()
        },
        domains: output
    };

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(final, null, 2), "utf-8");
    return OUTPUT_PATH;
}

module.exports = { saveUniqueLinks };