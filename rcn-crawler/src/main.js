/**
 * @file main.js
 * @description Entry point for RCN WebCrawler.
 * Validates the environment, loads seed URLs and previously visited URLs,
 * then delegates to processQueue for the actual crawl.
 */

const fs   = require("node:fs");
const path = require("node:path");
const { SocksProxyAgent } = require("socks-proxy-agent");

const { TOR_HOST }                              = require("./config");
const { cleanUrls, normalizeUrls, buildQueue }  = require("./utils/urls");
const { findTorPort }                           = require("./tor/findTorPort");
const { processQueue }                          = require("./crawl/processQueue");
const { saveResults }                           = require("./output/saveResults");
const { saveUniqueLinks }                       = require("./output/saveUniqueLinks");
const { loadVisited }                           = require("./output/loadVisited");

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
        console.error("✗  Tor is not running on 127.0.0.1:9050 or 127.0.0.1:9150");
        console.error("   Start Tor service or Tor Browser, then try again.");
        process.exit(1);
    }

    console.log(`✓  Tor detected on port ${torPort}`);

    const filePath = path.join(__dirname, "..", "urls.txt");

    if (!fs.existsSync(filePath)) {
        console.error(`✗  urls.txt not found at: ${filePath}`);
        console.error("   Create a urls.txt file in the project root with one URL per line.");
        process.exit(1);
    }

    const fileContent  = fs.readFileSync(filePath, "utf-8");
    const cleaned      = cleanUrls(fileContent);
    const finalUrls    = normalizeUrls(cleaned);
    const queue        = buildQueue(finalUrls);

    if (queue.length === 0) {
        console.error("✗  urls.txt contains no valid URLs.");
        process.exit(1);
    }

    console.log(`Loaded ${queue.length} seed URL(s)`);

    const preloadedVisited = loadVisited();

    const result = await processQueue({ queue, torPort, preloadedVisited });

    const resultsPath     = saveResults(result);
    const uniqueLinksPath = saveUniqueLinks(result);

    console.log("\nTotal processed:", result.processedCount);
    console.log("Total visited:  ", result.visitedCount);
    console.log("Saved JSON:     ", resultsPath);
    console.log("Saved unique links JSON:", uniqueLinksPath);
}

if (require.main === module) {
    main().catch((error) => {
        console.error("Fatal error:", error);
        process.exit(1);
    });
}