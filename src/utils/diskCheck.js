const fs   = require("node:fs");
const zlib = require("node:zlib");
const path = require("node:path");
const { log } = require("./logger");

const PAGES_DIR = path.join(__dirname, "..", "..", "data", "pages");
const THRESHOLD = 0.5;

function diskRatio() {
    try {
        const stat  = fs.statfsSync(PAGES_DIR);
        const total = stat.blocks * stat.bsize;
        const free  = stat.bfree  * stat.bsize;
        return (total - free) / total;
    } catch {
        return 0;
    }
}

function compressPages() {
    if (!fs.existsSync(PAGES_DIR)) return 0;
    const files = fs.readdirSync(PAGES_DIR).filter(f => f.endsWith(".html"));
    let count = 0;
    for (const file of files) {
        const src  = path.join(PAGES_DIR, file);
        const dest = src + ".gz";
        try {
            if (fs.existsSync(dest)) { fs.unlinkSync(src); continue; }
            fs.writeFileSync(dest, zlib.gzipSync(fs.readFileSync(src)));
            fs.unlinkSync(src);
            count++;
        } catch { /* skip locked/missing files */ }
    }
    return count;
}

function checkAndCompress() {
    const ratio = diskRatio();
    if (ratio < THRESHOLD) return;
    log.warn(`[disk] ${Math.round(ratio * 100)}% full — compressing saved pages`);
    const n = compressPages();
    log.warn(`[disk] compressed ${n} pages, disk now at ${Math.round(diskRatio() * 100)}%`);
}

module.exports = { checkAndCompress, compressPages };
