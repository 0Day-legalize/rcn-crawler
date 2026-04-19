const fs = require("node:fs");
const path = require("node:path");
const { SocksProxyAgent } = require("socks-proxy-agent");

const { TOR_HOST } = require("./config");
const { cleanUrls, normalizeUrls, buildQueue } = require("./utils/urls");
const { findTorPort } = require("./tor/findTorPort");
const { processQueue } = require("./crawl/processQueue");
const { saveResults } = require("./output/saveResults");
const { saveUniqueLinks } = require("./output/saveUniqueLinks");
const { loadVisited } = require("./output/loadVisited");

async function main() {
    const torPort = await findTorPort();

    if (!torPort) {
        console.error("Tor is not running on 127.0.0.1:9050 or 127.0.0.1:9150");
        console.error("Start Tor service or Tor Browser, then try again.");
        process.exit(1);
    }

    console.log(`Tor detected on port ${torPort}`);

    const torAgent = new SocksProxyAgent(`socks5h://${TOR_HOST}:${torPort}`);

    const filePath = path.join(__dirname, "..", "urls.txt");
    const fileContent = fs.readFileSync(filePath, "utf-8");

    const cleaned = cleanUrls(fileContent);
    const finalUrls = normalizeUrls(cleaned);
    const queue = buildQueue(finalUrls);

    // Load visited URLs from previous runs so we don't re-crawl them
    const preloadedVisited = loadVisited();

    const result = await processQueue(queue, torAgent, preloadedVisited);

    const resultsPath = saveResults(result);
    const uniqueLinksPath = saveUniqueLinks(result);

    console.log("Total processed:", result.processedCount);
    console.log("Total visited:", result.visitedCount);
    console.log("Saved JSON:", resultsPath);
    console.log("Saved unique links JSON:", uniqueLinksPath);
}

if (require.main === module) {
    main().catch((error) => {
        console.error("Fatal error:", error);
        process.exit(1);
    });
}