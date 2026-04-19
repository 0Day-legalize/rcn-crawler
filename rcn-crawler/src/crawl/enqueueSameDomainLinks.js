function enqueueSameDomainLinks(links, queue, visited, queued, baseHost) {
    for (const link of links) {
        try {
        const parsed = new URL(link);

        if (parsed.hostname !== baseHost) continue;
        if (visited.has(link)) continue;
        if (queued.has(link)) continue;

        queue.push(link);
        queued.add(link);
        } catch {
        // ignore invalid links
        }
    }
}

module.exports = { enqueueSameDomainLinks };