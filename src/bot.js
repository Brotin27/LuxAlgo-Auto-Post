const TelegramBot = require('node-telegram-bot-api');
const logger = require('./logger');

class Bot {
  constructor(config) {
    this.config = config;
    this.bot = null;
    this.isRunning = false;
    this.onManualPost = null;
    this.onLoginVerify = null;
    this.botUsername = null;
  }

  async init() {
    if (!this.config.botToken || this.config.botToken === 'YOUR_BOT_TOKEN_HERE') {
      logger.warn('Bot token not configured. Add it in the dashboard to start the Telegram bot.');
      return;
    }

    try {
      this.bot = new TelegramBot(this.config.botToken, { polling: true });

      // Suppress massive log spam on polling error (e.g. invalid token)
      this.bot.on('polling_error', (error) => {
        if (error.code === 'ETELEGRAM' && error.message.includes('404')) {
          logger.error('Invalid Bot Token! Polling stopped. Please update token in dashboard.');
          this.stop();
        } else {
          logger.warn(`Telegram polling error: ${error.message}`);
        }
      });

      try {
        const me = await this.bot.getMe();
        this.botUsername = me.username;
        logger.info(`Bot username: @${this.botUsername}`);
      } catch (e) {
        logger.warn(`Could not fetch bot username: ${e.message}`);
      }

      this.setupCommands();
      this.isRunning = true;
      logger.success('Telegram bot connected and polling');
    } catch (error) {
      logger.error(`Bot init failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all channel IDs from config (supports both legacy channelId and new channels array).
   */
  getChannelIds() {
    const channels = this.config.channels || [];
    const ids = channels.map(c => typeof c === 'string' ? c : c.id).filter(Boolean);

    // Backward compat: include legacy channelId if not already in list
    if (this.config.channelId && !ids.includes(this.config.channelId)) {
      ids.push(this.config.channelId);
    }

    return ids;
  }

  setupCommands() {
    this.bot.onText(/\/start(?:\s+(.+))?$/, (msg, match) => {
      const param = match[1]?.trim();
      const userId = msg.from.id;

      // Handle dashboard login deep link
      if (param && param.startsWith('login_')) {
        const token = param.replace('login_', '');
        if (this.isApproved(userId)) {
          if (this.onLoginVerify) {
            this.onLoginVerify(token, userId, msg.from);
          }
          this.bot.sendMessage(msg.chat.id,
            '✅ Dashboard access granted!\n\n' +
            '🔓 You are verified. Return to the dashboard — it will open automatically.'
          );
          logger.success(`Dashboard login verified — User ${userId} (@${msg.from.username || 'N/A'})`);
        } else {
          this.bot.sendMessage(msg.chat.id,
            '🚫 Access Denied!\n\nYou are not authorized to access the dashboard.\nContact the admin to get access.'
          );
          logger.warn(`Dashboard login denied — User ${userId} (@${msg.from.username || 'N/A'})`);
        }
        return;
      }

      // Regular /start flow
      if (!this.isApproved(userId)) {
        this.bot.sendMessage(msg.chat.id,
          '🚫 Access Denied!\n\nYou are not authorized to use this bot.\nContact the admin to get access.'
        );
        logger.warn(`ACCESS DENIED — User ${userId} (@${msg.from.username || 'N/A'}) tried /start`);
        return;
      }
      this.bot.sendMessage(msg.chat.id,
        '✅ Welcome! You are authorized.\n\n' +
        '🤖 LuxAlgo Auto-Poster Bot\n' +
        '━━━━━━━━━━━━━━━━━━━━━\n' +
        '📊 /status — Check bot status\n' +
        '📝 /post — Trigger manual post\n' +
        '⚙️ /help — Show commands'
      );
      logger.info(`User ${userId} (@${msg.from.username || 'N/A'}) connected`);
    });

    this.bot.onText(/\/status/, (msg) => {
      if (!this.isApproved(msg.from.id)) {
        this.bot.sendMessage(msg.chat.id, '🚫 Access Denied!');
        return;
      }
      const channelCount = this.getChannelIds().length;
      const status = this.config.botEnabled ? '🟢 Active' : '🔴 Paused';
      this.bot.sendMessage(msg.chat.id,
        `📋 Bot Status Report\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Status: ${status}\n` +
        `Auto-posting: ${this.config.botEnabled ? 'ON' : 'OFF'}\n` +
        `Channels: ${channelCount}\n` +
        `Posts/Day: ${this.config.postsPerDay}\n` +
        `Timezone: ${this.config.timezone}\n` +
        `Affiliate: ${this.config.affiliateEnabled ? 'ON' : 'OFF'}`
      );
    });

    this.bot.onText(/\/post/, async (msg) => {
      if (!this.isApproved(msg.from.id)) {
        this.bot.sendMessage(msg.chat.id, '🚫 Access Denied!');
        return;
      }
      this.bot.sendMessage(msg.chat.id, '⏳ Generating and posting content...');
      if (this.onManualPost) {
        try {
          await this.onManualPost();
          this.bot.sendMessage(msg.chat.id, '✅ Post sent to all channels!');
        } catch (err) {
          this.bot.sendMessage(msg.chat.id, `❌ Failed: ${err.message}`);
        }
      }
    });

    this.bot.onText(/\/help/, (msg) => {
      if (!this.isApproved(msg.from.id)) {
        this.bot.sendMessage(msg.chat.id, '🚫 Access Denied!');
        return;
      }
      this.bot.sendMessage(msg.chat.id,
        '🤖 LuxAlgo Bot Commands\n━━━━━━━━━━━━━━━━━━━━━\n' +
        '/start — Initialize bot\n/status — View bot status\n/post — Send a post now\n/help — Show this menu'
      );
    });

    this.bot.on('message', (msg) => {
      if (msg.chat.type === 'private' && !msg.text?.startsWith('/')) {
        if (!this.isApproved(msg.from.id)) {
          this.bot.sendMessage(msg.chat.id, '🚫 Access Denied! You are not authorized to use this bot.');
          logger.warn(`Unauthorized message from ${msg.from.id} (@${msg.from.username || 'N/A'})`);
        }
      }
    });
  }

  isApproved(userId) {
    return userId === this.config.ownerId || this.config.approvedUsers.includes(userId);
  }

  /**
   * Send content to ALL configured channels.
   */
  async sendToChannel(content, imageUrl = null) {
    const channelIds = this.getChannelIds();
    if (channelIds.length === 0) {
      throw new Error('No channels configured. Add channels in dashboard settings.');
    }

    let successCount = 0;
    let lastError = null;

    for (const channelId of channelIds) {
      try {
        await this._sendToSingleChannel(channelId, content, imageUrl);
        successCount++;
      } catch (err) {
        lastError = err;
        logger.error(`Failed to post to channel ${channelId}: ${err.message?.substring(0, 100)}`);
      }
    }

    if (successCount === 0) {
      throw lastError || new Error('Failed to send to all channels');
    }

    if (successCount < channelIds.length) {
      logger.warn(`Posted to ${successCount}/${channelIds.length} channels`);
    }
  }

  async _sendToSingleChannel(channelId, content, imageUrl) {
    // If image URL is provided, try to send it attached to the text
    if (imageUrl) {
      try {
        if (content.length <= 1024) {
          // Standard photo with caption (cleanest look)
          await this.bot.sendPhoto(channelId, imageUrl, {
            caption: content,
            parse_mode: 'HTML'
          });
          logger.success(`Post + image → ${channelId}`);
          return;
        } else {
          // Text exceeds 1024 limit. Instead of splitting, send as a single text message.
          // We use link_preview_options to display the image prominently ABOVE the text.
          await this.bot.sendMessage(channelId, content, {
            parse_mode: 'HTML',
            link_preview_options: JSON.stringify({
              url: imageUrl,
              show_above_text: true,
              is_disabled: false
            })
          });
          logger.success(`Post + image (unified) → ${channelId}`);
          return;
        }
      } catch (imgError) {
        // Fallback for older bot API or generic error
        try {
          const unifiedContent = `<a href="${imageUrl}">&#8203;</a>${content}`;
          await this.bot.sendMessage(channelId, unifiedContent, {
            parse_mode: 'HTML',
            disable_web_page_preview: false
          });
          logger.success(`Post + image (unified legacy) → ${channelId}`);
          return;
        } catch (legacyErr) {
          logger.warn(`Image failed entirely for ${channelId}, trying text only`);
        }
      }
    }

    // Text-only post
    try {
      await this.bot.sendMessage(channelId, content, {
        parse_mode: 'HTML',
        disable_web_page_preview: false
      });
      logger.success(`Post → ${channelId}`);
    } catch (htmlError) {
      const errDetail = htmlError?.response?.body?.description || htmlError.message || 'Unknown';
      logger.warn(`HTML failed (${channelId}): ${errDetail.substring(0, 80)}`);
      try {
        const plainText = content.replace(/<[^>]+>/g, '');
        await this.bot.sendMessage(channelId, plainText);
        logger.success(`Post (plain) → ${channelId}`);
      } catch (error) {
        logger.error(`Delivery failed (${channelId}): ${error.message}`);
        throw error;
      }
    }
  }

  stop() {
    if (this.bot) {
      this.bot.stopPolling();
      this.isRunning = false;
      logger.info('Bot polling stopped');
    }
  }
}

module.exports = Bot;
