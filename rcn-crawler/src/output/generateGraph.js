#!/usr/bin/env node
/**
 * @file generateGraph.js
 * @description Reads data/results.json and writes data/graph.html —
 * an interactive force-directed domain connection map.
 *
 * Usage:
 *   node src/output/generateGraph.js
 *   npm run graph
 *   require("./generateGraph").generateGraph()  — called automatically on exit
 */

const fs   = require("node:fs");
const path = require("node:path");

const DATA_DIR     = path.join(__dirname, "..", "..", "data");
const RESULTS_PATH = path.join(DATA_DIR, "results.json");
const OUTPUT_PATH  = path.join(DATA_DIR, "graph.html");

// ─── Core generation function ─────────────────────────────────────────────────

/**
 * Reads results.json and writes graph.html.
 * Returns true on success, false if data is missing or insufficient.
 *
 * @returns {boolean}
 */
function generateGraph() {
// ─── Load data ────────────────────────────────────────────────────────────────

if (!fs.existsSync(RESULTS_PATH)) {
    console.error(`results.json not found at ${RESULTS_PATH}`);
    return false;
}

let raw;
try {
    raw = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf-8"));
} catch {
    console.error("Failed to parse results.json — file may be corrupt.");
    return false;
}

const pages = raw.pages ?? [];
if (pages.length === 0) {
    console.error("results.json contains no crawled pages — skipping graph.");
    return false;
}

// ─── Build graph ──────────────────────────────────────────────────────────────

/** @type {Map<string, {id:string, pages:number, successPages:number, isOnion:boolean}>} */
const nodeMap = new Map();
/** @type {Map<string, {source:string, target:string, count:number}>} */
const edgeMap = new Map();

function ensureNode(domain) {
    if (!nodeMap.has(domain)) {
        nodeMap.set(domain, {
            id:           domain,
            pages:        0,
            successPages: 0,
            isOnion:      domain.endsWith(".onion"),
            title:        null,
        });
    }
    return nodeMap.get(domain);
}

for (const page of pages) {
    if (!page.baseHost) continue;

    const node = ensureNode(page.baseHost);
    node.pages++;
    if (page.success) node.successPages++;
    if (!node.title && page.meta?.title) node.title = page.meta.title;

    for (const link of (page.links ?? [])) {
        try {
            const targetHost = new URL(link).hostname.toLowerCase();
            if (targetHost === page.baseHost) continue;
            ensureNode(targetHost);

            const key = `${page.baseHost}→${targetHost}`;
            if (!edgeMap.has(key)) {
                edgeMap.set(key, { source: page.baseHost, target: targetHost, count: 0 });
            }
            edgeMap.get(key).count++;
        } catch { /* skip malformed */ }
    }
}

const nodes = [...nodeMap.values()];
const links = [...edgeMap.values()];

const meta = {
    crawledAt:    raw.summary?.exportedAt ?? new Date().toISOString(),
    totalPages:   raw.summary?.processedCount ?? pages.length,
    totalDomains: nodes.length,
    totalEdges:   links.length,
};

const graphData = JSON.stringify({ nodes, links, meta });

// ─── HTML template ────────────────────────────────────────────────────────────

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RCN — Connection Map</title>
  <script src="https://d3js.org/d3.v7.min.js"><\/script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #0d1117;
      color: #e6edf3;
      font-family: 'Segoe UI', system-ui, monospace;
      overflow: hidden;
      height: 100vh;
    }

    #canvas { display: block; width: 100vw; height: 100vh; }

    /* ── Nodes ── */
    .node { cursor: pointer; }
    .node circle {
      stroke-width: 1.5;
      transition: stroke-width 0.15s;
    }
    .node text {
      fill: #94a3b8;
      font-size: 10px;
      pointer-events: none;
      user-select: none;
    }
    .node.highlighted circle { stroke-width: 3; filter: drop-shadow(0 0 6px currentColor); }
    .node.dimmed { opacity: 0.12; }

    /* ── Links ── */
    .link { fill: none; transition: stroke-opacity 0.15s; }
    .link.highlighted { stroke-opacity: 0.9 !important; }
    .link.dimmed      { stroke-opacity: 0.04 !important; }

    /* ── Panels ── */
    .panel {
      position: fixed;
      background: rgba(13, 17, 23, 0.88);
      border: 1px solid #21262d;
      border-radius: 10px;
      padding: 16px 20px;
      backdrop-filter: blur(10px);
    }

    #stats { top: 20px; left: 20px; min-width: 200px; }
    #stats h1 { font-size: 15px; font-weight: 600; margin-bottom: 10px; color: #e6edf3; }
    #stats .row { font-size: 12px; color: #8b949e; line-height: 2; display: flex; justify-content: space-between; gap: 20px; }
    #stats .row span { color: #58a6ff; font-weight: 500; }

    #legend { bottom: 20px; left: 20px; }
    #legend .item { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #8b949e; margin: 5px 0; }
    #legend .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

    #detail { top: 20px; right: 20px; min-width: 230px; display: none; }
    #detail-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
    #detail h2 { font-size: 12px; font-weight: 600; color: #e6edf3; word-break: break-all; max-width: 190px; }
    #detail-close { cursor: pointer; color: #8b949e; font-size: 16px; line-height: 1; flex-shrink: 0; }
    #detail-close:hover { color: #e6edf3; }
    #detail .row { font-size: 12px; color: #8b949e; line-height: 2; display: flex; justify-content: space-between; gap: 16px; }
    #detail .row span { color: #58a6ff; font-weight: 500; }
    #detail .badge {
      display: inline-block;
      padding: 1px 8px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 500;
      margin-top: 6px;
    }
    .badge-onion  { background: rgba(168,85,247,0.2); color: #a855f7; border: 1px solid #a855f760; }
    .badge-clear  { background: rgba(59,130,246,0.2);  color: #3b82f6; border: 1px solid #3b82f660; }

    #hint {
      position: fixed;
      bottom: 20px;
      right: 20px;
      font-size: 10px;
      color: #374151;
      text-align: right;
      line-height: 1.9;
      pointer-events: none;
    }

    #tooltip {
      position: fixed;
      background: rgba(22, 27, 34, 0.95);
      border: 1px solid #30363d;
      border-radius: 7px;
      padding: 9px 13px;
      font-size: 11px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.1s;
      z-index: 50;
      max-width: 220px;
    }

    #search-wrap {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
    }
    #search {
      background: rgba(22,27,34,0.92);
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 7px 14px;
      color: #e6edf3;
      font-size: 12px;
      width: 240px;
      outline: none;
      transition: border-color 0.15s;
    }
    #search::placeholder { color: #4b5563; }
    #search:focus { border-color: #58a6ff; }
  </style>
