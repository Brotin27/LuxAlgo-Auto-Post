/* ═══════════════════════════════════════════════════
   LuxAlgo Bot Dashboard — Frontend Logic
   ═══════════════════════════════════════════════════ */

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ─── API Helper ────────────────────────────────────
async function api(endpoint, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`/api${endpoint}`, opts);

  if (res.status === 401) {
    showLogin();
    throw new Error('Unauthorized');
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ─── Toast Notifications ───────────────────────────
function toast(message, type = 'info') {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
  $('#toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ─── Auth ──────────────────────────────────────────
function showLogin() {
  $('#login-screen').style.display = 'flex';
  $('#dashboard').style.display = 'none';

  // Stop all polling to prevent 401 spam after session loss
  if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  if (eventSource) { eventSource.close(); eventSource = null; }
}

function showDashboard() {
  $('#login-screen').style.display = 'none';
  $('#dashboard').style.display = 'block';
  initDashboard();
}

async function checkAuth() {
  try {
    const data = await api('/auth/check');
    if (data.authenticated) {
      showDashboard();
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

$('#loginBtn').addEventListener('click', async () => {
  const pw = $('#loginPassword').value;
  if (!pw) {
    $('#loginError').textContent = 'Please enter a password';
    return;
  }
  try {
    await api('/auth/login', 'POST', { password: pw });
    showDashboard();
  } catch (err) {
    $('#loginError').textContent = err.message === 'Unauthorized' ? 'Wrong password' : (err.message || 'Wrong password');
    $('#loginPassword').value = '';
    $('#loginPassword').focus();
  }
});

$('#loginPassword').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#loginBtn').click();
});

$('#logoutBtn').addEventListener('click', async () => {
  await api('/auth/logout', 'POST');
  showLogin();
  $('#loginPassword').value = '';
});

// ─── Dashboard Init ────────────────────────────────
let refreshInterval = null;
let countdownInterval = null;
let eventSource = null;

function initDashboard() {
  // Clear previous intervals to prevent duplicates
  if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }

  fetchStatus();
  fetchSchedule();
  fetchHistory();
  fetchKeys();
  fetchLogs();
  loadCategories();
  loadSettings();
  startLiveLogStream();

  // Refresh loops
  refreshInterval = setInterval(() => {
    fetchStatus();
    fetchSchedule();
    fetchCountdown();
  }, 5000);

  countdownInterval = setInterval(fetchCountdown, 1000);
}

// ─── Status ────────────────────────────────────────
async function fetchStatus() {
  try {
    const d = await api('/status');
    $('#statTotal').textContent = d.totalPosts;
    $('#statToday').textContent = d.postsToday;
    $('#statApiCalls').textContent = d.totalApiCalls;

    // Enhanced key stats
    const keyText = `${d.activeKeys}/${d.aliveKeys || d.totalKeys}`;
    $('#statKeys').textContent = keyText;

    // Show dead key warning
    const deadBadge = $('#deadKeyWarning');
    if (deadBadge) {
      if (d.deadKeys > 0) {
        deadBadge.textContent = `💀 ${d.deadKeys} dead`;
        deadBadge.style.display = 'inline-block';
      } else {
        deadBadge.style.display = 'none';
      }
    }

    const dot = $('#statusDot');
    const label = $('#statusLabel');
    dot.classList.remove('paused', 'offline');

    if (d.botEnabled && d.botRunning) {
      label.textContent = 'Bot Active';
      $('#toggleBotIcon').textContent = '⏸';
      $('#toggleBotText').textContent = 'Pause';
    } else if (!d.botEnabled) {
      dot.classList.add('paused');
      label.textContent = 'Bot Paused';
      $('#toggleBotIcon').textContent = '▶️';
      $('#toggleBotText').textContent = 'Resume';
    } else {
      dot.classList.add('offline');
      label.textContent = 'Bot Offline';
    }
  } catch { /* silent */ }
}

// ─── Countdown ─────────────────────────────────────
async function fetchCountdown() {
  try {
    const d = await api('/countdown');
    $('#countdownValue').textContent = d.formatted;
    const nextTime = d.nextTime || '--:--';
    $('#countdownNext').textContent = nextTime;
  } catch { /* silent */ }
}

// ─── Schedule Timeline ─────────────────────────────
async function fetchSchedule() {
  try {
    const schedule = await api('/schedule');
    const container = $('#scheduleTimeline');

    if (!schedule || schedule.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">No schedule yet — add API keys to start</div></div>`;
      return;
    }

    container.innerHTML = schedule.map(item => `
      <div class="timeline-item">
        <div class="timeline-dot ${item.status}"></div>
        <div class="timeline-time">${item.time}</div>
        <div style="flex:1;font-size:0.82rem;color:var(--text-secondary)">Post #${item.id}</div>
        <div class="timeline-status ${item.status}">
          ${item.status === 'done' ? '✅ Done' : item.status === 'next' ? '⏳ Next' : '🕐 Pending'}
        </div>
      </div>
    `).join('');
  } catch { /* silent */ }
}

// ─── Quick Fire Buttons ────────────────────────────
async function loadCategories() {
  try {
    const cats = await api('/categories');
    const grid = $('#quickfireGrid');

    grid.innerHTML = cats.map(c => `
      <button class="quickfire-btn" data-id="${c.id}" title="Post a ${c.name}">
        <span class="quickfire-emoji">${c.emoji}</span>
        <span>${c.name}</span>
      </button>
    `).join('');

    grid.querySelectorAll('.quickfire-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        btn.classList.add('posting');
        btn.innerHTML = `<span class="quickfire-emoji">⏳</span><span>Generating...</span>`;
        try {
          await api('/post-now', 'POST', { templateId: id });
          toast('Post sent to channel!', 'success');
          fetchHistory();
          fetchStatus();
        } catch (e) {
          toast(e.message, 'error');
        } finally {
          const cat = cats.find(c => c.id === id);
          btn.classList.remove('posting');
          btn.innerHTML = `<span class="quickfire-emoji">${cat.emoji}</span><span>${cat.name}</span>`;
        }
      });
    });
  } catch { /* silent */ }
}

