/**
 * @file urls.js
 * @description URL parsing, normalisation, and queue construction utilities.
 */

/**
 * Splits raw file content into trimmed, non-empty lines.
 * Intended for reading urls.txt — blank lines are removed automatically.
 *
 * @param {string} fileContent - Raw text content of urls.txt
 * @returns {string[]}         - Array of trimmed non-empty lines
 */
function cleanUrls(fileContent) {
    return fileContent
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}

/**
 * Normalises a list of raw URL strings into a deduplicated Set.
 * Each URL is parsed, lowercased, and stripped of its fragment (#anchor).
 * Invalid URLs are skipped with a warning.
 *
 * @param {string[]} urls - Raw URL strings (may include duplicates)
 * @returns {Set<string>} - Deduplicated set of normalised absolute URLs
 */
function normalizeUrls(urls) {
    const uniqueUrls = new Set();

    for (const rawUrl of urls) {
        try {
            const parsed = new URL(rawUrl);
            parsed.hostname = parsed.hostname.toLowerCase();
            parsed.hash = "";
            uniqueUrls.add(parsed.toString());
        } catch {
            console.log(`Skipping invalid seed URL: ${rawUrl}`);
        }
    }

    return uniqueUrls;
}

/**
 * Converts a set of normalised URLs into a queue of crawl items.
 * Each item carries the URL and its extracted hostname for domain grouping.
 *
 * @param {Set<string>} finalUrls - Normalised, deduplicated URL set
 * @returns {Array<{url: string, baseHost: string}>} - Ordered crawl queue
 */
function buildQueue(finalUrls) {
    const queue = [];

    for (const url of finalUrls) {
        try {
            const parsed = new URL(url);
            queue.push({
                url,
                baseHost: parsed.hostname.toLowerCase(),
            });
        } catch {
            // skip invalid urls
        }
    }

    return queue;
}

/**
 * Returns true if the given URL targets a Tor hidden service (.onion).
 *
 * @param {string} url - Absolute URL string
 * @returns {boolean}
 */
function isOnion(url) {
    try {
        return new URL(url).hostname.endsWith(".onion");
    } catch {
        return false;
    }
}

/**
 * Resolves a potentially relative URL against an optional base URL,
 * normalises the result (lowercase hostname, no trailing slash, no fragment),
 * and returns it as an absolute string.
 *
 * @param {string}      url     - Absolute or relative URL to normalise
 * @param {string|null} baseUrl - Base URL used to resolve relative paths (optional)
 * @returns {string|null}       - Normalised absolute URL, or null if parsing fails
 */
function normalizeLink(url, baseUrl = null) {
    try {
        const parsed = baseUrl ? new URL(url, baseUrl) : new URL(url);

        parsed.hostname = parsed.hostname.toLowerCase();
        parsed.hash = "";

        // Remove trailing slash except on root paths
        if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
            parsed.pathname = parsed.pathname.slice(0, -1);
        }

        return parsed.toString();
    } catch {
        return null;
    }
}

module.exports = { cleanUrls, normalizeUrls, buildQueue, isOnion, normalizeLink };