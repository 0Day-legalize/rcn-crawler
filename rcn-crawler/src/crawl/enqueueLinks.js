/**
 * @file enqueueLinks.js
 * @description Adds newly discovered links to the shared crawl queue,
 * skipping URLs that have already been visited or are already queued.
 * When ONION_ONLY is set, non-.onion URLs are dropped before enqueue.
 */

const { ONION_ONLY } = require("../config");
const { isOnion }    = require("../utils/urls");

/**
 * Filters and appends a list of links to the shared queue.
 *
 * Each link is:
 *   1. Parsed to extract its hostname (used as baseHost for worker assignment)
 *   2. Checked against visited and queued sets to prevent duplicates
 *   3. Pushed onto the queue tagged with the URL that referred to it, so a
 *      realistic Referer header can be emitted when the link is fetched
 *
 * Malformed URLs that cannot be parsed by the URL constructor are silently ignored.
 *
 * @param {string[]}               links     - Absolute URLs to potentially enqueue
 * @param {Array<{url: string, baseHost: string, referrer?: string}>} queue
 *                                             Shared crawl queue (mutated in place)
 * @param {Set<string>}            visited   - Set of already-visited URLs
 * @param {Set<string>}            queued    - Set of URLs already present in the queue
 * @param {string|undefined|null}  referrer  - URL of the page these links were found on,
 *                                             or null for seed URLs loaded from urls.txt
 * @returns {void}
 */
function enqueueLinks(links, queue, visited, queued, referrer) {
    for (const link of links) {
        try {
            if (ONION_ONLY && !isOnion(link)) continue;

            const parsed         = new URL(link);
            const normalizedHost = parsed.hostname.toLowerCase();

            if (visited.has(link)) continue;
            if (queued.has(link))  continue;

            queue.push({ url: link, baseHost: normalizedHost, referrer: referrer ?? null });
            queued.add(link);
        } catch {
            // Ignore malformed links
        }
    }
}

module.exports = { enqueueLinks };