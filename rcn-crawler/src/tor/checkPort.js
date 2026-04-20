/**
 * @file checkPort.js
 * @description Low-level TCP port reachability check used to detect Tor.
 */

const net = require("node:net");

/**
 * Tests whether a TCP port is open and accepting connections.
 * Resolves to true on successful connect, false on error or timeout.
 * Never rejects — all failure modes return false.
 *
 * @param {number} port              - TCP port number to probe
 * @param {string} [host="127.0.0.1"] - Hostname or IP address to connect to
 * @param {number} [timeout=1500]    - Connection timeout in milliseconds
 * @returns {Promise<boolean>}       - true if the port is open, false otherwise
 */
function checkPort(port, host = "127.0.0.1", timeout = 1500) {
    return new Promise((resolve) => {
        const socket = new net.Socket();

        socket.setTimeout(timeout);

        socket.once("connect", () => {
            socket.destroy();
            resolve(true);
        });

        socket.once("error", () => {
            resolve(false);
        });

        socket.once("timeout", () => {
            socket.destroy();
            resolve(false);
        });

        socket.connect(port, host);
    });
}

module.exports = { checkPort };