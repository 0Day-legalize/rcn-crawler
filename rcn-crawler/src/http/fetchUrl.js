const axios = require("axios");
const { TIMEOUT_MS } = require("../config");
const { isOnion } = require("../utils/urls");

async function fetchUrl(url, torAgent) {
    try {
        const useTor = isOnion(url);

        const response = await axios.get(url, {
            timeout: TIMEOUT_MS,
            responseType: "text",
            validateStatus: () => true,
            maxRedirects: 5,
            maxContentLength: 5 * 1024 * 1024,
            maxBodyLength: 5 * 1024 * 1024,
            httpAgent: useTor ? torAgent : undefined,
            httpsAgent: useTor ? torAgent : undefined
            });

    return {
        url,
        status: response.status,
        server: response.headers["server"] ?? null,
        poweredBy: response.headers["x-powered-by"] ?? null,
        html: typeof response.data === "string" ? response.data : ""
        };
    } catch (error) {
        return {
        url,
        error: error.message
        };
    }
}

module.exports = { fetchUrl };