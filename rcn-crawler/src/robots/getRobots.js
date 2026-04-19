const axios = require("axios");
const robotsParser = require("robots-parser");

const cache = new Map();

async function getRobots(baseUrl, torAgent) {
    const origin = new URL(baseUrl).origin;

    if (cache.has(origin)) {
        return cache.get(origin);
    }

    const robotsUrl = `${origin}/robots.txt`;

    try {
        const res = await axios.get(robotsUrl, {
            timeout: 5000,
            responseType: "text",
            validateStatus: () => true,
            maxRedirects: 5,
            httpAgent: torAgent,
            httpsAgent: torAgent
        });

        if (res.status >= 400 || typeof res.data !== "string") {
            const permissive = robotsParser(robotsUrl, "");
            cache.set(origin, permissive);
            return permissive;
        }

        const parser = robotsParser(robotsUrl, res.data);
        cache.set(origin, parser);
        return parser;
    } catch {
        const permissive = robotsParser(robotsUrl, "");
        cache.set(origin, permissive);
        return permissive;
    }
}

module.exports = { getRobots };
