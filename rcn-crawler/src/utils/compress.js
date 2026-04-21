/**
 * @file compress.js
 * @description Shared gzip compression utility used by the data output modules
 * and the logger. Provides a single consistent place for all compression logic
 * so the rest of the codebase never touches zlib directly.
 *
 * All functions are async-safe and non-throwing — failures are reported via
 * the returned Promise rejection rather than crashing the caller.
 */

const fs   = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

/**
 * Ensures a directory exists, creating it (and any parents) if needed.
 * Synchronous so callers can use it in initialisation paths.
 *
 * @param {string} dir - Absolute path of the directory to create
 * @returns {void}
 */
function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

/**
 * Compresses a file to `<destDir>/<basename>.gz` using gzip best-compression,
 * then deletes the original source file.
 *
 * The compressed file is written to `destDir` rather than alongside the source
 * so callers can separate live files (data/) from archives (data/archive/).
 *
 * @param {string} srcPath  - Absolute path of the file to compress
 * @param {string} destDir  - Directory to write the .gz file into
 * @returns {Promise<string>} - Absolute path of the written .gz file
 */
function compressFile(srcPath, destDir) {
    return new Promise((resolve, reject) => {
        ensureDir(destDir);

        const basename = path.basename(srcPath);
        const gzPath   = path.join(destDir, `${basename}.gz`);

        const src  = fs.createReadStream(srcPath);
        const dst  = fs.createWriteStream(gzPath);
        const gzip = zlib.createGzip({ level: zlib.constants.Z_BEST_COMPRESSION });

        src.pipe(gzip).pipe(dst);

        dst.once("finish", () => {
            // Delete the original only after the compressed file is fully written
            fs.unlink(srcPath, (err) => {
                if (err) return reject(new Error(`compressFile: unlink failed for ${srcPath}: ${err.message}`));
                resolve(gzPath);
            });
        });

        src.once("error", (err) => reject(new Error(`compressFile: read error on ${srcPath}: ${err.message}`)));
        dst.once("error", (err) => reject(new Error(`compressFile: write error on ${gzPath}: ${err.message}`)));
    });
}

/**
 * Compresses a file in place — the .gz output is written alongside the source
 * and the source is deleted.
 *
 * Convenience wrapper around compressFile for when source and dest are in the
 * same directory.
 *
 * @param {string} srcPath - Absolute path of the file to compress
 * @returns {Promise<string>} - Absolute path of the written .gz file
 */
function compressInPlace(srcPath) {
    return compressFile(srcPath, path.dirname(srcPath));
}

/**
 * Reads and decompresses a .gz file, returning its contents as a UTF-8 string.
 * Useful for reading archived data files without fully extracting them.
 *
 * @param {string} gzPath - Absolute path of the .gz file to read
 * @returns {Promise<string>} - Decompressed file contents as UTF-8 text
 */
function readCompressed(gzPath) {
    return new Promise((resolve, reject) => {
        const chunks  = [];
        const src     = fs.createReadStream(gzPath);
        const gunzip  = zlib.createGunzip();

        src.pipe(gunzip);

        gunzip.on("data",  (chunk) => chunks.push(chunk));
        gunzip.once("end",  () => resolve(Buffer.concat(chunks).toString("utf-8")));
        gunzip.once("error", reject);
        src.once("error",    reject);
    });
}

/**
 * Deletes files in `dir` that match `pattern`, keeping only the `keepCount`
 * most recent by filename sort order (lexicographic, so ISO-date prefixes work).
 *
 * Used by the logger and data modules to cap the number of archived files.
 *
 * @param {string} dir       - Directory to scan
 * @param {RegExp} pattern   - Only files whose names match this pattern are considered
 * @param {number} keepCount - How many matching files to keep (most recent)
 * @returns {void}           - Deletions happen asynchronously; errors go to stderr
 */
function pruneArchive(dir, pattern, keepCount) {
    fs.readdir(dir, (err, files) => {
        if (err) return;

        const matching = files
            .filter(f => pattern.test(f))
            .sort()
            .reverse(); // newest first (relies on ISO-date or timestamp prefix)

        const toDelete = matching.slice(keepCount);
        for (const f of toDelete) {
            fs.unlink(path.join(dir, f), () => {});
        }
    });
}

module.exports = { ensureDir, compressFile, compressInPlace, readCompressed, pruneArchive };