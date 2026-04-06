const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getRandomTemplate, getRandomPrompt } = require('./templates');
const logger = require('./logger');
const https = require('https');
const http = require('http');

class ContentGenerator {
  constructor(keyRotator) {
    this.keyRotator = keyRotator;
    this.retryCount = 0;
    this.maxRetries = 3;
    this.invalidKeys = new Set();
  }

  /**
   * Validate a single Gemini API key with a tiny test call.
   */
  static async validateKey(apiKey) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: 'Say OK' }] }],
        generationConfig: { maxOutputTokens: 5 }
      });
      result.response.text();
      return { valid: true };
    } catch (error) {
      const msg = error.message || '';
      if (msg.includes('limit: 0') || msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
        return { valid: false, error: 'Invalid or exhausted API key (zero quota)' };
      }
      if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
        if (msg.includes('limit: 0')) {
          return { valid: false, error: 'API key has zero quota — permanently unusable' };
        }
        return { valid: true, error: 'Temporarily rate-limited (key is valid)' };
      }
      return { valid: false, error: msg.substring(0, 120) };
    }
  }

  /**
   * Generate a rich, formatted Telegram post with optional image.
   */
  async generatePost(affiliateLink = '', affiliateEnabled = false, templateId = null, imageEnabled = false) {
    const apiKey = this.keyRotator.getNextKey();
    if (!apiKey) {
      throw new Error('No API keys available. Add Gemini API keys in the dashboard.');
    }

    if (this.invalidKeys.has(apiKey)) {
      logger.warn(`Skipping known-invalid key ...${apiKey.slice(-4)}`);
      this.keyRotator.markRateLimited(apiKey, 999999999);
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        return this.generatePost(affiliateLink, affiliateEnabled, templateId, imageEnabled);
      }
      this.retryCount = 0;
      throw new Error('All API keys are invalid. Please add valid Gemini API keys.');
    }

    const template = getRandomTemplate(templateId);
    const prompt = getRandomPrompt(template);

    logger.info(`Generating: ${template.emoji} ${template.name} | Key: ...${apiKey.slice(-4)}`);

    const systemInstruction = `You are a professional crypto and trading content creator for a Telegram channel focused on LuxAlgo (luxalgo.com) — the #1 AI algorithmic trading platform for TradingView.

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

STRUCTURE TEMPLATE (follow this pattern):
[Emoji] <b>[Catchy Title]</b>

[Decorative divider line]

✦ <b>[Section 1 Header]:</b>

<blockquote>[Key insight or definition with → arrow for explanation]</blockquote>

◈ <b>[Section 2 Header]:</b>

<blockquote>[Another key point using → symbol]</blockquote>

⊹ <b>[Section 3 Header]:</b>

<blockquote>[Detail with → arrow]</blockquote>

[Special emoji] <i>[Final summary/takeaway line that's memorable]</i>

#Hashtag1 #Hashtag2 #Hashtag3

CONTENT RULES:
- Write in very simple, easy-to-understand English
- Avoid overly complex or complicated trading jargon
- Explain things in a way a beginner could easily understand
- Use emojis strategically (6-10 per post for visual appeal)
- Sound knowledgeable, confident, authentic — NOT salesy
- Focus on educating and providing genuine value
- Mention LuxAlgo naturally in context
- Keep each section concise (1-3 lines)
- Make it scannable — readers should get value at a glance
- NEVER output raw markdown (**bold** or ##headers) — ONLY HTML tags
${affiliateEnabled && affiliateLink
  ? `- End before hashtags with: ➤ <b>Try LuxAlgo here:</b> ${affiliateLink}`
  : '- Naturally mention luxalgo.com at the end before hashtags'}

${imageEnabled ? `\nIMAGE PROMPT:
After the post content, add a line that starts with exactly "IMAGE_PROMPT:" followed by a short image generation prompt (10-20 words) describing a suitable crypto/trading/tech themed image for this post. This should be a high-quality visual description for AI image generation. Do NOT include IMAGE_PROMPT inside the main post content.` : ''}`;

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

      // ─── HTML Sanitizer for Telegram ───────────────────
      // Remove markdown leftovers
      text = text.replace(/\*\*/g, '').replace(/##/g, '').replace(/__/g, '').replace(/```/g, '');

      // Convert <strong>/<em> to <b>/<i>
      text = text.replace(/<strong[^>]*>/gi, '<b>').replace(/<\/strong>/gi, '</b>');
      text = text.replace(/<em[^>]*>/gi, '<i>').replace(/<\/em>/gi, '</i>');
      text = text.replace(/<br\s*\/?>/gi, '\n');

      // Strip ALL unsupported HTML tags (keep only: b, i, u, s, code, pre, blockquote, a)
      text = text.replace(/<\/?(h[1-6]|p|div|span|hr|ul|ol|li|table|tr|td|th|img|figure|figcaption|section|article|header|footer|nav|main|aside|details|summary)[^>]*>/gi, '');

      // ─── Stack-based tag fixer ───
      // Telegram requires PERFECT nesting. <blockquote><b>text</blockquote></b> is INVALID.
      // Must be: <blockquote><b>text</b></blockquote>
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

          // Add text before this tag
          result += html.substring(lastIndex, pos);
          lastIndex = pos + fullTag.length;

          if (!allowedTags.has(tagName)) {
            // Skip unsupported tags entirely
            continue;
          }

          if (!isClosing) {
            // Opening tag
            stack.push(tagName);
            result += fullTag;
          } else {
            // Closing tag — find matching open tag
            const openIdx = stack.lastIndexOf(tagName);
            if (openIdx === -1) {
              // No matching open tag — skip this closing tag
              continue;
            }
            // Close any tags that are open AFTER the matching open tag (fix nesting)
            const tagsToClose = stack.splice(openIdx);
            // Close them in reverse order (innermost first)
            for (let i = tagsToClose.length - 1; i >= 1; i--) {
              result += `</${tagsToClose[i]}>`;
            }
            result += `</${tagName}>`;
            // Re-open the tags we had to force-close (except the one we just closed)
            for (let i = 1; i < tagsToClose.length; i++) {
              result += `<${tagsToClose[i]}>`;
              stack.push(tagsToClose[i]);
            }
          }
        }

        // Add remaining text
        result += html.substring(lastIndex);

        // Close any remaining unclosed tags
        while (stack.length > 0) {
          result += `</${stack.pop()}>`;
        }

        return result;
      }

      text = fixHtmlNesting(text);

      // Fix nested blockquotes (Telegram doesn't support them)
      text = text.replace(/<blockquote>\s*<blockquote>/g, '<blockquote>');
      text = text.replace(/<\/blockquote>\s*<\/blockquote>/g, '</blockquote>');

      // Escape ampersands that aren't HTML entities
      text = text.replace(/&(?!amp;|lt;|gt;|quot;|#\d+;)/g, '&amp;');

      // Clean excessive blank lines
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

      this.retryCount = 0;
      logger.success(`Content ready (${text.length} chars) — ${template.name}`);

      return {
        content: text.trim(),
        template: `${template.emoji} ${template.name}`,
        templateId: template.id,
        generatedAt: new Date().toISOString(),
        imageUrl: imageUrl,
        imagePrompt: imagePrompt
      };
    } catch (error) {
      const msg = error.message || '';
      const is429 = error.status === 429
        || msg.includes('429')
        || msg.includes('quota')
        || msg.includes('RESOURCE_EXHAUSTED');

      const isPermanentlyDead = msg.includes('limit: 0')
        || msg.includes('API_KEY_INVALID')
        || msg.includes('API key not valid');

      if (isPermanentlyDead) {
        logger.error(`Key ...${apiKey.slice(-4)} is INVALID (zero quota) — marking for removal`);
        this.invalidKeys.add(apiKey);
        this.keyRotator.markRateLimited(apiKey, 999999999);

        if (this.retryCount < this.maxRetries) {
          this.retryCount++;
          return this.generatePost(affiliateLink, affiliateEnabled, templateId, imageEnabled);
        }
        this.retryCount = 0;
        throw new Error('All API keys are invalid or exhausted. Add new valid keys in the dashboard.');
      }

      if (is429 && this.retryCount < this.maxRetries) {
        this.retryCount++;
        logger.warn(`Key ...${apiKey.slice(-4)} temporarily rate-limited — rotating (attempt ${this.retryCount}/${this.maxRetries})`);
        this.keyRotator.markRateLimited(apiKey, 65000);
        await new Promise(r => setTimeout(r, 2000));
        return this.generatePost(affiliateLink, affiliateEnabled, templateId, imageEnabled);
      }

      this.retryCount = 0;
      logger.error(`Generation failed: ${msg.substring(0, 200)}`);
      throw error;
    }
  }
}

module.exports = ContentGenerator;
