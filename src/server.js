/**
 * @file server.js
 * @description Local web UI for launching and monitoring crawl jobs.
 * Run with: npm run serve  (or node src/server.js)
 * Open:     http://localhost:3000
 */

const express  = require("express");
const path     = require("node:path");
const fs       = require("node:fs");
const zlib     = require("node:zlib");
const { spawn } = require("node:child_process");

const app       = express();
const PORT      = 3000;
const DATA_DIR  = path.join(__dirname, "..", "data");
const RESULTS   = path.join(DATA_DIR, "results.json");
const MAIN      = path.join(__dirname, "main.js");
const PUBLIC    = path.join(__dirname, "..", "public");

app.use(express.json());
app.use(express.static(PUBLIC));

// ── Job state (in-memory, single user) ───────────────────────────────────────

let job = {
    running:   false,
    pid:       null,
    log:       [],       // last 500 lines of stdout/stderr
    startedAt: null,
    config:    null,
    proc:      null,
};

function pushLog(line) {
    job.log.push(line);
    if (job.log.length > 500) job.log.shift();
}

// ── API ───────────────────────────────────────────────────────────────────────

// Start a crawl
app.post("/api/crawl/start", (req, res) => {
    if (job.running) return res.status(409).json({ error: "Crawl already running" });

    const { url, searchTerms, onionOnly } = req.body;
    const maxPages = 50;
    if (!url) return res.status(400).json({ error: "url is required" });

    // Write seed URL to urls.txt
    const urlsPath = path.join(__dirname, "..", "urls.txt");
    fs.writeFileSync(urlsPath, url.trim() + "\n", "utf-8");

    // Build args
    const args = [`--max-pages=${maxPages}`];
    if (searchTerms?.trim()) args.push(`--search-terms=${searchTerms.trim()}`);
    if (onionOnly)           args.push("--onion-only=true");
    args.push("--debug=false");

    job.running   = true;
    job.log       = [];
    job.startedAt = new Date().toISOString();
    job.config    = { url, searchTerms, onionOnly, maxPages };

    const proc = spawn("node", [MAIN, ...args], {
        cwd:   path.join(__dirname, ".."),
        env:   process.env,
        stdio: ["ignore", "pipe", "pipe"],
    });

    job.proc = proc;
    job.pid  = proc.pid;

    const onData = chunk => {
        chunk.toString().split("\n").filter(Boolean).forEach(pushLog);
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);

    proc.on("close", code => {
        pushLog(`[server] Crawl exited with code ${code}`);
        job.running = false;
        job.proc    = null;
        job.pid     = null;
    });

    res.json({ started: true, pid: proc.pid, args });
});

// Stop a crawl
app.post("/api/crawl/stop", (req, res) => {
    if (!job.running || !job.proc) return res.status(404).json({ error: "No crawl running" });
    job.proc.kill("SIGINT");
    res.json({ stopped: true });
});

// Status + log tail
app.get("/api/crawl/status", (req, res) => {
    res.json({
        running:   job.running,
        pid:       job.pid,
        startedAt: job.startedAt,
        config:    job.config,
        log:       job.log,
    });
});

// Results (filtered by search terms if set)
app.get("/api/results", (req, res) => {
    if (!fs.existsSync(RESULTS)) return res.json({ pages: [], summary: null });
    try {
        const raw   = JSON.parse(fs.readFileSync(RESULTS, "utf-8"));
        const pages = raw.pages ?? [];
        const terms = (job.config?.searchTerms ?? "").split(",").map(t => t.trim().toLowerCase()).filter(Boolean);

        const filtered = terms.length
            ? pages.filter(p => p.success && terms.some(t => (p.matchedTerms ?? []).map(m => m.toLowerCase()).includes(t)))
            : pages.filter(p => p.success);

        res.json({ pages: filtered, summary: raw.summary ?? null });
    } catch {
        res.status(500).json({ error: "Failed to parse results.json" });
    }
});

// Download gzipped results
app.get("/api/download", (req, res) => {
    if (!fs.existsSync(RESULTS)) return res.status(404).json({ error: "No results yet" });
    try {
        const raw   = JSON.parse(fs.readFileSync(RESULTS, "utf-8"));
        const pages = raw.pages ?? [];
        const terms = (job.config?.searchTerms ?? "").split(",").map(t => t.trim().toLowerCase()).filter(Boolean);

        const filtered = terms.length
            ? pages.filter(p => p.success && terms.some(t => (p.matchedTerms ?? []).map(m => m.toLowerCase()).includes(t)))
            : pages.filter(p => p.success);

        const payload = JSON.stringify({ summary: raw.summary, pages: filtered }, null, 2);
        const compressed = zlib.gzipSync(Buffer.from(payload, "utf-8"));

        const ts       = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
        const filename = `rcn-results-${ts}.json.gz`;

        res.setHeader("Content-Type", "application/gzip");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Content-Length", compressed.length);
        res.send(compressed);
    } catch {
        res.status(500).json({ error: "Failed to build download" });
    }
});

app.listen(PORT, "127.0.0.1", () => {
    console.log(`RCN Search UI → http://localhost:${PORT}`);
});
