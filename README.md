# 🕷️ RCN WebCrawler

<p align="center">
  <img src="./assets/logo.png" width="320"><br><br>

  Dark Web Crawler • Onion Support • Queue Engine<br><br>

  <img src="https://img.shields.io/badge/node-%3E=18-green">
  <img src="https://img.shields.io/badge/status-active-success">
  <img src="https://img.shields.io/badge/tor-supported-purple">
</p>

---

## ⚡ Quick Start

```bash
git clone https://github.com/0Day-legalize/WebCrawler.git
cd WebCrawler/rcn-crawler
npm install
npm start
``` 

---

## 🚀 Features

* 🌐 Crawl standard websites
* 🧅 Full .onion support via Tor
* 🔁 Queue-based crawling (no duplicates)
* 🔒 Same-domain link filtering
* ⚡ Fast parsing with Axios + Cheerio

---

## 🧠 Architecture

Crawler → Tor (SOCKS5) → Internet / Onion Network

* Routes traffic through Tor for anonymity
* Parses HTML and extracts links
* Tracks visited URLs to avoid loops

---

## ⚙️ Requirements

* Node.js (LTS recommended)
* Tor (required for .onion)

Check installation:

```bash
node -v
npm -v
```
---

## 📦 Installation

1. Clone the repository

```bash
git clone https://github.com/0Day-legalize/WebCrawler.git
cd WebCrawler/rcn-crawler
```

2. Install dependencies

```bash
npm install
```

---

## 📄 Input (urls.txt)

Add seed URLs (one per line):

https://example.com
http://exampleonionaddress.onion/

Rules:

* One URL per line
* Must include protocol (http:// or https://)
* No commas or quotes

---

## 🧅 Tor Setup

### Windows

Download Tor: https://www.torproject.org/

Extract to:
```bash
C:\tor
```

Create config:

```bash
C:\tor\torrc
```

torrc paste:

```text
SocksPort 127.0.0.1:9050
DataDirectory C:\tor\data
```

Start Tor:

```bash
cd C:\tor
.\tor.exe -f .\torrc
``` 
Wait for:

```text
Bootstrapped 100% (done)
```

---

### Linux

```bash
sudo apt update
sudo apt install tor

sudo systemctl start tor
sudo systemctl enable tor
```

---

## 🔌 Verify Tor

Windows:

```bash
Test-NetConnection 127.0.0.1 -Port 9050
```

Linux:

```bash
ss -tulnp | grep 9050
```

Expected:

```text
Port 9050 is open
```

---

## 🚀 Run the crawler

```bash
npm start
```

---

## 🧪 Example Output

```text
Tor detected on port 9050
Processing: https://example.com
Status: 200
Links found: 5

Total processed: 5
Total visited: 5
```

---

## 📁 Project Structure

```text
rcn-crawler/
├── src/
│   ├── crawl/
│   ├── http/
│   ├── parser/
│   ├── tor/
│   ├── utils/
│   └── main.js
├── urls.txt
├── package.json
```

---

## ⚠️ Notes

* .onion requires Tor — will fail otherwise
* Crawling is slower due to Tor routing
* Some sites may block or rate-limit requests
* Only same-domain links are followed

---

## 📌 Roadmap

* Depth limiting
* Concurrency (parallel crawling)
* Output (JSON / CSV)
* Retry & error handling
* Tor identity rotation

---

## ⚖️ Disclaimer

This project is for educational and research purposes only.
Do not use it to crawl systems without permission.

---

## 👨‍💻 Author

RCN
