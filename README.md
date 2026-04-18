<p align="center">
  <img src="./assets/logo.png" width="400">
</p>

<h1 align="center">🕷️ RCN WebCrawler</h1>

<p align="center">
Dark Web Crawler • Onion Support • Queue-Based Engine
</p>

---
A Node.js crawler that supports:
- 🌐 Normal websites  
- 🧅 `.onion` (dark web) sites via Tor  
- 🔁 Queue-based crawling with duplicate avoidance  

---

## 🧠 Overview


Node.js crawler → SOCKS5 (Tor) → Internet / Onion network


---

# ⚙️ Prerequisites

## 1. Node.js

Install **Node.js (LTS)**

Verify installation:

```bash
node -v
npm -v

___
2. Install Required Packages
npm install axios cheerio socks-proxy-agent

___
3. Project Structure
/project-folder
  ├── RCNCrawler.js
  ├── urls.txt
  └── package.json
___
4. Input File (urls.txt)

Create a file named urls.txt in the same directory as your script.

Example:
https://example.com
http://exampleonionaddress.onion/

Rules:
One URL per line
Must include http:// or https://
No commas or quotes

___
🧅 Tor Setup (Required for .onion)
🪟 Windows
___
Step 1: Download Tor

Download Tor Expert Bundle (x86_64 stable)

___
Step 2: Extract
C:\tor

___
Step 3: Create config (torrc)

Path:
C:\tor\torrc

Content:
SocksPort 127.0.0.1:9050
DataDirectory C:\tor\data
___
Step 4: Create data folder
C:\tor\data
___
Step 5: Start Tor
cd C:\tor
.\tor.exe -f .\torrc

Wait until:
Bootstrapped 100% (done)

___
🐧 Linux
Install Tor
sudo apt update
sudo apt install tor
Start Tor
sudo systemctl start tor
sudo systemctl enable tor

___
🔌 Verify Tor is Running
Windows
Test-NetConnection 127.0.0.1 -Port 9050

___
Linux
ss -tulnp | grep 9050
Expected:
Port 9050 is open

___
⚙️ Proxy Requirement (IMPORTANT)
Your code must include:
const agent = new SocksProxyAgent("socks5h://127.0.0.1:9050");

⚠️ Important:
Use socks5h (NOT socks5)
Required for .onion DNS resolution