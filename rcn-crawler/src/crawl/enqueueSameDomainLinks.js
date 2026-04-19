function enqueueSameDomainLinks(links, queue, visited, queued, baseHost) {
    for (const link of links) {
        try {
            const parsed = new URL(link);

            if (parsed.hostname.toLowerCase() !== baseHost) continue;
            if (visited.has(link)) continue;
            if (queued.has(link)) continue;

            queue.push({
                url: link,
                baseHost
            });

            queued.add(link);
        } catch {
            // ignore invalid links
        }
    }
}

module.exports = { enqueueSameDomainLinks };