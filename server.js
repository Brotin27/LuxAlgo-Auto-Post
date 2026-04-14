const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const Bot = require('./src/bot');
const ContentGenerator = require('./src/content-generator');
const KeyRotator = require('./src/key-rotator');
const Scheduler = require('./src/scheduler');
const { getAllCategories } = require('./src/templates');
const logger = require('./src/logger');
const db = require('./src/db');

// ─── Config ────────────────────────────────────────
const CONFIG_PATH = path.join(__dirname, 'config.json');
const HISTORY_PATH = path.join(__dirname, 'post-history.json');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://yaranvaernta_db_user:yaranvaernta_db_user@cluster0.b0sdbky.mongodb.net/?appName=Cluster0';

// Load file-based config as initial defaults
let fileConfig;
try {
  fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (err) {
  logger.warn('config.json not found, constructing from template...');
  const templatePath = path.join(__dirname, 'config.example.json');
  try { fs.copyFileSync(templatePath, CONFIG_PATH); } catch { /* Heroku might not allow writes */ }
  try { fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch {
    fileConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.example.json'), 'utf8'));
  }
}

// Backward compat: migrate channelId → channels
if (fileConfig.channelId && !fileConfig.channels) {
  fileConfig.channels = [{ id: fileConfig.channelId, name: 'Main Channel' }];
  delete fileConfig.channelId;
}
if (!fileConfig.channels) fileConfig.channels = [];

let config = fileConfig;
let postHistory = [];
try { postHistory = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')); } catch { postHistory = []; }

/**
 * Save config to MongoDB (primary) + file (fallback).
 */
function saveConfig() {
  // Always try MongoDB first
  db.saveConfig(config).catch(() => {});
  // Also try file (may fail on Heroku but works locally)
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2)); } catch { /* ignore */ }
}

/**
 * Save history to MongoDB (primary) + file (fallback).
 */
function saveHistory() {
  // File-based backup (may fail on Heroku)
  try { fs.writeFileSync(HISTORY_PATH, JSON.stringify(postHistory.slice(0, 200), null, 2)); } catch { /* ignore */ }
}

// ─── Initialize Components ─────────────────────────
const keyRotator = new KeyRotator();
config.geminiKeys.forEach(k => keyRotator.addKey(k));

const contentGenerator = new ContentGenerator(keyRotator);
const bot = new Bot(config);
const scheduler = new Scheduler(config, contentGenerator, bot);

// Wire callbacks
scheduler.onConfigUpdate = saveConfig;
scheduler.onHistoryUpdate = (entry) => {
  postHistory.unshift(entry);
  if (postHistory.length > 200) postHistory = postHistory.slice(0, 200);
  saveHistory();
  // Persist to MongoDB
  db.addHistoryEntry(entry).catch(() => {});
};
bot.onManualPost = () => scheduler.manualPost();

// ─── Express App ───────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: config.botToken + '-luxalgo-dash',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Trust proxies for VPS (nginx/cloudflare)
app.set('trust proxy', 1);

function requireAuth(req, res, next) {
  if (req.session?.authenticated) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ─── Auth Routes ───────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  if (req.body.password === config.dashboardPassword) {
    req.session.authenticated = true;
    logger.info('Dashboard login successful');
    return res.json({ success: true });
  }
  logger.warn('Dashboard login failed — wrong password');
  res.status(401).json({ error: 'Invalid password' });
});

