class KeyRotator {
  constructor() {
    this.keys = [];
    this.currentIndex = 0;
    this.usage = {};           // key -> total call count
    this.errors = {};          // key -> error count
    this.rateLimited = {};     // key -> cooldown expiry timestamp
    this.cooldownCount = {};   // key -> consecutive rate-limit hits (for exponential backoff)
    this.deadKeys = new Set(); // permanently dead keys (invalid/zero quota)
    this.lastUsed = {};        // key -> last used timestamp
    this.successCount = {};    // key -> successful calls count
    this.addedAt = {};         // key -> when key was added
  }

  addKey(key) {
    const trimmed = key.trim();
    if (!trimmed || this.keys.includes(trimmed)) return false;
    this.keys.push(trimmed);
    this.usage[trimmed] = 0;
    this.errors[trimmed] = 0;
    this.successCount[trimmed] = 0;
    this.cooldownCount[trimmed] = 0;
    this.addedAt[trimmed] = Date.now();
    return true;
  }

  /**
   * Add multiple keys at once (bulk import).
   * Accepts comma-separated, newline-separated, or JSON array.
   * Returns { added: number, duplicates: number, invalid: number }
   */
  addBulkKeys(input) {
    let keys = [];
    const result = { added: 0, duplicates: 0, invalid: 0 };

    // Try JSON array first
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) keys = parsed;
    } catch {
      // Split by newline, comma, or semicolon
      keys = input.split(/[\n,;]+/).map(k => k.trim()).filter(Boolean);
    }

    for (const key of keys) {
      const trimmed = key.trim().replace(/^["']|["']$/g, ''); // strip quotes
      if (!trimmed || trimmed.length < 10) {
        result.invalid++;
        continue;
      }
      if (this.keys.includes(trimmed)) {
        result.duplicates++;
        continue;
      }
      if (this.addKey(trimmed)) {
        result.added++;
      } else {
        result.invalid++;
      }
    }
    return result;
  }

  removeKey(key) {
    this.keys = this.keys.filter(k => k !== key);
    delete this.usage[key];
    delete this.errors[key];
    delete this.rateLimited[key];
    delete this.cooldownCount[key];
    delete this.lastUsed[key];
    delete this.successCount[key];
    delete this.addedAt[key];
    this.deadKeys.delete(key);
    if (this.currentIndex >= this.keys.length) {
      this.currentIndex = 0;
    }
  }

  /**
   * Smart key selection: picks the best available key based on:
   * 1. Skip dead keys
   * 2. Skip rate-limited keys (unless all are limited)
   * 3. Prefer least-recently-used key
   * 4. Prefer key with lowest usage count
   */
  getNextKey() {
    if (this.keys.length === 0) return null;

    const now = Date.now();
    const aliveKeys = this.keys.filter(k => !this.deadKeys.has(k));

    if (aliveKeys.length === 0) return null; // all keys dead

    // Get available (non-rate-limited) keys
    const availableKeys = aliveKeys.filter(k =>
      !this.rateLimited[k] || this.rateLimited[k] <= now
    );

    // Clear expired cooldowns and reset backoff
    for (const key of availableKeys) {
      if (this.rateLimited[key]) {
        delete this.rateLimited[key];
        this.cooldownCount[key] = 0; // reset backoff on recovery
      }
    }

    let chosen;

    if (availableKeys.length > 0) {
      // Pick the key with lowest usage, tie-break by least-recently-used
      chosen = availableKeys.sort((a, b) => {
        const usageDiff = (this.usage[a] || 0) - (this.usage[b] || 0);
        if (usageDiff !== 0) return usageDiff;
        return (this.lastUsed[a] || 0) - (this.lastUsed[b] || 0);
      })[0];
    } else {
      // All alive keys are rate-limited — pick the one expiring soonest
      chosen = aliveKeys.sort((a, b) => {
        return (this.rateLimited[a] || 0) - (this.rateLimited[b] || 0);
      })[0];
    }

    this.usage[chosen] = (this.usage[chosen] || 0) + 1;
    this.lastUsed[chosen] = now;
    return chosen;
  }

  /**
   * Mark a key as temporarily rate-limited with exponential backoff.
   * Each consecutive rate-limit doubles the cooldown (cap at 5 min).
   */
  markRateLimited(key, baseCooldownMs = 65000) {
    this.cooldownCount[key] = (this.cooldownCount[key] || 0) + 1;
    this.errors[key] = (this.errors[key] || 0) + 1;

    // Exponential backoff: 65s, 130s, 260s, max 300s (5 min)
    const multiplier = Math.min(Math.pow(2, this.cooldownCount[key] - 1), 5);
    const cooldown = Math.min(baseCooldownMs * multiplier, 300000);

    this.rateLimited[key] = Date.now() + cooldown;
    return cooldown;
  }

  /**
   * Mark a key as permanently dead (invalid/zero quota).
   */
  markDead(key) {
    this.deadKeys.add(key);
    this.errors[key] = (this.errors[key] || 0) + 1;
    // Also set a very long rate limit so old code still respects it
    this.rateLimited[key] = Date.now() + 999999999;
  }

  /**
   * Revive a dead key (e.g., user got new quota).
   */
  reviveKey(key) {
    this.deadKeys.delete(key);
    delete this.rateLimited[key];
    this.cooldownCount[key] = 0;
    this.errors[key] = 0;
  }

  /**
   * Mark a successful API call for a key.
   */
  markSuccess(key) {
    this.successCount[key] = (this.successCount[key] || 0) + 1;
    this.cooldownCount[key] = 0; // reset backoff on success
  }

  /**
   * Remove all dead keys from the pool.
   * Returns array of removed keys.
   */
  removeDeadKeys() {
    const dead = [...this.deadKeys];
    for (const key of dead) {
      this.removeKey(key);
    }
    return dead;
  }

  /**
   * Get health score for a key (0-100).
   */
  _getHealthScore(key) {
    if (this.deadKeys.has(key)) return 0;
    const total = (this.usage[key] || 0);
    const success = (this.successCount[key] || 0);
    const errors = (this.errors[key] || 0);
    if (total === 0) return 100; // brand new key
    const successRate = total > 0 ? (success / total) * 100 : 100;
    const errorPenalty = Math.min(errors * 10, 50);
    return Math.max(0, Math.round(successRate - errorPenalty));
  }

  getStats() {
    const now = Date.now();
    return this.keys.map(key => {
      const isDead = this.deadKeys.has(key);
      const isRateLimited = !!(this.rateLimited[key] && this.rateLimited[key] > now);
      let status = 'active';
      if (isDead) status = 'dead';
      else if (isRateLimited) status = 'rate_limited';

      return {
        key: key.length > 12 ? key.substring(0, 8) + '···' + key.slice(-4) : key,
        fullKey: key,
        usage: this.usage[key] || 0,
        successCount: this.successCount[key] || 0,
        errors: this.errors[key] || 0,
        rateLimited: isRateLimited,
        cooldownRemaining: this.rateLimited[key] ? Math.max(0, this.rateLimited[key] - now) : 0,
        cooldownHits: this.cooldownCount[key] || 0,
        status,
        health: this._getHealthScore(key),
        lastUsed: this.lastUsed[key] || null,
        addedAt: this.addedAt[key] || null,
        isDead
      };
    });
  }

  /**
   * Summary stats for dashboard overview
   */
  getSummary() {
    const now = Date.now();
    const alive = this.keys.filter(k => !this.deadKeys.has(k));
    const active = alive.filter(k => !this.rateLimited[k] || this.rateLimited[k] <= now);
    const limited = alive.filter(k => this.rateLimited[k] && this.rateLimited[k] > now);
    const dead = [...this.deadKeys];

    return {
      total: this.keys.length,
      alive: alive.length,
      active: active.length,
      rateLimited: limited.length,
      dead: dead.length,
      totalUsage: this.getTotalUsage(),
      totalSuccess: Object.values(this.successCount).reduce((a, b) => a + b, 0),
      totalErrors: Object.values(this.errors).reduce((a, b) => a + b, 0),
      avgHealth: this.keys.length > 0
        ? Math.round(this.keys.reduce((sum, k) => sum + this._getHealthScore(k), 0) / this.keys.length)
        : 0
    };
  }

  getKeyCount() { return this.keys.length; }

  getAliveKeyCount() {
    return this.keys.filter(k => !this.deadKeys.has(k)).length;
  }

  getActiveKeyCount() {
    const now = Date.now();
    return this.keys.filter(k =>
      !this.deadKeys.has(k) &&
      (!this.rateLimited[k] || this.rateLimited[k] <= now)
    ).length;
  }

  getDeadKeyCount() {
    return this.deadKeys.size;
  }

  getTotalUsage() {
    return Object.values(this.usage).reduce((a, b) => a + b, 0);
  }
}

module.exports = KeyRotator;