</head>
<body>

<svg id="canvas"></svg>

<div id="tooltip"></div>

<div id="stats" class="panel">
  <h1>🕷️ RCN Connection Map</h1>
  <div class="row">Domains     <span id="s-domains"></span></div>
  <div class="row">Connections <span id="s-edges"></span></div>
  <div class="row">Pages       <span id="s-pages"></span></div>
  <div class="row">Crawled     <span id="s-date"></span></div>
</div>

<div id="legend" class="panel">
  <div class="item"><div class="dot" style="background:#a855f7"></div>.onion hidden service</div>
  <div class="item"><div class="dot" style="background:#3b82f6"></div>Clearnet domain</div>
  <div class="item" style="margin-top:6px"><div class="dot" style="background:#15803d;border-radius:2px;height:3px;width:14px;margin-right:4px"></div>Cross-domain link</div>
  <div class="item"><div class="dot" style="background:#22c55e;border-radius:2px;height:3px;width:14px;margin-right:4px"></div>Outgoing (selected)</div>
  <div class="item"><div class="dot" style="background:#f59e0b;border-radius:2px;height:3px;width:14px;margin-right:4px"></div>Incoming (selected)</div>
  <div class="item" style="margin-top:6px;font-size:10px;color:#4b5563">Node size = pages crawled</div>
</div>

<div id="detail" class="panel">
  <div id="detail-header">
    <h2 id="detail-host"></h2>
    <span id="detail-close">✕</span>
  </div>
  <div id="detail-badge"></div>
  <div style="margin-top:10px">
    <div class="row">Pages crawled <span id="d-pages"></span></div>
    <div class="row">Successful    <span id="d-success"></span></div>
    <div class="row">Links out     <span id="d-out"></span></div>
    <div class="row">Links in      <span id="d-in"></span></div>
  </div>
</div>

<div id="search-wrap">
  <input id="search" type="text" placeholder="Search domain…" autocomplete="off" spellcheck="false">
</div>

<div id="hint">
  Scroll to zoom · Drag to pan<br>
  Click node for details · Drag node to pin
</div>

<script>
const DATA = ${graphData};

const { nodes, links, meta } = DATA;

// ── Stats panel ───────────────────────────────────────────────────────────────
document.getElementById("s-domains").textContent = meta.totalDomains.toLocaleString();
document.getElementById("s-edges").textContent   = meta.totalEdges.toLocaleString();
document.getElementById("s-pages").textContent   = meta.totalPages.toLocaleString();
document.getElementById("s-date").textContent    =
  new Date(meta.crawledAt).toLocaleDateString(undefined, { year:"numeric", month:"short", day:"numeric" });

