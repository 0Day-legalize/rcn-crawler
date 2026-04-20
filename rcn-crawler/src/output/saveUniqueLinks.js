/**
 * @file saveUniqueLinks.js
 * @description Merges and persists all unique navigable links and downloadable
 * file URLs discovered across crawl runs to unique-links.json.
 * Previous run data is loaded and merged before each write so the file
 * accumulates links indefinitely without duplication.
 */

const fs   = require("node:fs");
const path = require("node:path");

/** @type {string} Absolute path of the unique links persistence file. */
const OUTPUT_PATH = path.join(__dirname, "..", "..", "unique-links.json");

/**
 * URL schemes considered valid for storage.
 * Prevents non-http(s) entries from contaminating the output file.
 * @type {Set<string>}
 */
const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Returns true if the value is a string containing a valid http(s) URL.
 *
 * @param {unknown} link - Value to validate
 * @returns {boolean}
 */
function isSafeUrl(link) {
    if (typeof link !== "string") return false;
    try {
        return ALLOWED_SCHEMES.has(new URL(link).protocol);
    } catch {
        return false;
    }
}

/**
 * Reads unique-links.json and returns its domains and downloads objects.
 * Returns empty objects on any error or structural mismatch.
 *
 * @returns {{ domains: Record<string, string[]>, downloads: Record<string, string[]> }}
 */
function loadExisting() {
    try {
        if (!fs.existsSync(OUTPUT_PATH)) return { domains: {}, downloads: {} };

        const parsed = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf-8"));

        if (!parsed || typeof parsed.domains !== "object" || Array.isArray(parsed.domains)) {
            console.warn("[saveUniqueLinks] unexpected structure — starting fresh");
            return { domains: {}, downloads: {} };
        }

        return {
            domains:   parsed.domains   ?? {},
            downloads: parsed.downloads ?? {},
        };
    } catch {
        console.warn("[saveUniqueLinks] could not read existing file — starting fresh");
        return { domains: {}, downloads: {} };
    }
}

/**
 * Converts a plain object of string arrays into a map of Sets,
 * filtering each entry through isSafeUrl.
 *
 * @param {Record<string, unknown>} obj - Source plain object from JSON
 * @returns {Record<string, Set<string>>}
 */
function toSetMap(obj) {
    const map = {};
    for (const [key, arr] of Object.entries(obj)) {
        if (Array.isArray(arr)) map[key] = new Set(arr.filter(isSafeUrl));
    }
    return map;
}

/**
 * Adds an array of URLs to a Set map under the specified key.
 * Creates the Set if the key is not yet present.
 * Only safe http(s) URLs are accepted.
 *
 * @param {Record<string, Set<string>>} map - Target Set map (mutated in place)
 * @param {string}                      key - Domain key (e.g. "http://example.com")
 * @param {string[]}                    urls - URLs to merge in
 * @returns {void}
 */
function mergeInto(map, key, urls) {
    if (!map[key]) map[key] = new Set();
    for (const url of urls) {
        if (isSafeUrl(url)) map[key].add(url);
    }
}

/**
 * Converts a Set map to a plain object of sorted string arrays,
 * omitting any keys whose Set is empty.
 *
 * @param {Record<string, Set<string>>} map - Source Set map
 * @returns {Record<string, string[]>}      - Serialisable plain object
 */
function toSortedArrayMap(map) {
    const out = {};
    for (const [key, set] of Object.entries(map)) {
        if (set.size > 0) out[key] = [...set].sort((a, b) => a.localeCompare(b));
    }
    return out;
}

/**
 * Counts the total number of entries across all arrays in a plain object.
 *
 * @param {Record<string, string[]>} obj - Object of string arrays
 * @returns {number}                     - Sum of all array lengths
 */
function countAll(obj) {
    return Object.values(obj).reduce((acc, arr) => acc + arr.length, 0);
}

// ── Merge helpers per data type ───────────────────────────────────────────

/**
 * Merges navigable links from the current run into the existing links map.
 *
 * @param {Record<string, string[]>} existing - Links loaded from the previous run
 * @param {object[]}                 results  - Per-page result objects from processQueue
 * @returns {Record<string, string[]>}        - Merged, deduplicated, sorted output
 */
function mergeLinks(existing, results) {
    const map = toSetMap(existing);
    for (const page of results) {
        if (!page.baseHost || !page.links) continue;
        mergeInto(map, `http://${page.baseHost}`, page.links);
    }
    return toSortedArrayMap(map);
}

/**
 * Merges download URLs from the current run into the existing downloads map.
 *
 * @param {Record<string, string[]>} existing - Downloads loaded from the previous run
 * @param {object[]}                 results  - Per-page result objects from processQueue
 * @returns {Record<string, string[]>}        - Merged, deduplicated, sorted output
 */
function mergeDownloads(existing, results) {
    const map = toSetMap(existing);
    for (const page of results) {
        if (!page.baseHost || !page.downloads) continue;
        mergeInto(map, `http://${page.baseHost}`, page.downloads);
    }
    return toSortedArrayMap(map);
}

// ── Main export ───────────────────────────────────────────────────────────

/**
 * Merges this run's links and downloads with all previous runs and writes
 * the result to unique-links.json.
 *
 * Output shape:
 * ```json
 * {
 *   "summary": { "totalDomains": N, "totalUniqueLinks": N, "totalDownloads": N, "lastRunAt": "ISO" },
 *   "domains":   { "http://example.com": ["https://example.com/page", ...] },
 *   "downloads": { "http://example.com": ["https://example.com/file.pdf", ...] }
 * }
 * ```
 *
 * @param {{ results: object[] }} result - Crawl result object from processQueue
 * @returns {string}                     - Absolute path of the written file
 */
function saveUniqueLinks(result) {
    const existing  = loadExisting();
    const domains   = mergeLinks(existing.domains, result.results);
    const downloads = mergeDownloads(existing.downloads, result.results);

    const final = {
        summary: {
            totalDomains:     Object.keys(domains).length,
            totalUniqueLinks: countAll(domains),
            totalDownloads:   countAll(downloads),
            lastRunAt:        new Date().toISOString(),
        },
        domains,
        downloads,
    };

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(final, null, 2), "utf-8");
    return OUTPUT_PATH;
}

module.exports = { saveUniqueLinks };