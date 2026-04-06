# 🚀 LuxAlgo Telegram Auto-Poster Bot

Fully automated Telegram bot that posts high-quality LuxAlgo & crypto trading content using Google Gemini AI. Features a premium glassmorphic web dashboard for complete control.

## ✨ Features

- **🤖 AI-Powered Content** — Generates rich, formatted posts using Gemini 2.5 Flash across 12 categories
- **📡 Multi-Channel** — Post to multiple Telegram channels simultaneously  
- **🖼️ Auto Images** — Optional AI-generated images via Pollinations.ai (free, no API key)
- **🔑 Multi-Key Rotation** — Round-robin Gemini API key rotation with auto-validation
- **⏱️ Smart Scheduling** — Cron-based scheduling with jittered timing
- **🌐 Premium Dashboard** — Dark glassmorphic UI with live logs, stats, and full configuration
- **🔒 Access Control** — Only approved Telegram users can interact with the bot
- **📊 Rich Formatting** — Posts use Telegram HTML with decorative Unicode symbols and blockquotes

## 🛠️ Quick Start (Local)

```bash
# Clone the repo
git clone https://github.com/Brotin27/LuxAlgo-Auto-Post.git
cd LuxAlgo-Auto-Post

# Install dependencies
npm install

# Create your config from the example
cp config.example.json config.json
# Edit config.json with your bot token, channel IDs, owner ID, etc.

# Start the bot
node server.js
```

Open **http://localhost:3000** → Login with your dashboard password → Add Gemini API keys → Done!

## 🚀 VPS Deployment (Production)

### 1. Server Setup (Ubuntu/Debian)

```bash
# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 (process manager)
sudo npm install -g pm2

# Clone & setup
git clone https://github.com/Brotin27/LuxAlgo-Auto-Post.git
cd LuxAlgo-Auto-Post
npm install

# Create config
cp config.example.json config.json
nano config.json   # Add your credentials
```

### 2. Start with PM2

```bash
# Start the bot
pm2 start ecosystem.config.js

# Auto-start on reboot
pm2 startup
pm2 save

# Useful PM2 commands
pm2 status          # Check status
pm2 logs luxalgo-bot  # View logs
pm2 restart luxalgo-bot  # Restart
pm2 stop luxalgo-bot     # Stop
```

### 3. Nginx Reverse Proxy (Optional — for domain access)

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## ⚙️ Configuration

Edit `config.json` or use the web dashboard:

| Field | Description |
|-------|-------------|
| `botToken` | Telegram Bot API token from @BotFather |
| `channels` | Array of `{id, name}` — target Telegram channels |
| `ownerId` | Your Telegram user ID (owner, cannot be removed) |
| `dashboardPassword` | Password for the web dashboard |
| `geminiKeys` | Array of Google Gemini API keys |
| `postsPerDay` | Number of auto-posts per day (1-24) |
| `timezone` | Timezone for scheduling |
| `imageEnabled` | Enable AI-generated images with posts |
| `affiliateLink` | Your LuxAlgo affiliate URL |
| `affiliateEnabled` | Toggle affiliate CTA in posts |

## 🔑 Getting API Keys

1. **Telegram Bot Token**: Message [@BotFather](https://t.me/BotFather) → `/newbot`
2. **Gemini API Keys**: [Google AI Studio](https://aistudio.google.com/apikey) — Create multiple free keys for rotation
3. **Channel ID**: Add [@userinfobot](https://t.me/userinfobot) to your channel, or use `-100` + channel numeric ID

## 📁 Project Structure

```
├── server.js              # Express server + API routes
├── config.json            # Your configuration (gitignored)
├── config.example.json    # Template config
├── ecosystem.config.js    # PM2 production config
├── package.json
├── public/
│   ├── index.html         # Dashboard UI
│   ├── style.css          # Glassmorphic dark theme
│   └── app.js             # Dashboard frontend logic
└── src/
    ├── bot.js             # Telegram bot + multi-channel sender
    ├── content-generator.js # Gemini AI content + HTML sanitizer
    ├── key-rotator.js     # API key rotation + rate limiting
    ├── logger.js          # Centralized logger with SSE broadcast
    ├── scheduler.js       # Cron-based post scheduler
    └── templates.js       # 12 content categories + 55 prompts
```

## 📜 License

MIT
