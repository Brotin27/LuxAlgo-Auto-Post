const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getRandomTemplate, getRandomPrompt } = require('./templates');
const logger = require('./logger');
const https = require('https');
const http = require('http');

class ContentGenerator {
  constructor(keyRotator, config) {
    this.keyRotator = keyRotator;
    this.config = config; // Reference to live config (for groqKey)
    this.retryCount = 0;
    this.maxRetries = 5;
    this.invalidKeys = new Set();
    this.groqModels = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'];
  }

  /**
   * Validate a single Gemini API key with a tiny test call.
   */
  static async validateKey(apiKey) {
    const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
    for (const modelName of models) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: 'Say OK' }] }],
          generationConfig: { maxOutputTokens: 5 }
        });
        result.response.text();
        return { valid: true, model: modelName };
      } catch (error) {
        const msg = error.message || '';
        if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
          return { valid: false, error: 'Invalid API key' };
        }
        if (msg.includes('limit: 0')) {
          return { valid: false, error: 'API key has zero quota — permanently unusable' };
        }
        if (msg.includes('is not found') || msg.includes('not supported') || msg.includes('deprecated')) {
          continue; // Try next model
        }
        if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
          return { valid: true, error: 'Temporarily rate-limited (key is valid)' };
        }
        // If last model, return error
        if (modelName === models[models.length - 1]) {
          return { valid: false, error: msg.substring(0, 150) };
        }
      }
    }
    return { valid: false, error: 'No compatible model found' };
  }

  /**
   * Smart delay calculation based on retry attempt.
   * Exponential backoff: 2s, 4s, 8s, 16s, 30s max
   */
  _getRetryDelay(attempt) {
    return Math.min(2000 * Math.pow(2, attempt - 1), 30000);
  }

  /**
   * Generate a rich, formatted Telegram post with optional image.
   */
  async generatePost(affiliateLink = '', affiliateEnabled = false, templateId = null, imageEnabled = false) {
    const apiKey = this.keyRotator.getNextKey();
    if (!apiKey) {
      const deadCount = this.keyRotator.getDeadKeyCount();
      const totalCount = this.keyRotator.getKeyCount();
      if (deadCount > 0 && deadCount === totalCount) {
        throw new Error(`All ${totalCount} API keys are dead/exhausted. Add new valid Gemini API keys in the dashboard.`);
      }
      throw new Error('No API keys available. Add Gemini API keys in the dashboard.');
    }

    const template = getRandomTemplate(templateId);
    const prompt = getRandomPrompt(template);

    const aliveCount = this.keyRotator.getAliveKeyCount();
    const activeCount = this.keyRotator.getActiveKeyCount();
    logger.info(`Generating: ${template.emoji} ${template.name} | Key: ...${apiKey.slice(-4)} | Keys: ${activeCount}/${aliveCount} active`);

    const systemInstruction = this._buildSystemPrompt(affiliateLink, affiliateEnabled, imageEnabled);

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: {
          temperature: 0.9,
          topP: 0.95,
          maxOutputTokens: 1500,
        }
      });

      let text = result.response.text();

      // Mark success on the key
      this.keyRotator.markSuccess(apiKey);
      this.retryCount = 0;
      return this._postProcess(text, template, imageEnabled, 'gemini');
    } catch (error) {
      const msg = error.message || '';
      const is429 = error.status === 429
        || msg.includes('429')
        || msg.includes('quota')
        || msg.includes('RESOURCE_EXHAUSTED');

      const isPermanentlyDead = msg.includes('limit: 0')
        || msg.includes('API_KEY_INVALID')
        || msg.includes('API key not valid')
        || msg.includes('deprecated')
        || msg.includes('is not found');

      if (isPermanentlyDead) {
        logger.error(`🔴 Key ...${apiKey.slice(-4)} is DEAD (zero quota / invalid) — removing from rotation`);
        this.invalidKeys.add(apiKey);
        this.keyRotator.markDead(apiKey);

        const alive = this.keyRotator.getAliveKeyCount();
        if (alive > 0 && this.retryCount < this.maxRetries) {
          this.retryCount++;
          logger.warn(`↻ Trying next Gemini key... (${alive} alive keys remaining)`);
          return this.generatePost(affiliateLink, affiliateEnabled, templateId, imageEnabled);
        }

        // All Gemini keys dead — try Groq fallback
        this.retryCount = 0;
        return this._tryGroqFallback(affiliateLink, affiliateEnabled, templateId, imageEnabled);
      }

      if (is429 && this.retryCount < this.maxRetries) {
        this.retryCount++;
        const cooldown = this.keyRotator.markRateLimited(apiKey);
        const delay = this._getRetryDelay(this.retryCount);
        logger.warn(`⏳ Key ...${apiKey.slice(-4)} rate-limited (cooldown: ${Math.round(cooldown/1000)}s) — retry ${this.retryCount}/${this.maxRetries} in ${Math.round(delay/1000)}s`);
        await new Promise(r => setTimeout(r, delay));
        return this.generatePost(affiliateLink, affiliateEnabled, templateId, imageEnabled);
      }

      // Generic error — try Groq as last resort
      this.retryCount = 0;
      logger.error(`Gemini failed: ${msg.substring(0, 150)}`);
      return this._tryGroqFallback(affiliateLink, affiliateEnabled, templateId, imageEnabled);
    }
  }

  /**
   * Try Groq as fallback when all Gemini keys are exhausted.
   */
  async _tryGroqFallback(affiliateLink, affiliateEnabled, templateId, imageEnabled) {
    const groqKey = this.config?.groqKey;
    if (!groqKey) {
      throw new Error('All Gemini keys exhausted and no Groq API key configured. Add a Groq key in Settings → AI Providers.');
    }

    logger.info('🔄 Switching to Groq fallback...');
    return this._generateWithGroq(groqKey, affiliateLink, affiliateEnabled, templateId, imageEnabled);
  }

  /**
   * Generate content using Groq API (OpenAI-compatible).
   */
  async _generateWithGroq(groqKey, affiliateLink, affiliateEnabled, templateId, imageEnabled) {
    const template = getRandomTemplate(templateId);
    const prompt = getRandomPrompt(template);
    const systemPrompt = this._buildSystemPrompt(affiliateLink, affiliateEnabled, imageEnabled);

    let lastError = null;

    for (const modelName of this.groqModels) {
      try {
        logger.info(`🤖 Groq: ${template.emoji} ${template.name} | Model: ${modelName}`);

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqKey}`,
          },
          body: JSON.stringify({
            model: modelName,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt },
            ],
            temperature: 0.9,
            max_tokens: 1500,
            top_p: 0.95,
          }),
        });

        if (!response.ok) {
          const errBody = await response.text();
          if (response.status === 429) {
            logger.warn(`Groq ${modelName} rate-limited, trying next model...`);
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          throw new Error(`Groq API ${response.status}: ${errBody.substring(0, 150)}`);
        }

        const data = await response.json();
        let text = data.choices?.[0]?.message?.content || '';

        if (!text || text.length < 50) {
          logger.warn(`Groq ${modelName} returned short response, trying next...`);
          continue;
        }

        logger.success(`✅ Groq generated content (${text.length} chars) via ${modelName}`);
        return this._postProcess(text, template, imageEnabled, 'groq');

      } catch (err) {
        lastError = err;
        logger.warn(`Groq ${modelName} failed: ${err.message?.substring(0, 100)}`);
      }
    }

    throw lastError || new Error('All Groq models failed. Check your Groq API key.');
  }

  /**
   * Build the system prompt (shared between Gemini and Groq).
   */
  _buildSystemPrompt(affiliateLink, affiliateEnabled, imageEnabled) {
    return `You are a professional crypto and trading content creator for a Telegram channel focused on LuxAlgo (luxalgo.com) — the #1 AI algorithmic trading platform for TradingView.

You write beautifully formatted, visually stunning Telegram posts using HTML formatting and decorative Unicode symbols.

FORMAT RULES (VERY IMPORTANT — FOLLOW EXACTLY):
- Use Telegram HTML tags: <b>bold</b>, <i>italic</i>, <blockquote>quote blocks</blockquote>
- Use these decorative Unicode symbols for section headers and bullets:
  ✦ ◈ ⟐ ⊹ ❋ ✧ ➤ ▸ ◆ ❖ ⟡ ✴ ⚡ 🔹 ◉ ═══
- Use arrow symbols for key-value pairs: →  ⟶  ⇒
- Use line dividers like: ━━━━━━━━━━━ or ═══════════ or ┈┈┈┈┈┈┈┈┈┈
- Make section titles bold with a decorative icon: ✦ <b>Section Title</b>
- Put key definitions, facts, or quotes inside <blockquote>text</blockquote>
- Use blank lines between sections for clean spacing
- Put important terms or highlights in <b>bold</b>
- Use <i>italic</i> for emphasis on philosophical or summary lines
- End with an inspiring or thought-provoking summary line using a special emoji
- Include 3-5 hashtags at the very end on a new line

CONTENT RULES:
- Write in very simple, easy-to-understand English
- Avoid overly complex trading jargon
- Use emojis strategically (6-10 per post)
- Sound knowledgeable, confident, authentic — NOT salesy
- Mention LuxAlgo naturally in context
- Keep sections concise (1-3 lines)
- NEVER output raw markdown (**bold** or ##headers) — ONLY HTML tags
${affiliateEnabled && affiliateLink
  ? `- End before hashtags with: ➤ <b>Try LuxAlgo here:</b> ${affiliateLink}`
  : '- Naturally mention luxalgo.com at the end before hashtags'}
${imageEnabled ? `\nIMAGE PROMPT:
After the post content, add a line starting with exactly "IMAGE_PROMPT:" followed by a short image generation prompt (10-20 words) describing a suitable crypto/trading themed image.` : ''}`;
  }

  /**
   * Post-process generated text: sanitize HTML, extract image prompt, etc.
   */
  _postProcess(text, template, imageEnabled, provider = 'gemini') {
    // ─── HTML Sanitizer for Telegram ───────────────────
    text = text.replace(/\*\*/g, '').replace(/##/g, '').replace(/__/g, '').replace(/```/g, '');
    text = text.replace(/<strong[^>]*>/gi, '<b>').replace(/<\/strong>/gi, '</b>');
    text = text.replace(/<em[^>]*>/gi, '<i>').replace(/<\/em>/gi, '</i>');
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/?(h[1-6]|p|div|span|hr|ul|ol|li|table|tr|td|th|img|figure|figcaption|section|article|header|footer|nav|main|aside|details|summary)[^>]*>/gi, '');

    // ─── Stack-based tag fixer ───
    const allowedTags = new Set(['b', 'i', 'u', 's', 'code', 'pre', 'blockquote', 'a']);

    function fixHtmlNesting(html) {
      const tagRegex = /<\/?([a-z][a-z0-9]*)[^>]*>/gi;
      const stack = [];
      let result = '';
      let lastIndex = 0;
      let match;

      while ((match = tagRegex.exec(html)) !== null) {
        const fullTag = match[0];
        const tagName = match[1].toLowerCase();
        const isClosing = fullTag[1] === '/';
        const pos = match.index;

        result += html.substring(lastIndex, pos);
        lastIndex = pos + fullTag.length;

        if (!allowedTags.has(tagName)) continue;

        if (!isClosing) {
          stack.push(tagName);
          result += fullTag;
        } else {
          const openIdx = stack.lastIndexOf(tagName);
          if (openIdx === -1) continue;
          const tagsToClose = stack.splice(openIdx);
          for (let i = tagsToClose.length - 1; i >= 1; i--) result += `</${tagsToClose[i]}>`;
          result += `</${tagName}>`;
          for (let i = 1; i < tagsToClose.length; i++) {
            result += `<${tagsToClose[i]}>`;
            stack.push(tagsToClose[i]);
          }
        }
      }

      result += html.substring(lastIndex);
      while (stack.length > 0) result += `</${stack.pop()}>`;
      return result;
    }

    text = fixHtmlNesting(text);
    text = text.replace(/<blockquote>\s*<blockquote>/g, '<blockquote>');
    text = text.replace(/<\/blockquote>\s*<\/blockquote>/g, '</blockquote>');
    text = text.replace(/&(?!amp;|lt;|gt;|quot;|#\d+;)/g, '&amp;');
    text = text.replace(/\n{4,}/g, '\n\n\n');

    // Extract image prompt if present
    let imagePrompt = null;
    let imageUrl = null;

    if (imageEnabled) {
      const imgMatch = text.match(/IMAGE_PROMPT:\s*(.+)/i);
      if (imgMatch) {
        imagePrompt = imgMatch[1].trim();
        text = text.replace(/\n?IMAGE_PROMPT:\s*.+/i, '').trim();
        imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt + ', digital art, crypto trading theme, dark background, premium quality, 4k, vibrant neon colors')}?width=1024&height=576&nologo=true`;
        logger.info(`Image prompt: ${imagePrompt}`);
      }
    }

    logger.success(`Content ready (${text.length} chars) via ${provider} — ${template.name}`);

    return {
      content: text.trim(),
      template: `${template.emoji} ${template.name}`,
      templateId: template.id,
      generatedAt: new Date().toISOString(),
      imageUrl,
      imagePrompt,
      provider,
    };
  }
}

module.exports = ContentGenerator;
