___

>[!Task]
Stores a URL (string)
Extracts: hostname, pathname
Prints: full URL, hostname, pathname
Stores 3 URLs in an array and loops over them
For each URL: prints hostname

  Basic commands:
```js
const url = "https://blog.torproject.org/"
const urls = ["https://en.wikipedia.org/wiki/Hacker",
                "https://en.wikipedia.org/wiki/Web_crawler"]

// gets the url information
const url_parsed = new URL(url)
// gets the parsed hostname
const parsed_hostname = url_parsed.hostname
// gets the parsed pathname
const parsed_pathname = url_parsed.pathname

console.log("Hostname: " + parsed_hostname + " | Pathname: " + parsed_pathname)
```

Loop to fetch parsed urls:
  ```js
  //loop through each element
  for (let u of urls) {
    const data_parsing = new URL(u)
    const data_hname = data_parsing.hostname
    const data_pname = data_parsing.pathname

    console.log("Hostname: " + data_hname + " | Pathname: " + data_pname)
}
  ```

