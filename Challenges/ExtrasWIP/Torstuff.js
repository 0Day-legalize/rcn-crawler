const { SocksProxyAgent } = require("socks-proxy-agent");

const agent = new SocksProxyAgent("socks5h://127.0.0.1:9050");

async function fetchUrl(url) {
    try {
        const response = await fetch(url, {
            agent
        });

        const html = await response.text();

        return {
            url,
            status: response.status,
            server: response.headers.get("server"),
            poweredBy: response.headers.get("x-powered-by"),
            html
        };
    } catch (error) {
        return {
            url,
            error: error.message
        };
    }
}

/*WIP
    function isOnion(url) {
        return url.includes(".onion");
    }
*/