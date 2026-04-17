/*
🎯 Task
Create:

a file called urls.txt
a file called challenge3.js

Your program should:

Read URLs from urls.txt
Turn the file into an array
Remove empty lines
Print each URL
Print how many URLs were loaded
*/

// Check where Node.js runs from for path issue
// console.log("cwd:", process.cwd());


const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(__dirname, "urls.txt");
const file_content = fs.readFileSync(filePath, "utf-8");

function cleanurl(fileContent){
    const result = []
    const lines = fileContent.split("\n");

    for (const l of lines){
        const cleaned = l.trim()
        if(!cleaned) continue;
        result.push(cleaned)
    }
    return {
        result,
        count: result.length
    }
}

const data = cleanurl(file_content);

console.log("URLs:", data.result);
console.log("Count:", data.count);