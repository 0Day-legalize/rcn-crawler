/**
 * @file ipSafety.js
 * @description SSRF protection — rejects URLs that resolve to private, loopback,
 * or link-local IP ranges before any network request is made.
 *
 * Covered ranges:
 *   127.0.0.0/8      IPv4 loopback
 *   10.0.0.0/8       IPv4 private
 *   172.16.0.0/12    IPv4 private
 *   192.168.0.0/16   IPv4 private
 *   169.254.0.0/16   IPv4 link-local (AWS metadata service, etc.)
 *   0.0.0.0          IPv4 unspecified
 *   ::1              IPv6 loopback
 *   fc00::/7         IPv6 unique local
 *   fe80::/10        IPv6 link-local
 */

const dns = require("node:dns").promises;
const net = require("node:net");

/**
 * IPv4 private/reserved ranges expressed as [network, mask] integer pairs.
 * Comparisons use bitwise AND: (ip & mask) === network.
 * @type {Array<[number, number]>}
 */
const PRIVATE_IPV4 = [
    [0x7f000000, 0xff000000], // 127.0.0.0/8   loopback
    [0x0a000000, 0xff000000], // 10.0.0.0/8    private
    [0xac100000, 0xfff00000], // 172.16.0.0/12 private
    [0xc0a80000, 0xffff0000], // 192.168.0.0/16 private
    [0xa9fe0000, 0xffff0000], // 169.254.0.0/16 link-local
    [0x00000000, 0xffffffff], // 0.0.0.0        unspecified
];

/**
 * Converts a dotted-decimal IPv4 string to an unsigned 32-bit integer.
 *
 * @param {string} ip - IPv4 address (e.g. "192.168.1.1")
 * @returns {number}  - Unsigned 32-bit integer representation
 */
function ipv4ToInt(ip) {
    return ip.split(".").reduce((acc, octet) => (acc << 8) + Number.parseInt(octet, 10), 0) >>> 0;
}

/**
 * Returns true if the IPv4 address falls within any private or reserved range.
 *
 * @param {string} ip - IPv4 address string
 * @returns {boolean}
 */
function isPrivateIPv4(ip) {
    const n = ipv4ToInt(ip);
    return PRIVATE_IPV4.some(([network, mask]) => (n & mask) === network);
}

/**
 * Returns true if the IPv6 address is loopback, unique local, or link-local.
 *
 * @param {string} ip - IPv6 address string (with or without bracket notation)
 * @returns {boolean}
 */
function isPrivateIPv6(ip) {
    const normalized = ip.toLowerCase().replaceAll(/^\[|\]$/g, "");
    if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true; // loopback
    if (/^f[cd]/i.test(normalized)) return true;  // fc00::/7 unique local
    if (/^fe[89ab]/i.test(normalized)) return true; // fe80::/10 link-local

    // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1) — extract and
    // check the embedded IPv4 address against the private ranges.
    const v4mapped = normalized.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (v4mapped) return isPrivateIPv4(v4mapped[1]);

    return false;
}

/**
 * Returns true if the IP address (v4 or v6) is private or reserved.
 *
 * @param {string} ip - IPv4 or IPv6 address string
 * @returns {boolean}
 */
function isPrivateIP(ip) {
    if (net.isIPv4(ip)) return isPrivateIPv4(ip);
    if (net.isIPv6(ip)) return isPrivateIPv6(ip);
    return false;
}

/**
 * Determines whether a URL is safe to fetch (i.e. does not point at a
 * private or internal network address).
 *
 * Rules:
 * - Malformed URLs → false
 * - `.onion` hostnames → true (Tor handles routing, no DNS needed)
 * - Raw IP literals → checked directly against private ranges
 * - Hostnames → resolved via DNS; every returned A/AAAA record is checked
 * - DNS failure → false (unresolvable hosts are treated as unsafe)
 *
 * @async
 * @param {string} url - Absolute URL string to evaluate
 * @returns {Promise<boolean>} - true if safe to fetch, false otherwise
 */
async function isSafeUrl(url) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }

    const hostname = parsed.hostname;

    if (hostname.endsWith(".onion")) return true;

    if (net.isIPv4(hostname) || net.isIPv6(hostname)) {
        return !isPrivateIP(hostname);
    }

    try {
        const records = await dns.lookup(hostname, { all: true });
        for (const { address } of records) {
            if (isPrivateIP(address)) return false;
        }
        return true;
    } catch {
        return false;
    }
}

module.exports = { isSafeUrl };