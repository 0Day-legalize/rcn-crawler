/**
 * @file isAllowed.js
 * @description Evaluates whether a URL is permitted to be crawled
 * based on a set of robots.txt Disallow rules.
 */

/**
 * Returns true if the URL's path is not blocked by any of the provided rules.
 *
 * Each rule is a path prefix string sourced from a robots.txt Disallow directive.
 * A URL is blocked when its pathname starts with at least one rule prefix.
 * Malformed URLs that cannot be parsed always return false.
 *
 * @param {string}   url   - Absolute URL to evaluate
 * @param {string[]} rules - Disallowed path prefixes (from getRobots)
 * @returns {boolean}      - true if crawling is permitted, false if blocked or unparseable
 */
function isAllowed(url, rules) {
    try {
        const parsed = new URL(url);
        return !rules.some((rule) => parsed.pathname.startsWith(rule));
    } catch {
        return false;
    }
}

module.exports = { isAllowed };