function isAllowed(url, rules) {
    try {
        const parsed = new URL(url);
        return !rules.some((rule) => parsed.pathname.startsWith(rule));
    } catch {
        return false;
    }
}

module.exports = { isAllowed };