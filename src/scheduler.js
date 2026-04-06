const cron = require('node-cron');
const logger = require('./logger');

class Scheduler {
  constructor(config, contentGenerator, bot) {
    this.config = config;
    this.contentGenerator = contentGenerator;
    this.bot = bot;
    this.jobs = [];
    this.todaySchedule = [];
    this.isRunning = false;
    this.onConfigUpdate = null;   // Callback to save config
    this.onHistoryUpdate = null;  // Callback to save post history
  }

  /**
   * Calculate evenly-spaced post times within the posting window,
   * with slight random variation so posts don't fire at the exact same minute daily.
   */
  calculatePostTimes() {
    const { postsPerDay, postStartHour, postEndHour } = this.config;
    const totalMinutes = (postEndHour - postStartHour) * 60;
    const interval = Math.floor(totalMinutes / postsPerDay);

    const times = [];
    for (let i = 0; i < postsPerDay; i++) {
      const baseMinute = postStartHour * 60 + Math.floor(interval * i + interval / 2);
      const jitter = Math.floor(Math.random() * 20) - 10; // ±10 min
      const totalMin = Math.max(postStartHour * 60, Math.min(postEndHour * 60 - 1, baseMinute + jitter));

      times.push({
        hour: Math.floor(totalMin / 60),
        minute: totalMin % 60
      });
    }

    return times;
  }

  /**
   * Build today's schedule with Done / Next / Pending status markers.
   */
  buildTodaySchedule() {
    const times = this.calculatePostTimes();
    const nowStr = new Date().toLocaleString('en-US', { timeZone: this.config.timezone });
    const tzNow = new Date(nowStr);

    this.todaySchedule = times.map((time, index) => {
      const totalMin = time.hour * 60 + time.minute;
      const nowMin = tzNow.getHours() * 60 + tzNow.getMinutes();

      return {
        id: index + 1,
        hour: time.hour,
        minute: time.minute,
        time: `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`,
        status: totalMin <= nowMin ? 'done' : 'pending',
        postedAt: null
      };
    });

    // Mark the first pending slot as "next"
    const nextIdx = this.todaySchedule.findIndex(s => s.status === 'pending');
    if (nextIdx !== -1) {
      this.todaySchedule[nextIdx].status = 'next';
    }
  }

  /**
   * Start cron jobs for each post slot + a midnight refresh job.
   */
  start() {
    this.stop(); // Clear old jobs
    this.buildTodaySchedule();

    const times = this.calculatePostTimes();

    times.forEach((time, index) => {
      const expr = `${time.minute} ${time.hour} * * *`;
      const job = cron.schedule(expr, async () => {
        if (!this.config.botEnabled) {
          logger.info('Bot paused — skipping scheduled post');
          return;
        }
        await this.executePost(index);
      }, { timezone: this.config.timezone });

      this.jobs.push(job);
    });

    // Rebuild schedule at midnight
    const midnight = cron.schedule('0 0 * * *', () => {
      logger.info('New day — rebuilding schedule');
      this.buildTodaySchedule();
    }, { timezone: this.config.timezone });
    this.jobs.push(midnight);

    this.isRunning = true;

    const timeStr = times.map(t =>
      `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`
    ).join(' • ');

    logger.success(`Scheduler live — ${times.length} posts/day (${this.config.timezone})`);
    logger.info(`Today's slots: ${timeStr}`);
  }

  /**
   * Execute a scheduled post at the given schedule index.
   */
  async executePost(scheduleIndex) {
    try {
      logger.info(`Generating scheduled post #${scheduleIndex + 1}...`);

      const post = await this.contentGenerator.generatePost(
        this.config.affiliateLink,
        this.config.affiliateEnabled,
        null,
        this.config.imageEnabled || false
      );

      await this.bot.sendToChannel(post.content, post.imageUrl || null);

      // Update timeline status
      if (this.todaySchedule[scheduleIndex]) {
        this.todaySchedule[scheduleIndex].status = 'done';
        this.todaySchedule[scheduleIndex].postedAt = new Date().toISOString();
      }

      // Advance "next" marker
      const nextIdx = this.todaySchedule.findIndex(s => s.status === 'pending');
      if (nextIdx !== -1) {
        this.todaySchedule[nextIdx].status = 'next';
      }

      // Persist to history
      this._saveToHistory(post);

      logger.success(`Scheduled post #${scheduleIndex + 1} delivered ✓`);
    } catch (error) {
      logger.error(`Scheduled post #${scheduleIndex + 1} failed: ${error.message}`);
    }
  }

  /**
   * Fire a manual post (from dashboard or /post command).
   */
  async manualPost(templateId = null) {
    try {
      logger.info('Manual post triggered...');

      const post = await this.contentGenerator.generatePost(
        this.config.affiliateLink,
        this.config.affiliateEnabled,
        templateId,
        this.config.imageEnabled || false
      );

      await this.bot.sendToChannel(post.content, post.imageUrl || null);
      this._saveToHistory(post, true);

      logger.success('Manual post sent ✓');
      return post;
    } catch (error) {
      logger.error(`Manual post failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Save a post to the history file.
   */
  _saveToHistory(post, manual = false) {
    if (this.onHistoryUpdate) {
      this.onHistoryUpdate({
        content: post.content,
        template: post.template,
        templateId: post.templateId,
        postedAt: new Date().toISOString(),
        manual
      });
    }
  }

  /**
   * Get the countdown to the next scheduled post.
   */
  getNextPostCountdown() {
    const nowStr = new Date().toLocaleString('en-US', { timeZone: this.config.timezone });
    const tzNow = new Date(nowStr);

    const nextSlot = this.todaySchedule.find(s => s.status === 'next' || s.status === 'pending');
    if (!nextSlot) return null;

    const target = new Date(tzNow);
    target.setHours(nextSlot.hour, nextSlot.minute, 0, 0);

    const diff = target.getTime() - tzNow.getTime();
    if (diff <= 0) return null;

    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    return {
      hours, minutes, seconds,
      formatted: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
      totalMs: diff,
      nextTime: nextSlot.time
    };
  }

  getScheduleTimeline() {
    return this.todaySchedule;
  }

  stop() {
    this.jobs.forEach(j => j.stop());
    this.jobs = [];
    this.isRunning = false;
  }

  restart() {
    logger.info('Restarting scheduler with new settings...');
    this.stop();
    this.start();
  }
}

module.exports = Scheduler;
