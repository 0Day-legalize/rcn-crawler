const cheerio = require("cheerio");
const { normalizeLink } = require("../utils/urls");
const { MAX_LINKS_PER_PAGE, MAX_HREF_LENGTH } = require("../config");

const ALLOWED_SCHEMES = ["http:", "https:"];

function parseLinks(rawHtml, baseUrl) {
    const $ = cheerio.load(rawHtml);
    const links = [];

    $("a[href]").each((_, element) => {
        // Stop early once we hit the cap
        if (links.length >= MAX_LINKS_PER_PAGE) return false;

        const href = $(element).attr("href");
        if (!href || typeof href !== "string") return;

        // Drop suspiciously long hrefs before any processing (ReDoS / memory protection)
        if (href.length > MAX_HREF_LENGTH) return;

        // Strip whitespace and null bytes
        const cleaned = href.trim().replace(/\0/g, "");

        const normalized = normalizeLink(cleaned, baseUrl);
        if (!normalized) return;

        // Block non-http(s) schemes
        try {
            const parsed = new URL(normalized);
            if (!ALLOWED_SCHEMES.includes(parsed.protocol)) return;
        } catch {
            return;
        }

        links.push(normalized);
    });

    return links;
}

module.exports = { parseLinks };