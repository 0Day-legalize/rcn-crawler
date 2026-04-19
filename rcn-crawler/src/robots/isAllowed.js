function isAllowed(url, parser) {
    try {
        const result = parser.isAllowed(url, "*");
        // robots-parser returns undefined when no rule matches; treat as allowed
        return result === undefined ? true : result;
    } catch {
        return false;
    }
}

module.exports = { isAllowed };