// ─── Post History ──────────────────────────────────
async function fetchHistory() {
  try {
    const history = await api('/history');
    const container = $('#historyList');

    if (!history || history.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-text">No posts yet. Fire one above!</div></div>`;
      return;
    }

    container.innerHTML = history.slice(0, 20).map(item => {
      const time = new Date(item.postedAt).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      const preview = item.content?.substring(0, 140) || '';

      return `
        <div class="history-item" onclick="showPostPreview(\`${escapeForAttr(item.content)}\`, '${item.template || ''}')">
          <div class="history-meta">
            <span class="history-template">${item.template || 'Post'}${item.manual ? '<span class="history-badge">Manual</span>' : ''}</span>
            <span class="history-time">${time}</span>
          </div>
          <div class="history-preview">${escapeHtml(preview)}...</div>
        </div>
      `;
    }).join('');
  } catch { /* silent */ }
}

function escapeHtml(str) {
  return str?.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') || '';
}

function escapeForAttr(str) {
  return str?.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$') || '';
}

// Post Preview Modal
window.showPostPreview = function(content, template) {
  $('#modalTitle').textContent = template || 'Post Preview';
  $('#modalBody').textContent = content;
  $('#postModal').classList.add('open');
};

$('#modalClose').addEventListener('click', () => {
  $('#postModal').classList.remove('open');
});

$('#postModal').addEventListener('click', (e) => {
  if (e.target === $('#postModal')) $('#postModal').classList.remove('open');
});

// ─── API Keys (Enhanced) ───────────────────────────
function getHealthColor(health) {
  if (health >= 80) return '#22c55e';
  if (health >= 50) return '#f59e0b';
  if (health >= 20) return '#f97316';
  return '#ef4444';
}

function getStatusIcon(status) {
  if (status === 'active') return '🟢';
  if (status === 'rate_limited') return '🟡';
  if (status === 'dead') return '💀';
  return '⚪';
}

