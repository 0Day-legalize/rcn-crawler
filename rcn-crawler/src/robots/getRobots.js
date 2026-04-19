const axios = require("axios");

const cache = new Map();

async function getRobots(baseHost, torAgent) {
    if (cache.has(baseHost)) {
        return cache.get(baseHost);
    }

    const url = `http://${baseHost}/robots.txt`;

    try {
        const res = await axios.get(url, {
            timeout: 5000,
            responseType: "text",
            validateStatus: () => true,
            maxRedirects: 5,
            httpAgent: torAgent,
            httpsAgent: torAgent
        });

        if (res.status >= 400 || typeof res.data !== "string") {
            cache.set(baseHost, []);
            return [];
        }

        const rules = parseRobots(res.data);
        cache.set(baseHost, rules);
        return rules;
    } catch {
        cache.set(baseHost, []);
        return [];
    }
}

function parseRobots(text) {
    const lines = text.split(/\r?\n/);
    const rules = [];
    let applies = false;

    for (let line of lines) {
        line = line.trim();

        if (!line || line.startsWith("#")) continue;

        if (line.toLowerCase().startsWith("user-agent:")) {
            const agent = line.slice("user-agent:".length).trim();
            applies = agent === "*";
            continue;
        }

        if (applies && line.toLowerCase().startsWith("disallow:")) {
            const path = line.slice("disallow:".length).trim();
            if (path) {
                rules.push(path);
            }
        }
    }

    return rules;
}

module.exports = { getRobots };