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
    return [...finalUrls];
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
        parsed.hostname = parsed.hostname.toLowerCase();
        parsed.hash = "";
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