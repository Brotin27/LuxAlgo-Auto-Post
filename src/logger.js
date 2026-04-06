class Logger {
  constructor(maxLogs = 300) {
    this.logs = [];
    this.maxLogs = maxLogs;
    this.listeners = new Set();
  }

  _addLog(level, message) {
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      timestamp: new Date().toISOString(),
      level,
      message
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Notify all SSE listeners
    this.listeners.forEach(cb => {
      try { cb(entry); } catch (e) { /* ignore */ }
    });

    // Console output
    const icons = { SUCCESS: '\x1b[32m✅', WARN: '\x1b[33m⚠️', ERROR: '\x1b[31m❌', INFO: '\x1b[36mℹ️' };
    const icon = icons[level] || '';
    console.log(`${icon} [${level}]\x1b[0m ${message}`);

    return entry;
  }

  success(msg) { return this._addLog('SUCCESS', msg); }
  warn(msg) { return this._addLog('WARN', msg); }
  error(msg) { return this._addLog('ERROR', msg); }
  info(msg) { return this._addLog('INFO', msg); }

  getLogs(count = 100) {
    return this.logs.slice(-count);
  }

  onLog(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  clear() {
    this.logs = [];
  }
}

module.exports = new Logger();
