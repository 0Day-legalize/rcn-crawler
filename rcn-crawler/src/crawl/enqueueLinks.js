/**
 * @file enqueueLinks.js
 * @description Adds newly discovered links to the shared crawl queue,
 * skipping URLs that have already been visited or are already queued.
 * Applies onion-only, depth, allowlist, and blocklist filters at enqueue time.
 */

const { ONION_ONLY, MAX_DEPTH, ALLOW_DOMAINS, BLOCK_DOMAINS } = require("../config");
const { isOnion } = require("../utils/urls");

/**
 * Returns true if the hostname matches or is a subdomain of any entry in the list.
 *
 * @param {string}   hostname - Lowercased hostname to test
 * @param {string[]} list     - Domain entries (e.g. ["evil.com", "bad.onion"])
 * @returns {boolean}
 */
function matchesDomainList(hostname, list) {
    return list.some(entry => hostname === entry || hostname.endsWith(`.${entry}`));
}

/**
 * Filters and appends a list of links to the shared queue.
 *
 * Each link is:
 *   1. Checked against onion-only, depth, allowlist, and blocklist filters
 *   2. Parsed to extract its hostname (used as baseHost for worker assignment)
 *   3. Checked against visited and queued sets to prevent duplicates
 *   4. Pushed onto the queue tagged with the URL that referred to it and its depth
 *
 * @param {string[]}  links    - Absolute URLs to potentially enqueue
 * @param {Array}     queue    - Shared crawl queue (mutated in place)
 * @param {Set<string>} visited  - Set of already-visited URLs
 * @param {Set<string>} queued   - Set of URLs already present in the queue
 * @param {string|null} referrer - URL of the page these links were found on
 * @param {number}    depth    - Depth of the page these links were found on (children get depth+1)
 * @returns {void}
 */
function enqueueLinks(links, queue, visited, queued, referrer, depth = 0) {
    const childDepth = depth + 1;

    for (const link of links) {
        try {
            if (ONION_ONLY && !isOnion(link)) continue;

            if (MAX_DEPTH > 0 && childDepth > MAX_DEPTH) continue;

            const parsed         = new URL(link);
            const normalizedHost = parsed.hostname.toLowerCase();

            if (ALLOW_DOMAINS.length > 0 && !matchesDomainList(normalizedHost, ALLOW_DOMAINS)) continue;
            if (BLOCK_DOMAINS.length > 0 &&  matchesDomainList(normalizedHost, BLOCK_DOMAINS)) continue;

            if (visited.has(link)) continue;
            if (queued.has(link))  continue;

            queue.push({ url: link, baseHost: normalizedHost, referrer: referrer ?? null, depth: childDepth });
            queued.add(link);
        } catch {
            // Ignore malformed links
        }
    }
}

module.exports = { enqueueLinks };
