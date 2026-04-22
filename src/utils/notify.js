/**
 * @file notify.js
 * @description Sends a JSON summary to a webhook URL when the crawl ends.
 * Works with Discord webhooks, Slack incoming webhooks, Telegram bot API,
 * and any custom HTTP endpoint.
 */

const axios = require("axios");
const { NOTIFY_URL } = require("../config");
const { log } = require("./logger");

/**
 * Builds the request body for the target webhook type, detected by URL pattern.
 *
 * - Discord  (discord.com/api/webhooks)  → { embeds: [...] }
 * - Slack    (hooks.slack.com)           → { text: "..." }
 * - Telegram (api.telegram.org/bot)      → { chat_id, text } — requires ?chat_id= in URL
 * - Default                              → raw summary JSON
 *
 * @param {string} url
 * @param {object} summary
 * @returns {object}
 */
function buildPayload(url, summary) {
    const text =
        `🕷️ RCN Crawl Finished\n` +
        `Pages processed: ${summary.processedCount}\n` +
        `URLs visited:    ${summary.visitedCount}\n` +
        `Domains:         ${summary.domains}\n` +
        `Duration:        ${summary.duration}\n` +
        `Ended:           ${summary.timestamp}`;

    if (url.includes("discord.com/api/webhooks")) {
        return {
            embeds: [{
                title:       "🕷️ RCN Crawl Finished",
                color:       0x22c55e,
                fields: [
                    { name: "Pages processed", value: String(summary.processedCount), inline: true },
                    { name: "URLs visited",    value: String(summary.visitedCount),   inline: true },
                    { name: "Domains",         value: String(summary.domains),        inline: true },
                    { name: "Duration",        value: summary.duration,               inline: true },
                ],
                timestamp: summary.timestamp,
            }],
        };
    }

    if (url.includes("hooks.slack.com")) {
        return { text };
    }

    if (url.includes("api.telegram.org/bot")) {
        const chatId = new URL(url).searchParams.get("chat_id") ?? "";
        return { chat_id: chatId, text, parse_mode: "Markdown" };
    }

    return summary;
}

/**
 * Formats milliseconds into a human-readable duration string.
 *
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
}

/**
 * POSTs a crawl summary to the configured webhook URL.
 * Silently skips if NOTIFY_URL is not set.
 *
 * @async
 * @param {{ processedCount: number, visitedCount: number, domains: number, startedAt: number }} stats
 * @returns {Promise<void>}
 */
async function notify(stats) {
    if (!NOTIFY_URL) return;

    const summary = {
        event:          "crawl_complete",
        processedCount: stats.processedCount,
        visitedCount:   stats.visitedCount,
        domains:        stats.domains,
        duration:       formatDuration(Date.now() - stats.startedAt),
        timestamp:      new Date().toISOString(),
    };

    try {
        const payload = buildPayload(NOTIFY_URL, summary);
        await axios.post(NOTIFY_URL, payload, { timeout: 10000 });
        log.info(`Notification sent to webhook`);
    } catch (err) {
        log.warn(`Notification failed: ${err.message}`);
    }
}

module.exports = { notify };