app.get('/api/auth/check', (req, res) => {
  res.json({ authenticated: !!req.session?.authenticated });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// ─── Status & Dashboard Data ───────────────────────
app.get('/api/status', requireAuth, (req, res) => {
  const today = new Date().toDateString();
  const summary = keyRotator.getSummary();
  res.json({
    botRunning: bot.isRunning,
    schedulerRunning: scheduler.isRunning,
    botEnabled: config.botEnabled,
    totalPosts: postHistory.length,
    postsToday: postHistory.filter(p => new Date(p.postedAt).toDateString() === today).length,
    activeKeys: summary.active,
    aliveKeys: summary.alive,
    deadKeys: summary.dead,
    totalKeys: summary.total,
    rateLimitedKeys: summary.rateLimited,
    totalApiCalls: summary.totalUsage,
    totalSuccess: summary.totalSuccess,
    totalErrors: summary.totalErrors,
    avgKeyHealth: summary.avgHealth,
    channelCount: (config.channels || []).length
  });
});

app.get('/api/countdown', requireAuth, (req, res) => {
  const cd = scheduler.getNextPostCountdown();
  res.json(cd || { formatted: '--:--:--', totalMs: 0, nextTime: '--:--' });
});

app.get('/api/schedule', requireAuth, (req, res) => {
  res.json(scheduler.getScheduleTimeline());
});

// ─── API Key Management ────────────────────────────
app.get('/api/keys', requireAuth, (req, res) => {
  res.json(keyRotator.getStats());
});

app.get('/api/keys/summary', requireAuth, (req, res) => {
  res.json(keyRotator.getSummary());
});

app.post('/api/keys/add', requireAuth, async (req, res) => {
  const { key } = req.body;
  if (!key?.trim()) return res.status(400).json({ error: 'Key is required' });

  const trimmed = key.trim();
  if (keyRotator.keys.includes(trimmed)) {
    return res.status(400).json({ error: 'Key already exists' });
  }

  logger.info(`Validating new API key ...${trimmed.slice(-4)}...`);
  const validation = await ContentGenerator.validateKey(trimmed);

  if (!validation.valid) {
    logger.error(`Key ...${trimmed.slice(-4)} is INVALID: ${validation.error}`);
    return res.status(400).json({ error: `Invalid key: ${validation.error}` });
  }

  keyRotator.addKey(trimmed);
  config.geminiKeys = [...keyRotator.keys];
  saveConfig();

  if (keyRotator.getKeyCount() === 1 && config.botEnabled && !scheduler.isRunning) {
    scheduler.start();
  }

  logger.success(`API key added & validated ✓: ...${trimmed.slice(-4)}`);
  res.json({ success: true, stats: keyRotator.getStats() });
});

/**
 * Bulk import: paste multiple keys at once (comma, newline, or JSON array)
 */
app.post('/api/keys/bulk-add', requireAuth, async (req, res) => {
  const { keys, validate } = req.body;
  if (!keys?.trim()) return res.status(400).json({ error: 'Keys input is required' });

  logger.info('🔑 Bulk key import started...');
  const result = keyRotator.addBulkKeys(keys);

  // Optionally validate each new key
  if (validate && result.added > 0) {
    const newKeys = keyRotator.keys.slice(-result.added);
    let validCount = 0;
    let invalidCount = 0;

    for (const key of newKeys) {
      logger.info(`Validating ...${key.slice(-4)}...`);
      const validation = await ContentGenerator.validateKey(key);
      if (!validation.valid) {
        logger.error(`Key ...${key.slice(-4)} INVALID: ${validation.error}`);
        keyRotator.markDead(key);
        invalidCount++;
      } else {
        logger.success(`Key ...${key.slice(-4)} VALID ✓`);
        validCount++;
      }
    }

    result.validated = { valid: validCount, invalid: invalidCount };
  }

  config.geminiKeys = [...keyRotator.keys];
  saveConfig();

  if (keyRotator.getAliveKeyCount() > 0 && config.botEnabled && !scheduler.isRunning) {
    scheduler.start();
  }

  logger.success(`Bulk import: ${result.added} added, ${result.duplicates} duplicates, ${result.invalid} invalid`);
  res.json({ success: true, result, stats: keyRotator.getStats(), summary: keyRotator.getSummary() });
});

app.post('/api/keys/remove', requireAuth, (req, res) => {
  const { key } = req.body;
  keyRotator.removeKey(key);
  contentGenerator.invalidKeys.delete(key);
  config.geminiKeys = [...keyRotator.keys];
  saveConfig();
  logger.info(`API key removed: ...${key.slice(-4)}`);
  res.json({ success: true, stats: keyRotator.getStats() });
});

/**
 * Revive a dead key (e.g., user refreshed quota on Google Cloud)
 */
app.post('/api/keys/revive', requireAuth, (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ error: 'Key is required' });
  keyRotator.reviveKey(key);
  contentGenerator.invalidKeys.delete(key);
  logger.info(`🔄 Key ...${key.slice(-4)} revived — back in rotation`);
  res.json({ success: true, stats: keyRotator.getStats() });
});

/**
 * Remove all dead/exhausted keys at once
 */
app.post('/api/keys/clean-dead', requireAuth, (req, res) => {
  const removed = keyRotator.removeDeadKeys();
  for (const key of removed) {
    contentGenerator.invalidKeys.delete(key);
  }
  config.geminiKeys = [...keyRotator.keys];
  saveConfig();
  logger.info(`🧹 Cleaned ${removed.length} dead key(s)`);
  res.json({ success: true, removedCount: removed.length, stats: keyRotator.getStats() });
});

