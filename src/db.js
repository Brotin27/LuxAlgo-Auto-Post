const mongoose = require('mongoose');
const logger = require('./logger');

// ─── MongoDB Connection ────────────────────────────
let isConnected = false;

async function connectDB(uri) {
  if (!uri) {
    logger.warn('No MongoDB URI — using file-based storage only');
    return false;
  }

  try {
    await mongoose.connect(uri, {
      dbName: 'luxalgo_bot',
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    isConnected = true;
    logger.success('✅ MongoDB connected — data will persist across restarts');
    return true;
  } catch (err) {
    logger.error(`MongoDB connection failed: ${err.message}`);
    logger.warn('Falling back to file-based storage (data may be lost on restart)');
    return false;
  }
}

// ─── Schemas ───────────────────────────────────────

const configSchema = new mongoose.Schema({
  _id: { type: String, default: 'main' },
  botToken: { type: String, default: '' },
  channels: { type: Array, default: [] },
  ownerId: { type: Number, default: 0 },
  approvedUsers: { type: [Number], default: [] },
  dashboardPassword: { type: String, default: 'changeme' },
  geminiKeys: { type: [String], default: [] },
  postsPerDay: { type: Number, default: 4 },
  timezone: { type: String, default: 'America/New_York' },
  postStartHour: { type: Number, default: 9 },
  postEndHour: { type: Number, default: 21 },
  affiliateLink: { type: String, default: '' },
  affiliateEnabled: { type: Boolean, default: false },
  imageEnabled: { type: Boolean, default: false },
  botEnabled: { type: Boolean, default: true },
}, {
  timestamps: true,
  minimize: false,
  // Don't strip unknown fields
  strict: false,
});

const postHistorySchema = new mongoose.Schema({
  content: String,
  template: String,
  templateId: String,
  postedAt: { type: Date, default: Date.now },
  channels: Array,
  manual: { type: Boolean, default: false },
  imageUrl: String,
  imagePrompt: String,
}, {
  timestamps: true,
  strict: false,
});

// Indexes for performance
postHistorySchema.index({ postedAt: -1 });
postHistorySchema.index({ createdAt: -1 });

const Config = mongoose.model('Config', configSchema);
const PostHistory = mongoose.model('PostHistory', postHistorySchema);

// ─── Config Operations ────────────────────────────

/**
 * Load config from MongoDB.
 * If not found, seeds from the provided defaults (file-based config).
 */
async function loadConfig(defaults = {}) {
  if (!isConnected) return null;

  try {
    let doc = await Config.findById('main').lean();

    if (!doc) {
      // First time — seed MongoDB from file-based config
      logger.info('Seeding MongoDB with local config...');
      doc = await Config.create({ _id: 'main', ...defaults });
      doc = doc.toObject();
      logger.success('Config seeded to MongoDB ✓');
    }

    // Remove mongoose internal fields
    const { __v, _id, createdAt, updatedAt, ...config } = doc;
    return config;
  } catch (err) {
    logger.error(`Failed to load config from MongoDB: ${err.message}`);
    return null;
  }
}

/**
 * Save config to MongoDB (full replace).
 */
async function saveConfig(config) {
  if (!isConnected) return false;

  try {
    await Config.findByIdAndUpdate('main', config, {
      upsert: true,
      runValidators: false,
      overwriteDiscriminatorKey: true,
    });
    return true;
  } catch (err) {
    logger.error(`Failed to save config to MongoDB: ${err.message}`);
    return false;
  }
}

// ─── Post History Operations ──────────────────────

/**
 * Load post history from MongoDB (last N entries).
 */
async function loadHistory(limit = 200) {
  if (!isConnected) return null;

  try {
    const docs = await PostHistory.find()
      .sort({ postedAt: -1 })
      .limit(limit)
      .lean();

    return docs.map(doc => {
      const { __v, _id, createdAt, updatedAt, ...entry } = doc;
      return { ...entry, postedAt: entry.postedAt?.toISOString?.() || entry.postedAt };
    });
  } catch (err) {
    logger.error(`Failed to load history from MongoDB: ${err.message}`);
    return null;
  }
}

/**
 * Add a new post history entry to MongoDB.
 */
async function addHistoryEntry(entry) {
  if (!isConnected) return false;

  try {
    await PostHistory.create(entry);
    return true;
  } catch (err) {
    logger.error(`Failed to save history entry to MongoDB: ${err.message}`);
    return false;
  }
}

/**
 * Bulk seed history entries (first-time migration from file).
 */
async function seedHistory(entries) {
  if (!isConnected || !entries || entries.length === 0) return false;

  try {
    const count = await PostHistory.countDocuments();
    if (count > 0) {
      logger.info(`MongoDB already has ${count} history entries — skipping seed`);
      return true;
    }

    logger.info(`Seeding ${entries.length} history entries to MongoDB...`);
    await PostHistory.insertMany(entries, { ordered: false });
    logger.success(`History seeded to MongoDB ✓ (${entries.length} entries)`);
    return true;
  } catch (err) {
    logger.error(`Failed to seed history: ${err.message}`);
    return false;
  }
}

// ─── Exports ──────────────────────────────────────

module.exports = {
  connectDB,
  isConnected: () => isConnected,
  loadConfig,
  saveConfig,
  loadHistory,
  addHistoryEntry,
  seedHistory,
};
