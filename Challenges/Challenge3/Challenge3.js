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
const line = file_content.split("\n");
line.trim()

console.log(line);