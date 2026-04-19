const net = require("node:net");

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