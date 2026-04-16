___


>[!Task]
Takes a list of URLs (array)
Normalizes them: remove # hash, lowercase hostname
Stores only unique URLs
Prints: normalized URLs

Code Solution:
```js
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
```

>[!Tips]
>Fragments are the part from the link that start with #, its the id to jump to a certain point of the page. With the .hash function you can access the part.