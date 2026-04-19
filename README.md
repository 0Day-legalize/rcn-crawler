# 🕷️ RCN WebCrawler

<p align="center">
  <img src="./assets/logo.png" width="320">
</p>

<p align="center">
  Dark Web Crawler • Onion Support • Queue Engine
</p>

---

## 🚀 Features

- 🌐 Crawl standard websites  
- 🧅 Full `.onion` support via Tor  
- 🔁 Queue-based crawling (no duplicates)  
- ⚡ Fast parsing with Axios + Cheerio  

---

## 🧠 Architecture

```
Crawler → Tor (SOCKS5) → Internet / Onion Network
```

- Routes traffic through Tor for anonymity  
- Parses HTML and extracts links  
- Tracks visited URLs to avoid loops  

---

## ⚙️ Setup

### 1. Install Node.js (LTS)

```bash
node -v
npm -v
```

---

### 2. Install Dependencies

```bash
npm install axios cheerio socks-proxy-agent
```

---

## 📁 Structure

```
/project
 ├── RCNCrawler.js
 ├── urls.txt
 └── package.json
```

---

## 📄 Input (`urls.txt`)

```txt
https://example.com
http://exampleonionaddress.onion/
```

**Rules**
- One URL per line  
- Must include protocol (`http://` or `https://`)  
- No commas or quotes  

---

## 🧅 Tor Setup

### 🪟 Windows

```
# Extract Tor to:
C:\tor

# Create config:
C:\tor\torrc
```

**torrc**
```
SocksPort 127.0.0.1:9050
DataDirectory C:\tor\data
```

```
# Start Tor
cd C:\tor
.\tor.exe -f .\torrc
```

Wait for:
```
Bootstrapped 100% (done)
```

---

### 🐧 Linux

```bash
sudo apt update
sudo apt install tor

sudo systemctl start tor
sudo systemctl enable tor
```

---

## 🔌 Verify Tor

**Windows**
```powershell
Test-NetConnection 127.0.0.1 -Port 9050
```

**Linux**
```bash
ss -tulnp | grep 9050
```

Expected:
```
Port 9050 is open
```

---

## ⚠️ Proxy (Critical)

```js
const agent = new SocksProxyAgent("socks5h://127.0.0.1:9050");
```

### Why `socks5h`?

- ✅ DNS via Tor → required for `.onion`  
- ❌ `socks5` leaks DNS outside Tor  

---

## 🚀 Usage 

1. git clone https://github.com/0Day-legalize/WebCrawler.git

2. cd rcn-crawler

3. npm install

4. Add more urls to urls.txt

5. make sure tor is running

6. npm start
---

## 🛠️ Notes

- `.onion` requires Tor — won’t work otherwise  
- Crawling is slower due to Tor routing  
- Some sites block bots or rate-limit  

---

## 📌 Roadmap

- [ ] Depth limiting  
- [ ] Concurrency control  
- [ ] Output (JSON / CSV)  
- [ ] Retry & error handling  