function formatCooldown(ms) {
  if (ms <= 0) return '';
  const secs = Math.ceil(ms / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

async function fetchKeys() {
  try {
    const keys = await api('/keys');
    const container = $('#keyList');
    const badge = $('#keyCountBadge');

    const alive = keys.filter(k => !k.isDead).length;
    const dead = keys.filter(k => k.isDead).length;
    badge.textContent = dead > 0
      ? `${alive} alive / ${dead} dead`
      : `${keys.length} key${keys.length !== 1 ? 's' : ''}`;

    if (keys.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">🔐</div><div class="empty-text">Add your first Gemini API key<br><small style="color:var(--text-muted)">Use bulk import to add many at once!</small></div></div>`;
      return;
    }

    const maxUsage = Math.max(...keys.map(k => k.usage), 1);

    container.innerHTML = keys.map(k => {
      const healthColor = getHealthColor(k.health);
      const statusIcon = getStatusIcon(k.status);
      const cooldownText = k.status === 'rate_limited' ? formatCooldown(k.cooldownRemaining) : '';

      return `
      <div class="key-item ${k.isDead ? 'key-dead' : ''}" style="${k.isDead ? 'opacity:0.6;' : ''}">
        <div class="key-row-top">
          <span class="key-status-icon">${statusIcon}</span>
          <div class="key-name">${k.key}</div>
          <div class="key-health-badge" style="background:${healthColor}20;color:${healthColor};border:1px solid ${healthColor}40" title="Health Score">
            ${k.health}%
          </div>
          ${cooldownText ? `<div class="key-cooldown-badge" title="Rate limit cooldown">⏳ ${cooldownText}</div>` : ''}
          ${k.isDead
            ? `<button class="key-revive-btn" onclick="reviveKey('${k.fullKey}')" title="Revive this key">🔄</button>`
            : ''
          }
          <button class="key-remove" onclick="removeKey('${k.fullKey}')" title="Remove key">×</button>
        </div>
        <div class="key-row-bottom">
          <div class="key-usage-bar" title="Usage: ${k.usage} calls">
            <div class="key-usage-fill" style="width:${(k.usage / maxUsage) * 100}%;background:${healthColor}"></div>
          </div>
          <div class="key-stats-mini">
            <span title="Total calls">📊 ${k.usage}</span>
            <span title="Successful" style="color:#22c55e">✓ ${k.successCount || 0}</span>
            <span title="Errors" style="color:#ef4444">✗ ${k.errors}</span>
          </div>
        </div>
      </div>`;
    }).join('');

    // Show/hide clean dead button
    const cleanBtn = $('#cleanDeadBtn');
    if (cleanBtn) {
      cleanBtn.style.display = dead > 0 ? 'inline-flex' : 'none';
    }
  } catch { /* silent */ }
}

// Single key add
$('#addKeyBtn').addEventListener('click', async () => {
  const key = $('#newKeyInput').value.trim();
  if (!key) return toast('Paste an API key first', 'warning');

  const btn = $('#addKeyBtn');
  btn.textContent = '⏳';
  btn.disabled = true;

  try {
    await api('/keys/add', 'POST', { key });
    $('#newKeyInput').value = '';
    toast('API key validated & added! ✓', 'success');
    fetchKeys();
    fetchStatus();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.textContent = 'Add';
    btn.disabled = false;
  }
});

$('#newKeyInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#addKeyBtn').click();
});

// Bulk import
$('#bulkImportBtn')?.addEventListener('click', () => {
  const area = $('#bulkImportArea');
  area.style.display = area.style.display === 'none' ? 'block' : 'none';
});

$('#bulkAddBtn')?.addEventListener('click', async () => {
  const keys = $('#bulkKeysInput')?.value?.trim();
  if (!keys) return toast('Paste your API keys first', 'warning');

  const btn = $('#bulkAddBtn');
  const validate = $('#bulkValidateCheck')?.checked ?? false;
  btn.textContent = validate ? '⏳ Adding & Validating...' : '⏳ Adding...';
  btn.disabled = true;

  try {
    const result = await api('/keys/bulk-add', 'POST', { keys, validate });
    const r = result.result;
    let msg = `Added ${r.added} key(s)`;
    if (r.duplicates > 0) msg += `, ${r.duplicates} duplicate(s) skipped`;
    if (r.invalid > 0) msg += `, ${r.invalid} invalid`;
    if (r.validated) msg += ` | Valid: ${r.validated.valid}, Invalid: ${r.validated.invalid}`;

    toast(msg, r.added > 0 ? 'success' : 'warning');
    $('#bulkKeysInput').value = '';
    $('#bulkImportArea').style.display = 'none';
    fetchKeys();
    fetchStatus();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.textContent = '📥 Import All';
    btn.disabled = false;
  }
});

window.removeKey = async function(fullKey) {
  if (!confirm('Remove this API key?')) return;
  try {
    await api('/keys/remove', 'POST', { key: fullKey });
    toast('Key removed', 'info');
    fetchKeys();
    fetchStatus();
  } catch (e) {
    toast(e.message, 'error');
  }
};

window.reviveKey = async function(fullKey) {
  try {
    await api('/keys/revive', 'POST', { key: fullKey });
    toast('Key revived! Back in rotation 🔄', 'success');
    fetchKeys();
    fetchStatus();
  } catch (e) {
    toast(e.message, 'error');
  }
};

