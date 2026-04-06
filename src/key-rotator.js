class KeyRotator {
  constructor() {
    this.keys = [];
    this.currentIndex = 0;
    this.usage = {};       // key -> call count
    this.errors = {};      // key -> error count
    this.rateLimited = {}; // key -> cooldown expiry timestamp
  }

  addKey(key) {
    const trimmed = key.trim();
    if (!trimmed || this.keys.includes(trimmed)) return false;
    this.keys.push(trimmed);
    this.usage[trimmed] = 0;
    this.errors[trimmed] = 0;
    return true;
  }

  removeKey(key) {
    this.keys = this.keys.filter(k => k !== key);
    delete this.usage[key];
    delete this.errors[key];
    delete this.rateLimited[key];
    if (this.currentIndex >= this.keys.length) {
      this.currentIndex = 0;
    }
  }

  getNextKey() {
    if (this.keys.length === 0) return null;

    const now = Date.now();
    let attempts = 0;

    while (attempts < this.keys.length) {
      const key = this.keys[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.keys.length;

      // Skip rate-limited keys
      if (this.rateLimited[key] && this.rateLimited[key] > now) {
        attempts++;
        continue;
      }

      // Clear expired cooldown
      if (this.rateLimited[key]) {
        delete this.rateLimited[key];
      }

      this.usage[key] = (this.usage[key] || 0) + 1;
      return key;
    }

    // All keys rate-limited — return the one whose cooldown expires soonest
    let best = this.keys[0];
    let bestTime = Infinity;
    for (const key of this.keys) {
      const t = this.rateLimited[key] || 0;
      if (t < bestTime) { bestTime = t; best = key; }
    }
    this.usage[best] = (this.usage[best] || 0) + 1;
    return best;
  }

  markRateLimited(key, cooldownMs = 65000) {
    this.rateLimited[key] = Date.now() + cooldownMs;
    this.errors[key] = (this.errors[key] || 0) + 1;
  }

  getStats() {
    const now = Date.now();
    return this.keys.map(key => ({
      key: key.length > 12 ? key.substring(0, 8) + '···' + key.slice(-4) : key,
      fullKey: key,
      usage: this.usage[key] || 0,
      errors: this.errors[key] || 0,
      rateLimited: !!(this.rateLimited[key] && this.rateLimited[key] > now),
      cooldownRemaining: this.rateLimited[key] ? Math.max(0, this.rateLimited[key] - now) : 0,
      status: (this.rateLimited[key] && this.rateLimited[key] > now) ? 'rate_limited' : 'active'
    }));
  }

  getKeyCount() { return this.keys.length; }

  getActiveKeyCount() {
    const now = Date.now();
    return this.keys.filter(k => !this.rateLimited[k] || this.rateLimited[k] <= now).length;
  }

  getTotalUsage() {
    return Object.values(this.usage).reduce((a, b) => a + b, 0);
  }
}

module.exports = KeyRotator;
