const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function cleanUrls(fileContent) {
    return fileContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeUrls(urls) {
    const uniqueUrls = new Set();

    for (const rawUrl of urls) {
        try {
            const parsed = new URL(rawUrl);
            if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
                console.log(`Skipping invalid seed URL: ${rawUrl}`);
                continue;
            }
            parsed.hostname = parsed.hostname.toLowerCase();
            parsed.hash = "";
            uniqueUrls.add(parsed.toString());
            } catch {
            console.log(`Skipping invalid seed URL: ${rawUrl}`);
            }
        }

        return uniqueUrls;
}

function buildQueue(finalUrls) {
    const queue = [];

    for (const url of finalUrls) {
        try {
            const parsed = new URL(url);
            queue.push({
                url,
                baseHost: parsed.hostname.toLowerCase()
            });
        } catch {
            // skip invalid urls
        }
    }

    return queue;
}

function isOnion(url) {
    try {
        return new URL(url).hostname.endsWith(".onion");
    } catch {
        return false;
    }
}

function normalizeLink(url, baseUrl = null) {
    try {
        const parsed = baseUrl ? new URL(url, baseUrl) : new URL(url);

        if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null;

        parsed.hostname = parsed.hostname.toLowerCase();
        parsed.hash = "";
        // remove trailing /
        if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
            parsed.pathname = parsed.pathname.slice(0, -1);
        }
        return parsed.toString();
    } catch {
        return null;
    }
}

module.exports = {
    cleanUrls,
    normalizeUrls,
    buildQueue,
    isOnion,
    normalizeLink
};