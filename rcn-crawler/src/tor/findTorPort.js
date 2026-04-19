const { TOR_HOST, TOR_PORTS } = require("../config");
const { checkPort } = require("./checkPort");

async function findTorPort() {
    for (const port of TOR_PORTS) {
        const isOpen = await checkPort(port, TOR_HOST);
        if (isOpen) return port;
    }

    return null;
}

module.exports = { findTorPort };