app.post('/api/keys/validate', requireAuth, async (req, res) => {
  if (keyRotator.getKeyCount() === 0) {
    return res.json({ message: 'No keys to validate', results: [] });
  }

  logger.info('Validating all API keys...');
  const results = [];
  const deadKeys = [];

  for (const key of [...keyRotator.keys]) {
    logger.info(`Testing key ...${key.slice(-4)}...`);
    const result = await ContentGenerator.validateKey(key);
    results.push({
      key: key.substring(0, 8) + '···' + key.slice(-4),
      fullKey: key, valid: result.valid, error: result.error || null
    });
    if (!result.valid) {
      deadKeys.push(key);
      keyRotator.markDead(key);
      logger.error(`Key ...${key.slice(-4)} — DEAD: ${result.error}`);
    } else {
      // If a previously dead key is now valid, revive it
      keyRotator.reviveKey(key);
      logger.success(`Key ...${key.slice(-4)} — VALID ✓`);
    }
  }

  config.geminiKeys = [...keyRotator.keys];
  saveConfig();

  const validCount = results.filter(r => r.valid).length;
  logger.info(`Validation complete: ${validCount}/${results.length} keys valid, ${deadKeys.length} dead`);
  res.json({
    message: `${validCount} of ${results.length} keys are valid. ${deadKeys.length} key(s) marked dead.`,
    results, stats: keyRotator.getStats(), summary: keyRotator.getSummary()
  });
});

// ─── Channel Management ────────────────────────────
app.get('/api/channels', requireAuth, (req, res) => {
  res.json(config.channels || []);
});

app.post('/api/channels/add', requireAuth, (req, res) => {
  const { id, name } = req.body;
  if (!id?.trim()) return res.status(400).json({ error: 'Channel ID is required' });

  const channelId = id.trim();
  const channelName = (name || '').trim() || `Channel ${channelId}`;

  if (!config.channels) config.channels = [];
  if (config.channels.some(c => c.id === channelId)) {
    return res.status(400).json({ error: 'Channel already exists' });
  }

  config.channels.push({ id: channelId, name: channelName });
  saveConfig();
  logger.success(`Channel added: ${channelName} (${channelId})`);
  res.json({ success: true, channels: config.channels });
});

app.post('/api/channels/remove', requireAuth, (req, res) => {
  const { id } = req.body;
  config.channels = (config.channels || []).filter(c => String(c.id) !== String(id));
  saveConfig();
  logger.info(`Channel removed: ${id}`);
  res.json({ success: true, channels: config.channels });
});

// ─── Live Logs ─────────────────────────────────────
app.get('/api/logs', requireAuth, (req, res) => {
  res.json(logger.getLogs(150));
});

app.get('/api/logs/stream', requireAuth, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.write('data: {"type":"connected"}\n\n');
  const unsub = logger.onLog(entry => {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  });
  req.on('close', unsub);
});

// ─── Post Actions ──────────────────────────────────
app.get('/api/history', requireAuth, (req, res) => {
  res.json(postHistory.slice(0, 50));
});

app.post('/api/post-now', requireAuth, async (req, res) => {
  try {
    const post = await scheduler.manualPost(req.body.templateId || null);
    res.json({ success: true, post });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/categories', requireAuth, (req, res) => {
  res.json(getAllCategories());
});

// ─── Bot Toggle ────────────────────────────────────
app.post('/api/toggle-bot', requireAuth, (req, res) => {
  config.botEnabled = !config.botEnabled;
  saveConfig();
  if (config.botEnabled && keyRotator.getKeyCount() > 0) {
    scheduler.start();
    logger.success('Bot ENABLED — scheduler started');
  } else {
    scheduler.stop();
    logger.info('Bot PAUSED — scheduler stopped');
  }
  res.json({ botEnabled: config.botEnabled });
});

// ─── Settings ──────────────────────────────────────
app.get('/api/settings', requireAuth, (req, res) => {
  res.json({
    channels: config.channels || [],
    postsPerDay: config.postsPerDay,
    timezone: config.timezone,
    postStartHour: config.postStartHour,
    postEndHour: config.postEndHour,
    affiliateLink: config.affiliateLink,
    affiliateEnabled: config.affiliateEnabled,
    imageEnabled: config.imageEnabled,
    botEnabled: config.botEnabled,
    approvedUsers: config.approvedUsers,
    ownerId: config.ownerId,
    dashboardPassword: config.dashboardPassword,
    botToken: config.botToken
  });
});

app.post('/api/settings', requireAuth, (req, res) => {
  const allowed = [
    'postsPerDay', 'timezone', 'postStartHour', 'postEndHour',
    'affiliateLink', 'affiliateEnabled', 'imageEnabled', 'dashboardPassword', 'botToken'
  ];

  let scheduleChanged = false;
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      config[key] = req.body[key];
      if (['postsPerDay', 'timezone', 'postStartHour', 'postEndHour'].includes(key)) {
        scheduleChanged = true;
      }
    }
  }
  saveConfig();
  if (scheduleChanged && scheduler.isRunning) {
    scheduler.restart();
  }
  logger.info('Settings updated');
  res.json({ success: true });
});