// ── Degree maps ───────────────────────────────────────────────────────────────
const outDegree = new Map(nodes.map(n => [n.id, 0]));
const inDegree  = new Map(nodes.map(n => [n.id, 0]));
for (const l of links) {
  outDegree.set(l.source, (outDegree.get(l.source) || 0) + 1);
  inDegree.set(l.target,  (inDegree.get(l.target)  || 0) + 1);
}

// ── Scales ────────────────────────────────────────────────────────────────────
const maxPages = d3.max(nodes, d => d.pages) || 1;
const maxCount = d3.max(links, d => d.count) || 1;

const radius  = d => Math.max(5, Math.min(32, 5 + Math.sqrt(d.pages / maxPages) * 27));
const color   = d => d.isOnion ? "#a855f7" : "#3b82f6";
const eWidth  = d => 0.4 + (d.count / maxCount) * 2.5;
const eOpacity= d => 0.15 + (d.count / maxCount) * 0.45;

// ── SVG ───────────────────────────────────────────────────────────────────────
const svg = d3.select("#canvas");
let W = window.innerWidth, H = window.innerHeight;
svg.attr("width", W).attr("height", H);

const g = svg.append("g");

// Arrow markers
const defs = svg.append("defs");
for (const [id, clr] of [["default","#15803d"],["out","#22c55e"],["in","#f59e0b"],["onion","#a855f7"],["clear","#3b82f6"]]) {
  defs.append("marker")
    .attr("id",          \`arrow-\${id}\`)
    .attr("viewBox",     "0 -4 8 8")
    .attr("refX",        8)
    .attr("refY",        0)
    .attr("markerWidth", 6)
    .attr("markerHeight",6)
    .attr("orient",      "auto")
    .append("path")
    .attr("d",    "M0,-4L8,0L0,4")
    .attr("fill", clr);
}

// ── Simulation ────────────────────────────────────────────────────────────────
const simulation = d3.forceSimulation(nodes)
  .force("link",      d3.forceLink(links).id(d => d.id).distance(220).strength(0.3))
  .force("charge",    d3.forceManyBody().strength(d => -600 - radius(d) * 12))
  .force("center",    d3.forceCenter(W / 2, H / 2).strength(0.04))
  .force("collision", d3.forceCollide().radius(d => radius(d) + 40).strength(0.9));

// ── Edges ─────────────────────────────────────────────────────────────────────
const linkG = g.append("g").attr("class", "links");
const link = linkG.selectAll("line")
  .data(links)
  .join("line")
  .attr("class", "link")
  .attr("stroke", "#15803d")
  .attr("stroke-width",   d => eWidth(d))
  .attr("stroke-opacity", d => eOpacity(d))
  .attr("marker-end", "url(#arrow-default)");

// ── Nodes ─────────────────────────────────────────────────────────────────────
const nodeG = g.append("g").attr("class", "nodes");
const node = nodeG.selectAll(".node")
  .data(nodes)
  .join("g")
  .attr("class", "node")
  .call(d3.drag()
    .on("start", (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
    .on("drag",  (e, d) => { d.fx = e.x; d.fy = e.y; })
    .on("end",   (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

node.append("circle")
  .attr("r",            radius)
  .attr("fill",         d => color(d) + "22")
  .attr("stroke",       color)
  .attr("stroke-width", 1.5);

node.append("text")
  .attr("dy",          d => radius(d) + 14)
  .attr("text-anchor", "middle")
  .attr("fill",        "#94a3b8")
  .attr("font-size",   "10px")
  .text(d => d.id.length > 24 ? d.id.slice(0, 22) + "…" : d.id);

node.append("text")
  .attr("dy",          d => radius(d) + 26)
  .attr("text-anchor", "middle")
  .attr("fill",        "#4b5563")
  .attr("font-size",   "9px")
  .text(d => {
    if (!d.title) return "";
    return d.title.length > 28 ? d.title.slice(0, 26) + "…" : d.title;
  });

// ── Tooltip ───────────────────────────────────────────────────────────────────
const tooltip = d3.select("#tooltip");

node
  .on("mouseover", (e, d) => {
    tooltip.style("opacity", 1).html(
      \`<strong style="color:#e6edf3">\${d.id}</strong><br>
       <span style="color:#8b949e">Pages: </span><span style="color:#58a6ff">\${d.pages}</span> &nbsp;
       <span style="color:#8b949e">OK: </span><span style="color:#3fb950">\${d.successPages}</span>\`
    );
  })
  .on("mousemove", e => tooltip.style("left", (e.clientX+14)+"px").style("top", (e.clientY-34)+"px"))
  .on("mouseout",  () => tooltip.style("opacity", 0));

// ── Click: highlight + detail panel ──────────────────────────────────────────
let selected = null;

node.on("click", (e, d) => {
  e.stopPropagation();
  if (selected === d.id) { clearSelection(); return; }
  selected = d.id;

  const neighbours = new Set([d.id]);
  links.forEach(l => {
    const s = l.source.id ?? l.source;
    const t = l.target.id ?? l.target;
    if (s === d.id) neighbours.add(t);
    if (t === d.id) neighbours.add(s);
  });

  node.classed("dimmed",      n => !neighbours.has(n.id))
      .classed("highlighted", n => n.id === d.id);

  link
    .classed("dimmed",      l => { const s=l.source.id??l.source, t=l.target.id??l.target; return s!==d.id&&t!==d.id; })
    .classed("highlighted", l => { const s=l.source.id??l.source, t=l.target.id??l.target; return s===d.id||t===d.id; })
    .attr("stroke", l => {
      const s=l.source.id??l.source, t=l.target.id??l.target;
      if (s===d.id) return "#22c55e"; // outgoing → bright green
      if (t===d.id) return "#f59e0b"; // incoming → amber
      return "#15803d";
    })
    .attr("marker-end", l => {
      const s=l.source.id??l.source, t=l.target.id??l.target;
      if (s===d.id) return "url(#arrow-out)";
      if (t===d.id) return "url(#arrow-in)";
      return "url(#arrow-default)";
    });

  const panel = document.getElementById("detail");
  panel.style.display = "block";
  document.getElementById("detail-host").textContent    = d.id;
  document.getElementById("detail-badge").innerHTML     = d.isOnion
    ? '<span class="badge badge-onion">.onion hidden service</span>'
    : '<span class="badge badge-clear">Clearnet</span>';
  document.getElementById("d-pages").textContent   = d.pages;
  document.getElementById("d-success").textContent = d.successPages;
  document.getElementById("d-out").textContent     = outDegree.get(d.id) || 0;
  document.getElementById("d-in").textContent      = inDegree.get(d.id)  || 0;
});

function clearSelection() {
  selected = null;
  node.classed("dimmed", false).classed("highlighted", false);
  link.classed("dimmed", false).classed("highlighted", false)
      .attr("stroke", "#15803d")
      .attr("marker-end", "url(#arrow-default)");
  document.getElementById("detail").style.display = "none";
}

svg.on("click", clearSelection);
document.getElementById("detail-close").addEventListener("click", clearSelection);

// ── Search ────────────────────────────────────────────────────────────────────
document.getElementById("search").addEventListener("input", function () {
  const q = this.value.trim().toLowerCase();
  if (!q) { clearSelection(); return; }

  const match = nodes.find(n => n.id.toLowerCase().includes(q));
  if (!match) return;

  // Centre view on matching node after a tick
  simulation.tick();
  const t = d3.zoomTransform(svg.node());
  const x = match.x ?? W / 2;
  const y = match.y ?? H / 2;
  svg.transition().duration(600).call(
    d3.zoom().transform,
    d3.zoomIdentity.translate(W/2 - x, H/2 - y)
  );

  // Simulate click
  const datum = node.data().find(n => n.id === match.id);
  if (datum) node.filter(n => n.id === match.id).dispatch("click");
});

// ── Tick ──────────────────────────────────────────────────────────────────────
simulation.on("tick", () => {
  link
    .attr("x1", d => d.source.x)
    .attr("y1", d => d.source.y)
    .attr("x2", d => {
      const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y;
      const dist = Math.sqrt(dx*dx + dy*dy) || 1;
      const r = radius(d.target);
      return d.target.x - (dx / dist) * (r + 9);
    })
    .attr("y2", d => {
      const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y;
      const dist = Math.sqrt(dx*dx + dy*dy) || 1;
      const r = radius(d.target);
      return d.target.y - (dy / dist) * (r + 9);
    });

  node.attr("transform", d => \`translate(\${d.x},\${d.y})\`);
});

// ── Zoom ──────────────────────────────────────────────────────────────────────
svg.call(
  d3.zoom().scaleExtent([0.05, 12]).on("zoom", e => g.attr("transform", e.transform))
);

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener("resize", () => {
  W = window.innerWidth; H = window.innerHeight;
  svg.attr("width", W).attr("height", H);
  simulation.force("center", d3.forceCenter(W/2, H/2).strength(0.05)).alpha(0.3).restart();
});
<\/script>
</body>
</html>`;

// ─── Write output ─────────────────────────────────────────────────────────────

fs.writeFileSync(OUTPUT_PATH, html, "utf-8");
console.log(`Graph written → ${OUTPUT_PATH}`);
console.log(`  ${nodes.length} domains  ·  ${links.length} connections  ·  ${meta.totalPages} pages`);
console.log(`Open in a browser: xdg-open ${OUTPUT_PATH}`);
return true;
} // end generateGraph()

module.exports = { generateGraph };

// CLI entry point
if (require.main === module) {
    if (!generateGraph()) process.exit(1);
}