// Clean all dead keys
$('#cleanDeadBtn')?.addEventListener('click', async () => {
  if (!confirm('Remove ALL dead/exhausted keys?')) return;
  try {
    const result = await api('/keys/clean-dead', 'POST');
    toast(`Cleaned ${result.removedCount} dead key(s) 🧹`, 'success');
    fetchKeys();
    fetchStatus();
  } catch (e) {
    toast(e.message, 'error');
  }
});

// Validate All Keys
$('#validateKeysBtn').addEventListener('click', async () => {
  const btn = $('#validateKeysBtn');
  btn.innerHTML = '⏳ Checking...';
  btn.disabled = true;

  try {
    const result = await api('/keys/validate', 'POST');
    toast(result.message, result.results.every(r => r.valid) ? 'success' : 'warning');
    fetchKeys();
    fetchStatus();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.innerHTML = '🔍 Validate';
    btn.disabled = false;
  }
});

// ─── Live Logs ─────────────────────────────────────
async function fetchLogs() {
  try {
    const logs = await api('/logs');
    renderLogs(logs);
  } catch { /* silent */ }
}

function renderLogs(logs) {
  const terminal = $('#logsTerminal');
  terminal.innerHTML = logs.map(logToHtml).join('');
  terminal.scrollTop = terminal.scrollHeight;
}

function appendLog(entry) {
  const terminal = $('#logsTerminal');
  // Remove empty state if present
  const empty = terminal.querySelector('.empty-state');
  if (empty) empty.remove();

  terminal.insertAdjacentHTML('beforeend', logToHtml(entry));
  terminal.scrollTop = terminal.scrollHeight;

  // Keep max 150 entries in DOM
  while (terminal.children.length > 150) {
    terminal.removeChild(terminal.firstChild);
  }
}

function logToHtml(entry) {
  const time = new Date(entry.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  return `<div class="log-entry">
    <span class="log-time">${time}</span>
    <span class="log-level ${entry.level}">${entry.level}</span>
    <span class="log-msg">${escapeHtml(entry.message)}</span>
  </div>`;
}

function startLiveLogStream() {
  if (eventSource) eventSource.close();

  eventSource = new EventSource('/api/logs/stream');
  eventSource.onmessage = (e) => {
    try {
      const entry = JSON.parse(e.data);
      if (entry.type === 'connected' || entry.type === 'heartbeat') return;
      appendLog(entry);
    } catch { /* silent */ }
  };
  eventSource.onerror = () => {
    // Will auto-reconnect
  };
}

$('#clearLogsBtn').addEventListener('click', () => {
  $('#logsTerminal').innerHTML = `<div class="empty-state"><div class="empty-text" style="color:var(--text-muted);font-family:var(--mono);font-size:0.8rem">Logs cleared</div></div>`;
});

// ─── Bot Toggle ────────────────────────────────────
$('#toggleBotBtn').addEventListener('click', async () => {
  try {
    const res = await api('/toggle-bot', 'POST');
    toast(res.botEnabled ? 'Bot resumed!' : 'Bot paused!', res.botEnabled ? 'success' : 'warning');
    fetchStatus();
    fetchSchedule();
  } catch (e) {
    toast(e.message, 'error');
  }
});

// ─── Settings Panel ────────────────────────────────
$('#settingsBtn').addEventListener('click', openSettings);
$('#settingsClose').addEventListener('click', closeSettings);
$('#settingsOverlay').addEventListener('click', closeSettings);

function openSettings() {
  $('#settingsPanel').classList.add('open');
  $('#settingsOverlay').classList.add('open');
  loadSettings();
}

function closeSettings() {
  $('#settingsPanel').classList.remove('open');
  $('#settingsOverlay').classList.remove('open');
}

async function loadSettings() {
  try {
    const s = await api('/settings');

    $('#settingBotToken').value = s.botToken || '';
    $('#settingGroqKey').value = s.groqKey || '';
    $('#settingPostsPerDay').value = s.postsPerDay || 4;
    $('#settingTimezone').value = s.timezone || 'America/New_York';
    $('#settingStartHour').value = s.postStartHour ?? 9;
    $('#settingEndHour').value = s.postEndHour ?? 21;
    $('#settingAffiliateLink').value = s.affiliateLink || '';
    $('#settingPassword').value = s.dashboardPassword || '';

    const affToggle = $('#settingAffiliateToggle');
    if (s.affiliateEnabled) {
      affToggle.classList.add('active');
    } else {
      affToggle.classList.remove('active');
    }

    const imgToggle = $('#settingImageToggle');
    if (s.imageEnabled) {
      imgToggle.classList.add('active');
    } else {
      imgToggle.classList.remove('active');
    }

    // Channel list
    renderChannelList(s.channels || []);

    // User list
    renderUserList(s.approvedUsers || [], s.ownerId);
  } catch { /* silent */ }
}

// ─── Channel Management ─────────────────────────────
function renderChannelList(channels) {
  const container = $('#channelList');
  if (!channels.length) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:0.82rem;padding:8px 0">No channels added yet</div>';
    return;
  }
  container.innerHTML = channels.map(ch => `
    <div class="user-item">
      <div>
        <span style="font-weight:600">${escapeHtml(ch.name)}</span>
        <span style="color:var(--text-muted);font-size:0.78rem;margin-left:6px">${ch.id}</span>
      </div>
      <button class="key-remove" onclick="removeChannel('${ch.id}')" title="Remove channel">×</button>
    </div>
  `).join('');
}

