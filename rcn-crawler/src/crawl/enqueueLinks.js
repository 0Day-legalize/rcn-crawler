function enqueueLinks(links, queue, visited, queued) {
    for (const link of links) {
        try {
            const parsed = new URL(link);
            const normalizedHost = parsed.hostname.toLowerCase();

            if (visited.has(link)) continue;
            if (queued.has(link)) continue;

            queue.push({
                url: link,
                baseHost: normalizedHost
            });

            queued.add(link);
        } catch {
            // Ignore malformed links
        }
    }
}

module.exports = { enqueueLinks };