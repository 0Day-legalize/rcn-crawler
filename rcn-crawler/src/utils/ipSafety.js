/**
 * utils/ipSafety.js
 *
 * Blocks SSRF attempts by rejecting URLs that resolve to private,
 * loopback, or link-local IP ranges before any request is made.
 *
 * Covers:
 *   127.0.0.0/8      loopback
 *   10.0.0.0/8       private
 *   172.16.0.0/12    private
 *   192.168.0.0/16   private
 *   169.254.0.0/16   link-local (AWS metadata etc.)
 *   ::1              IPv6 loopback
 *   fc00::/7         IPv6 unique local
 *   fe80::/10        IPv6 link-local
 */

const dns  = require("node:dns").promises;
const net  = require("node:net");

// IPv4 private ranges as [network, mask] pairs
const PRIVATE_IPV4 = [
    [0x7f000000, 0xff000000],  // 127.0.0.0/8   loopback
    [0x0a000000, 0xff000000],  // 10.0.0.0/8    private
    [0xac100000, 0xfff00000],  // 172.16.0.0/12 private
    [0xc0a80000, 0xffff0000],  // 192.168.0.0/16 private
    [0xa9fe0000, 0xffff0000],  // 169.254.0.0/16 link-local
    [0x00000000, 0xffffffff],  // 0.0.0.0        unspecified
];

function ipv4ToInt(ip) {
    return ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function isPrivateIPv4(ip) {
    const n = ipv4ToInt(ip);
    return PRIVATE_IPV4.some(([network, mask]) => (n & mask) === network);
}

function isPrivateIPv6(ip) {
    const normalized = ip.toLowerCase().replace(/^\[|\]$/g, "");
    // ::1 loopback
    if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;
    // fc00::/7 unique local (fc__ or fd__)
    if (/^f[cd]/i.test(normalized)) return true;
    // fe80::/10 link-local
    if (/^fe[89ab]/i.test(normalized)) return true;
    return false;
}

function isPrivateIP(ip) {
    if (net.isIPv4(ip)) return isPrivateIPv4(ip);
    if (net.isIPv6(ip)) return isPrivateIPv6(ip);
    return false;
}

/**
 * Returns true if the URL is safe to fetch (not pointing at a private IP).
 * For .onion addresses, always returns true (Tor handles routing).
 * For hostnames, resolves DNS and checks each returned IP.
 */
async function isSafeUrl(url) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }

    const hostname = parsed.hostname;

    // .onion — Tor handles it, no DNS resolution needed
    if (hostname.endsWith(".onion")) return true;

    // Raw IP address in the URL
    if (net.isIPv4(hostname) || net.isIPv6(hostname)) {
        return !isPrivateIP(hostname);
    }

    // Resolve hostname → check all returned IPs
    try {
        const records = await dns.lookup(hostname, { all: true });
        for (const { address } of records) {
            if (isPrivateIP(address)) return false;
        }
        return true;
    } catch {
        // DNS failure — treat as unsafe (don't fetch unresolvable hosts)
        return false;
    }
}

module.exports = { isSafeUrl };