$('#addChannelBtn').addEventListener('click', async () => {
  const id = $('#newChannelId').value.trim();
  const name = $('#newChannelName').value.trim();
  if (!id) return toast('Enter a Channel ID', 'warning');
  try {
    await api('/channels/add', 'POST', { id, name });
    $('#newChannelId').value = '';
    $('#newChannelName').value = '';
    toast('Channel added!', 'success');
    loadSettings();
    fetchStatus();
  } catch (e) {
    toast(e.message, 'error');
  }
});

window.removeChannel = async function(id) {
  if (!confirm('Remove this channel?')) return;
  try {
    await api('/channels/remove', 'POST', { id });
    toast('Channel removed', 'info');
    loadSettings();
    fetchStatus();
  } catch (e) {
    toast(e.message, 'error');
  }
};

// Affiliate Toggle
$('#settingAffiliateToggle').addEventListener('click', () => {
  $('#settingAffiliateToggle').classList.toggle('active');
});

// Image Toggle
$('#settingImageToggle').addEventListener('click', () => {
  $('#settingImageToggle').classList.toggle('active');
});

// Render approved users
function renderUserList(users, ownerId) {
  const container = $('#userList');
  container.innerHTML = users.map(uid => `
    <div class="user-item">
      <span>${uid}</span>
      <div>
        ${uid === ownerId ? '<span class="user-owner-badge">OWNER</span>' : `<button class="key-remove" onclick="removeUser(${uid})" title="Remove">×</button>`}
      </div>
    </div>
  `).join('');
}

// Add user
$('#addUserBtn').addEventListener('click', async () => {
  const userId = $('#newUserId').value.trim();
  if (!userId) return toast('Enter a Telegram User ID', 'warning');
  try {
    const res = await api('/users/add', 'POST', { userId });
    $('#newUserId').value = '';
    toast('User added!', 'success');
    loadSettings();
  } catch (e) {
    toast(e.message, 'error');
  }
});

// Remove user
window.removeUser = async function(userId) {
  if (!confirm(`Remove user ${userId}?`)) return;
  try {
    await api('/users/remove', 'POST', { userId });
    toast('User removed', 'info');
    loadSettings();
  } catch (e) {
    toast(e.message, 'error');
  }
};

// Save settings
$('#saveSettingsBtn').addEventListener('click', async () => {
  try {
    const settings = {
      botToken: $('#settingBotToken').value.trim(),
      postsPerDay: parseInt($('#settingPostsPerDay').value) || 4,
      timezone: $('#settingTimezone').value,
      postStartHour: parseInt($('#settingStartHour').value) || 9,
      postEndHour: parseInt($('#settingEndHour').value) || 21,
      affiliateLink: $('#settingAffiliateLink').value.trim(),
      affiliateEnabled: $('#settingAffiliateToggle').classList.contains('active'),
      imageEnabled: $('#settingImageToggle').classList.contains('active'),
      dashboardPassword: $('#settingPassword').value.trim() || 'luxalgo',
      groqKey: $('#settingGroqKey').value.trim(),
    };

    await api('/settings', 'POST', settings);
    toast('Settings saved!', 'success');
    closeSettings();
    fetchStatus();
    fetchSchedule();
  } catch (e) {
    toast(e.message, 'error');
  }
});

// ─── Keyboard Shortcuts ────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeSettings();
    $('#postModal').classList.remove('open');
  }
});

// ─── Init ──────────────────────────────────────────
checkAuth();
