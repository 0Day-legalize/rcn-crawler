/**
 * @file logger.js
 * @description Structured rotating logger for RCN WebCrawler.
 *
 * Directory layout:
 *   logs/
 *     crawler-YYYY-MM-DD.log       ← current live log (JSON-Lines)
 *     archive/
 *       crawler-YYYY-MM-DD.log.gz  ← compressed rotated logs
 *
 * Features:
 *   - Four log levels: debug, info, warn, error
 *   - Writes JSON-Lines to logs/crawler-YYYY-MM-DD.log
 *   - Rotates at midnight, compresses to logs/archive/ via compress.js
 *   - Keeps the last LOG_MAX_FILES archives; older ones deleted automatically
 *   - Mirrors every message to the console unchanged
 *   - LOG_LEVEL env var controls minimum file level (default: info)
 */

const fs   = require("node:fs");
const path = require("node:path");
const { ensureDir, compressFile, pruneArchive } = require("./compress");

const LOG_DIR     = path.join(__dirname, "..", "..", "logs");
const ARCHIVE_DIR = path.join(LOG_DIR, "archive");
const LOG_MAX_FILES = 14;

/** @type {"debug"|"info"|"warn"|"error"} */
const LOG_LEVEL = (process.env.LOG_LEVEL ?? "info");

/** @type {Record<string, number>} */
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

/** @type {fs.WriteStream|null} */
let currentStream = null;
let currentDate   = "";

/**
 * Returns today as YYYY-MM-DD in local time.
 * @returns {string}
 */
function todayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

/**
 * @param {string} date
 * @returns {string}
 */
function logFilePath(date) {
    return path.join(LOG_DIR, `crawler-${date}.log`);
}

/**
 * Returns the open WriteStream for today's file, rotating if the date changed.
 * On rotation: closes previous stream, compresses it to logs/archive/, prunes old archives.
 * @returns {fs.WriteStream}
 */
function getStream() {
    const today = todayString();
    if (currentStream && currentDate === today) return currentStream;

    if (currentStream) {
        const oldPath = logFilePath(currentDate);
        ensureDir(ARCHIVE_DIR);
        currentStream.end(() => {
            compressFile(oldPath, ARCHIVE_DIR)
                .then(() => pruneArchive(ARCHIVE_DIR, /^crawler-.*\.log\.gz$/, LOG_MAX_FILES))
                .catch((err) => process.stderr.write(`[logger] Rotation error: ${err.message}\n`));
        });
        currentStream = null;
    }

    ensureDir(LOG_DIR);
    currentDate   = today;
    currentStream = fs.createWriteStream(logFilePath(today), { flags: "a" });
    currentStream.once("error", (err) => {
        process.stderr.write(`[logger] Stream error: ${err.message}\n`);
        currentStream = null;
    });
    return currentStream;
}

/**
 * Writes a structured log entry and mirrors it to the console.
 *
 * @param {"debug"|"info"|"warn"|"error"} level
 * @param {string} message
 * @param {object} [data={}]
 */
function write(level, message, data = {}) {
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    Object.keys(data).length > 0 ? fn(`[${level.toUpperCase()}] ${message}`, data) : fn(message);

    if ((LEVELS[level] ?? 1) < (LEVELS[LOG_LEVEL] ?? 1)) return;

    const entry = JSON.stringify({ ts: new Date().toISOString(), level, message, ...data });
    try { getStream().write(`${entry}\n`); }
    catch (err) { process.stderr.write(`[logger] Write error: ${err.message}\n`); }
}

/**
 * Flushes and closes the current stream. Call before process exit.
 * @returns {Promise<void>}
 */
function close() {
    return new Promise((resolve) => {
        if (!currentStream) return resolve();
        currentStream.end(resolve);
        currentStream = null;
    });
}

/**
 * The logger — use instead of console.log/warn/error.
 * @namespace log
 */
const log = {
    /** @param {string} message @param {object} [data] */
    debug: (message, data) => write("debug", message, data),
    /** @param {string} message @param {object} [data] */
    info:  (message, data) => write("info",  message, data),
    /** @param {string} message @param {object} [data] */
    warn:  (message, data) => write("warn",  message, data),
    /** @param {string} message @param {object} [data] */
    error: (message, data) => write("error", message, data),
};

module.exports = { log, close };