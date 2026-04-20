/**
 * @file findTorPort.js
 * @description Detects which port the local Tor SOCKS5 proxy is listening on.
 */

const { TOR_HOST, TOR_PORTS } = require("../config");
const { checkPort }           = require("./checkPort");

/**
 * Probes each candidate Tor port in order and returns the first one that
 * responds to a TCP connection.
 *
 * Checks 9050 (system Tor daemon) before 9150 (Tor Browser).
 * Returns null if Tor is not running on any known port.
 *
 * @async
 * @returns {Promise<number|null>} - Open SOCKS5 port number, or null if none found
 */
async function findTorPort() {
    for (const port of TOR_PORTS) {
        const isOpen = await checkPort(port, TOR_HOST);
        if (isOpen) return port;
    }

    return null;
}

module.exports = { findTorPort };