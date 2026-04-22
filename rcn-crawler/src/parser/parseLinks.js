/**
 * @file parseLinks.js
 * @description HTML parser that extracts navigable links, downloadable file URLs,
 * and page metadata (title, description, language, charset) from raw HTML.
 */

const cheerio = require("cheerio");
const { normalizeLink } = require("../utils/urls");
const { MAX_LINKS_PER_PAGE, MAX_HREF_LENGTH } = require("../config");

/**
 * URL schemes accepted as crawlable or downloadable links.
 * All other schemes (javascript:, file:, data:, ftp:, etc.) are dropped.
 * @type {Set<string>}
 */
const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

/**
 * File extensions that indicate a downloadable resource rather than an HTML page.
 * Links matching these extensions are collected separately and never followed.
 * @type {Set<string>}
 */
const DOWNLOAD_EXTENSIONS = new Set([
    // Documents
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf", "txt", "csv",
    // Archives
    "zip", "tar", "gz", "bz2", "xz", "7z", "rar",
    // Executables / packages
    "exe", "msi", "dmg", "pkg", "deb", "rpm", "apk",
    // Media
    "mp3", "mp4", "mkv", "avi", "mov", "wmv", "flac", "wav", "ogg",
    // Disk images
    "iso", "img",
    // Misc
    "torrent", "magnet",
]);

/**
 * Returns true if the URL's path ends with a known downloadable file extension.
 *
 * @param {string} url - Absolute URL to inspect
 * @returns {boolean}
 */
function isDownloadLink(url) {
    try {
        const pathname = new URL(url).pathname.toLowerCase();
        const ext = pathname.split(".").pop();
        return DOWNLOAD_EXTENSIONS.has(ext);
    } catch {
        return false;
    }
}

/**
 * @typedef {Object} PageMeta
 * @property {string|null} title       - Content of the <title> element (max 512 chars)
 * @property {string|null} description - <meta name="description"> or og:description (max 1024 chars)
 * @property {string|null} language    - <html lang=""> attribute or content-language meta (max 32 chars)
 * @property {string|null} charset     - Declared character encoding (max 32 chars)
 */

/**
 * @typedef {Object} ParsedPage
 * @property {string[]}  links     - Navigable http(s) URLs (not download links)
 * @property {string[]}  downloads - URLs pointing to downloadable files
 * @property {PageMeta}  meta      - Extracted page metadata
 */

/**
 * Parses raw HTML and returns navigable links, download links, and page metadata.
 *
 * Link extraction rules:
 * - Only <a href> attributes are processed
 * - Hrefs longer than MAX_HREF_LENGTH are dropped (ReDoS protection)
 * - Only http: and https: schemes are accepted
 * - Links are resolved to absolute URLs using baseUrl
 * - Links with a known file extension go to downloads[], others to links[]
 * - At most MAX_LINKS_PER_PAGE links are returned (combined navigable + download)
 *
 * @param {string} rawHtml - Raw HTML string of the fetched page
 * @param {string} baseUrl - Absolute URL the HTML was fetched from (used to resolve relative links)
 * @returns {ParsedPage}
 */
function parsePage(rawHtml, baseUrl) {
    const $ = cheerio.load(rawHtml);

    // ── Metadata ──────────────────────────────────────────────────────────

    const title = $("title").first().text().trim().slice(0, 512) || null;

    const description =
        $("meta[name='description']").attr("content")?.trim().slice(0, 1024) ||
        $("meta[property='og:description']").attr("content")?.trim().slice(0, 1024) ||
        null;

    const language =
        $("html").attr("lang")?.trim().slice(0, 32) ||
        $("meta[http-equiv='content-language']").attr("content")?.trim().slice(0, 32) ||
        null;

    const charset =
        $("meta[charset]").attr("charset")?.trim().slice(0, 32) ||
        (/charset=([^\s;]+)/i).exec($("meta[http-equiv='content-type']").attr("content") ?? "")?.[1]?.slice(0, 32) ||
        null;

    /** @type {PageMeta} */
    const meta = { title, description, language, charset };

    // ── Links + Downloads ─────────────────────────────────────────────────

    /** @type {string[]} */
    const links = [];
    /** @type {string[]} */
    const downloads = [];

    $("a[href]").each((_, element) => {
        if (links.length >= MAX_LINKS_PER_PAGE) return false;

        const href = $(element).attr("href");
        if (!href || typeof href !== "string") return;
        if (href.length > MAX_HREF_LENGTH) return;

        const cleaned    = href.trim().replaceAll("\0", "");
        const normalized = normalizeLink(cleaned, baseUrl);
        if (!normalized) return;

        try {
            const parsed = new URL(normalized);
            if (!ALLOWED_SCHEMES.has(parsed.protocol)) return;
        } catch {
            return;
        }

        if (isDownloadLink(normalized)) {
            downloads.push(normalized);
        } else {
            links.push(normalized);
        }
    });

    return { links, downloads, meta };
}

/**
 * Convenience wrapper that returns only the navigable links from a page.
 * Retained for backward compatibility with callers that do not need metadata.
 *
 * @param {string} rawHtml - Raw HTML string
 * @param {string} baseUrl - Base URL for resolving relative links
 * @returns {string[]}     - Array of navigable http(s) URLs
 */
function parseLinks(rawHtml, baseUrl) {
    return parsePage(rawHtml, baseUrl).links;
}

module.exports = { parsePage, parseLinks };