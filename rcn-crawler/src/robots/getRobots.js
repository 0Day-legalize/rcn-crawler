const axios = require("axios");
const { MAX_ROBOTS_SIZE, USER_AGENTS } = require("../config");

// Cache entries expire after 30 minutes so long-running crawls pick up changes
const CACHE_TTL_MS = 30 * 60 * 1000;

const cache = new Map(); // baseHost → { rules, expiresAt }

function randomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function getRobots(baseHost, torAgent) {
    const cached = cache.get(baseHost);
    if (cached && Date.now() < cached.expiresAt) {
        return cached.rules;
    }

    const url = `http://${baseHost}/robots.txt`;

    try {
        const response = await axios.get(url, {
            timeout: 5000,
            responseType: "stream",          // stream so we can enforce size cap
            validateStatus: () => true,
            maxRedirects: 3,
            httpAgent:  torAgent,
            httpsAgent: torAgent,
            headers: { "User-Agent": randomUserAgent() }
        });

        if (response.status >= 400) {
            setCache(baseHost, []);
            return [];
        }

        // Read up to MAX_ROBOTS_SIZE — treat oversized robots.txt as empty
        const text = await readStream(response.data, MAX_ROBOTS_SIZE);

        if (text === null) {
            console.warn(`[robots] ${baseHost} robots.txt exceeded size limit — treating as empty`);
            setCache(baseHost, []);
            return [];
        }

        const rules = parseRobots(text);
        setCache(baseHost, rules);
        return rules;

    } catch {
        setCache(baseHost, []);
        return [];
    }
}

function setCache(baseHost, rules) {
    cache.set(baseHost, { rules, expiresAt: Date.now() + CACHE_TTL_MS });
}

// Reads a stream up to maxBytes — returns null if exceeded
function readStream(stream, maxBytes) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let totalBytes = 0;

        stream.on("data", (chunk) => {
            totalBytes += chunk.length;
            if (totalBytes > maxBytes) {
                stream.destroy();
                resolve(null);
                return;
            }
            chunks.push(chunk);
        });

        stream.on("end",   () => resolve(Buffer.concat(chunks).toString("utf-8")));
        stream.on("error", (err) => reject(err));
    });
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
            if (path) rules.push(path);
        }
    }

    return rules;
}

module.exports = { getRobots };