// ─── User Access Control ───────────────────────────
app.post('/api/users/add', requireAuth, (req, res) => {
  const id = parseInt(req.body.userId);
  if (!id || isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });
  if (!config.approvedUsers.includes(id)) {
    config.approvedUsers.push(id);
    saveConfig();
    logger.info(`Approved user added: ${id}`);
  }
  res.json({ success: true, approvedUsers: config.approvedUsers });
});

app.post('/api/users/remove', requireAuth, (req, res) => {
  const id = parseInt(req.body.userId);
  if (id === config.ownerId) {
    return res.status(400).json({ error: 'Cannot remove the owner' });
  }
  config.approvedUsers = config.approvedUsers.filter(u => u !== id);
  saveConfig();
  logger.info(`Approved user removed: ${id}`);
  res.json({ success: true, approvedUsers: config.approvedUsers });
});

// ─── SPA Fallback ──────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start Everything (Async — MongoDB first) ─────
async function startApp() {
  // 1. Connect to MongoDB
  const dbConnected = await db.connectDB(MONGODB_URI);

  if (dbConnected) {
    // 2. Load config from MongoDB (overrides file-based)
    const dbConfig = await db.loadConfig(config);
    if (dbConfig) {
      // Merge MongoDB config into our active config object
      Object.assign(config, dbConfig);
      logger.info('📦 Config loaded from MongoDB');

      // Re-sync keys from MongoDB config
      const currentKeys = [...keyRotator.keys];
      for (const k of currentKeys) keyRotator.removeKey(k);
      config.geminiKeys.forEach(k => keyRotator.addKey(k));
      logger.info(`🔑 ${keyRotator.getKeyCount()} API keys loaded from MongoDB`);
    }

    // 3. Load history from MongoDB
    const dbHistory = await db.loadHistory(200);
    if (dbHistory && dbHistory.length > 0) {
      postHistory = dbHistory;
      logger.info(`📜 ${postHistory.length} history entries loaded from MongoDB`);
    } else if (postHistory.length > 0) {
      // Seed MongoDB with file-based history (first-time migration)
      await db.seedHistory(postHistory);
    }
  }

  // 4. Start Express server
  app.listen(PORT, HOST, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════╗');
    console.log('  ║   🚀  LuxAlgo Telegram Bot Dashboard     ║');
    console.log(`  ║   🌐  http://${HOST}:${PORT}               ║`);
    console.log('  ║   🔑  Password: ' + config.dashboardPassword.padEnd(23) + '  ║');
    console.log(`  ║   💾  Storage: ${dbConnected ? 'MongoDB ✓' : 'File-based ⚠'}         ║`);
    console.log('  ╚══════════════════════════════════════════╝');
    console.log('');

    logger.success(`Dashboard live at http://${HOST}:${PORT}`);
    logger.info(`Storage: ${dbConnected ? 'MongoDB Atlas (persistent)' : 'File-based (ephemeral!)'}`);
    logger.info(`Timezone: ${config.timezone}`);
    logger.info(`Posts/day: ${config.postsPerDay}`);
    logger.info(`Gemini keys: ${keyRotator.getKeyCount()}`);
    logger.info(`Channels: ${(config.channels || []).length}`);
    logger.info(`Approved users: ${config.approvedUsers.join(', ')}`);
  });

  // 5. Start Telegram bot
  try {
    bot.init();
  } catch (e) {
    logger.error('Telegram bot failed to start — check the bot token');
  }

  // 6. Start scheduler if keys available
  if (config.botEnabled && keyRotator.getKeyCount() > 0) {
    scheduler.start();
  } else if (keyRotator.getKeyCount() === 0) {
    logger.warn('No Gemini API keys — add keys in dashboard to start auto-posting');
  }
}

// Launch!
startApp().catch(err => {
  logger.error(`Fatal startup error: ${err.message}`);
  process.exit(1);
});
