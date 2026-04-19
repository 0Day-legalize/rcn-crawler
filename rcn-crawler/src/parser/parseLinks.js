const cheerio = require("cheerio");
const { normalizeLink } = require("../utils/urls");

function parseLinks(rawHtml, baseUrl) {
    const $ = cheerio.load(rawHtml);
    const links = [];

    $("a[href]").each((_, element) => {
        const href = $(element).attr("href");
        const normalized = normalizeLink(href, baseUrl);

    if (normalized) {
        links.push(normalized);
        }
    });
    return links;
}

module.exports = { parseLinks };