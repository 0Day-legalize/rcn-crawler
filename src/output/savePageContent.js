/**
 * @file savePageContent.js
 * @description Saves raw HTML to data/pages/<hash>.html.
 * Files are named by content hash so identical pages are stored only once
 * across the entire crawl history.
 */

const fs     = require("node:fs");
const path   = require("node:path");
const crypto = require("node:crypto");

const PAGES_DIR = path.join(__dirname, "..", "..", "data", "pages");

function ensureDir() {
    if (!fs.existsSync(PAGES_DIR)) fs.mkdirSync(PAGES_DIR, { recursive: true });
}

/**
 * Returns a 16-character hex SHA-256 hash of the HTML string.
 * @param {string} html
 * @returns {string}
 */
function hashContent(html) {
    return crypto.createHash("sha256").update(html, "utf-8").digest("hex").slice(0, 16);
}

/**
 * Writes HTML to data/pages/<hash>.html if not already on disk.
 * Returns the hash so callers can reference the file in results.json.
 *
 * @param {string} html
 * @returns {string} content hash
 */
function savePageContent(html) {
    ensureDir();
    const hash     = hashContent(html);
    const filePath = path.join(PAGES_DIR, `${hash}.html`);
    const alreadySaved = fs.existsSync(filePath) || fs.existsSync(filePath + ".gz");
    if (!alreadySaved) {
        fs.writeFileSync(filePath, html, "utf-8");
    }
    return hash;
}

module.exports = { savePageContent, hashContent };
