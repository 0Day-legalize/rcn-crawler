/**
 * @file enqueueLinks.js
 * @description Adds newly discovered links to the shared crawl queue,
 * skipping URLs that have already been visited or are already queued.
 * Accepts links from any domain — cross-domain discovery is intentional.
 */

/**
 * Filters and appends a list of links to the shared queue.
 *
 * Each link is:
 *   1. Parsed to extract its hostname (used as baseHost for worker assignment)
 *   2. Checked against visited and queued sets to prevent duplicates
 *   3. Pushed onto the queue and registered in the queued set if new
 *
 * Malformed URLs that cannot be parsed by the URL constructor are silently ignored.
 *
 * @param {string[]}          links   - Absolute URLs to potentially enqueue
 * @param {Array<{url: string, baseHost: string}>} queue   - Shared crawl queue (mutated in place)
 * @param {Set<string>}       visited - Set of already-visited URLs
 * @param {Set<string>}       queued  - Set of URLs already present in the queue
 * @returns {void}
 */
function enqueueLinks(links, queue, visited, queued) {
    for (const link of links) {
        try {
            const parsed         = new URL(link);
            const normalizedHost = parsed.hostname.toLowerCase();

            if (visited.has(link)) continue;
            if (queued.has(link))  continue;

            queue.push({ url: link, baseHost: normalizedHost });
            queued.add(link);
        } catch {
            // Ignore malformed links
        }
    }
}

module.exports = { enqueueLinks };