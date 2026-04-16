/*
🎯 Task

Create challenge2.js that:

Takes a list of URLs (array)
Normalizes them:
remove #hash
lowercase hostname
Stores only unique URLs
Prints:
normalized URLs
*/

const urls = [
    "https://EXAMPLE.com/page#section",
    "https://example.com/page",
    "https://example.com/page#other",
    "https://example.com/other"
];

//url parsing
const url = new URL(input)

//Modify URL
url.hash = ""
url.hostname = url.hostname.toLowerCase();
url.toString()

// Set to store unique values
const seen = new Set();
seen.add(value);


// Input URLs
const urls = [
  "https://EXAMPLE.com/page#section",
  "https://example.com/page",
  "https://example.com/page#other",
  "https://example.com/other"
];

// Normalize function
function normalizeUrl(input) {
  const url = new URL(input);

  url.hash = ""; // remove #fragment
  url.hostname = url.hostname.toLowerCase(); // normalize hostname

  return url.toString();
}

// Store unique URLs
const uniqueUrls = new Set();

// Process URLs
for (const u of urls) {
  const normalized = normalizeUrl(u);
  uniqueUrls.add(normalized);
}

// Print results
for (const u of uniqueUrls) {
  console.log(u);
}

console.log("\nUnique URLs:", uniqueUrls.size);