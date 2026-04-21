/**
 * @file main.js
 * @description Entry point for RCN WebCrawler.
 * Validates the environment, loads seed URLs and previously visited URLs,
 * then delegates to processQueue for the actual crawl.
 */

const fs   = require("node:fs");
const path = require("node:path");

const { cleanUrls, normalizeUrls, buildQueue }  = require("./utils/urls");
const { findTorPort }                           = require("./tor/findTorPort");
const { processQueue }                          = require("./crawl/processQueue");
const { saveResults }                           = require("./output/saveResults");
const { saveUniqueLinks }                       = require("./output/saveUniqueLinks");
const { loadVisited }                           = require("./output/loadVisited");
const { loadQueue }                             = require("./output/loadQueue");
const { log, close: closeLogger }               = require("./utils/logger");

/**
 * Bootstraps and runs the crawler.
 * Execution order:
 *   1. Detect a running Tor SOCKS5 proxy
 *   2. Read and validate urls.txt
 *   3. Load previously visited URLs from visited.json (resume support)
 *   4. Run the crawl via processQueue
 *   5. Persist results to results.json and unique-links.json
 *
 * @async
 * @returns {Promise<void>}
 */
async function main() {
    const torPort = await findTorPort();

    if (!torPort) {
        log.error("Tor is not running on 127.0.0.1:9050 or 127.0.0.1:9150 — start Tor service or Tor Browser, then try again.");
        await closeLogger();
        process.exit(1);
    }

    log.info(`Tor detected on port ${torPort}`);

    const filePath = path.join(__dirname, "..", "urls.txt");

    if (!fs.existsSync(filePath)) {
        log.error(`urls.txt not found at: ${filePath} — create it with one URL per line.`);
        await closeLogger();
        process.exit(1);
    }

    const fileContent  = fs.readFileSync(filePath, "utf-8");
    const cleaned      = cleanUrls(fileContent);
    const finalUrls    = normalizeUrls(cleaned);
    const queue        = buildQueue(finalUrls);

    if (queue.length === 0) {
        log.error("urls.txt contains no valid URLs.");
        await closeLogger();
        process.exit(1);
    }

    log.info(`Loaded ${queue.length} seed URL(s)`);

    const preloadedVisited = loadVisited();

    // If a saved queue exists from a previous interrupted run, resume from it.
    // Any seed URLs not already visited and not already in the saved queue are
    // appended so new seeds added to urls.txt are always picked up.
    const savedQueue = loadQueue();
    let startQueue;

    if (savedQueue !== null) {
        const savedUrls  = new Set(savedQueue.map(i => i.url));
        const freshSeeds = queue.filter(i => !preloadedVisited.has(i.url) && !savedUrls.has(i.url));
        startQueue = [...savedQueue, ...freshSeeds];
        log.info(`Resuming: ${savedQueue.length} pending URL(s) + ${freshSeeds.length} new seed(s)`);
    } else {
        startQueue = queue;
    }

    const result = await processQueue({ queue: startQueue, torPort, preloadedVisited });

    const resultsPath     = saveResults(result);
    const uniqueLinksPath = saveUniqueLinks(result);

    log.info(`Done — processed: ${result.processedCount}, visited: ${result.visitedCount}`);
    log.info(`Results: ${resultsPath}`);
    log.info(`Unique links: ${uniqueLinksPath}`);

    await closeLogger();
}

if (require.main === module) {
    main().catch(async (error) => {
        log.error("Fatal error", { message: error.message, stack: error.stack });
        await closeLogger();
        process.exit(1);
    });
}