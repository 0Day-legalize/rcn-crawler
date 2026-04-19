const fs   = require("node:fs");
const path = require("node:path");

const OUTPUT_PATH = path.join(__dirname, "..", "..", "unique-links.json");

const ALLOWED_SCHEMES = ["http:", "https:"];

// Load existing file and return its domains object, or {} if none/invalid
function loadExisting() {
    try {
        if (!fs.existsSync(OUTPUT_PATH)) return {};

        const raw    = fs.readFileSync(OUTPUT_PATH, "utf-8");
        const parsed = JSON.parse(raw);

        // Schema validation
        if (!parsed || typeof parsed.domains !== "object" || Array.isArray(parsed.domains)) {
            console.warn("[saveUniqueLinks] unique-links.json has unexpected structure — starting fresh");
            return {};
        }

        return parsed.domains;

    } catch {
        console.warn("[saveUniqueLinks] Could not read existing file — starting fresh");
        return {};
    }
}

// Only keep valid http(s) URLs when merging
function isSafeUrl(link) {
    if (typeof link !== "string") return false;
    try {
        const { protocol } = new URL(link);
        return ALLOWED_SCHEMES.includes(protocol);
    } catch {
        return false;
    }
}

function saveUniqueLinks(result) {
    // 1. Load what was saved in previous runs
    const existing = loadExisting();

    // 2. Merge existing links into Sets (deduplication)
    const merged = {};
    for (const [key, links] of Object.entries(existing)) {
        if (!Array.isArray(links)) continue;
        merged[key] = new Set(links.filter(isSafeUrl));
    }

    // 3. Add links from this run
    for (const page of result.results) {
        if (!page.baseHost || !page.links) continue;

        const baseKey = `http://${page.baseHost}`;
        if (!merged[baseKey]) merged[baseKey] = new Set();

        for (const link of page.links) {
            if (isSafeUrl(link)) merged[baseKey].add(link);
        }
    }

    // 4. Convert Sets → sorted arrays
    const output = {};
    for (const [key, set] of Object.entries(merged)) {
        output[key] = [...set].sort((a, b) => a.localeCompare(b));
    }

    // 5. Write back
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