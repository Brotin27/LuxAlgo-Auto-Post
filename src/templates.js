/**
 * LuxAlgo Post Templates
 * Each template has a category, display info, and multiple prompt variations
 * to keep content diverse and non-repetitive.
 */

const templates = [
  {
    id: 'feature_spotlight',
    name: 'Feature Spotlight',
    emoji: '🔥',
    category: 'feature',
    prompts: [
      "Write a compelling Telegram channel post (200-280 words) highlighting LuxAlgo's Price Action Concepts (PAC) indicator on TradingView. Explain how it auto-detects order blocks, fair value gaps (FVG), liquidity zones, and market structure shifts like BOS and CHoCH. Make it engaging for crypto and forex traders. Use emojis naturally. Use plain text with line breaks, no markdown.",
      "Write an engaging Telegram post (200-280 words) about LuxAlgo's Signals & Overlays toolkit on TradingView. Highlight the buy/sell signals, dynamic support/resistance levels, trend detection, and exit hints. Target crypto and stock traders. Use emojis and plain text formatting.",
      "Write a Telegram post (200-280 words) about LuxAlgo's Oscillator Matrix on TradingView. Cover the momentum indicators, divergence detection, money flow analysis, and trend exhaustion alerts. Make it exciting and valuable for traders.",
      "Write a Telegram post (200-280 words) about LuxAlgo's AI Backtesting feature. Explain how traders can scan and test millions of strategies across different assets and timeframes to find winning setups. Make it sound innovative and useful.",
      "Write a Telegram post (200-280 words) about LuxAlgo's Quant - the #1 AI agent for Pine Script on TradingView. Explain how it helps traders build custom indicators, replicate strategies in one click, and set automated alerts. Make it compelling.",
      "Write a Telegram post (200-280 words) about LuxAlgo's multi-timeframe Screeners on TradingView. Explain how they scan dozens of tickers across multiple timeframes simultaneously, helping traders spot setups they'd otherwise miss."
    ]
  },
  {
    id: 'crypto_insight',
    name: 'Crypto Market Insight',
    emoji: '📊',
    category: 'crypto',
    prompts: [
      "Write a Telegram post (180-250 words) about why having proper technical analysis tools like LuxAlgo on TradingView is critical in today's volatile crypto markets. Reference how BTC and ETH movements can be better analyzed with AI-powered indicators. Don't give specific price predictions. Use emojis naturally.",
      "Write a Telegram post (180-250 words) about the importance of reading market structure in crypto. Explain concepts like Break of Structure and Change of Character, and how LuxAlgo automates their detection. Keep it educational.",
      "Write a Telegram post (180-250 words) about smart money concepts in crypto trading - order blocks, liquidity sweeps, institutional order flow - and how LuxAlgo's indicators on TradingView help identify these patterns automatically.",
      "Write a Telegram post (180-250 words) about the rise of algorithmic and AI-powered trading in crypto markets, and how platforms like LuxAlgo are making institutional-grade analysis accessible to retail traders.",
      "Write a Telegram post (180-250 words) explaining how crypto markets operate 24/7 and why automated analysis tools like LuxAlgo are essential for traders who can't watch charts all day. Mention screeners and alerts."
    ]
  },
  {
    id: 'trading_tip',
    name: 'Trading Tip',
    emoji: '💡',
    category: 'education',
    prompts: [
      "Write a Telegram post (150-220 words) with a practical trading tip about using support and resistance levels effectively. Mention how tools like LuxAlgo can automatically identify dynamic S/R on TradingView. Make it actionable.",
      "Write a Telegram post (150-220 words) about the importance of backtesting trading strategies before risking real money. Explain how LuxAlgo's AI backtesting platform makes this process easy and data-driven.",
      "Write a Telegram post (150-220 words) sharing a trading tip about using multiple timeframe analysis. Explain how LuxAlgo's screeners can scan across timeframes simultaneously, saving traders hours of manual analysis.",
      "Write a Telegram post (150-220 words) with a tip about managing risk in trading. Briefly mention how using confirmed signals from tools like LuxAlgo's buy/sell indicators can help avoid emotional trading decisions.",
      "Write a Telegram post (150-220 words) about the power of confluence in trading - when multiple indicators agree. Explain how LuxAlgo's toolkit (PAC + Signals + Oscillator) provides multi-factor confirmation on TradingView."
    ]
  },
  {
    id: 'why_luxalgo',
    name: 'Why LuxAlgo',
    emoji: '🎯',
    category: 'persuasion',
    prompts: [
      "Write a Telegram post (200-270 words) about why smart traders are switching to LuxAlgo for their TradingView charts. Highlight the all-in-one nature of the toolkit, AI features, and the community. Don't be overly salesy - focus on genuine value.",
      "Write a Telegram post (200-270 words) comparing manual chart analysis vs using LuxAlgo's automated indicators. Show how much time and effort traders save while getting more accurate analysis. Be genuine, not pushy.",
      "Write a Telegram post (200-270 words) about what makes LuxAlgo different from other TradingView indicators. Mention the AI backtesting, Quant AI agent, comprehensive toolkit approach, and active community on Discord.",
      "Write a Telegram post (200-270 words) addressing common concerns traders have about using indicators. Explain how LuxAlgo is built differently - with AI integration, constant updates, and professional-grade accuracy."
    ]
  },
  {
    id: 'ai_revolution',
    name: 'AI Trading Revolution',
    emoji: '🧠',
    category: 'ai',
    prompts: [
      "Write a Telegram post (200-260 words) about how AI is transforming trading in 2024-2025. Discuss how platforms like LuxAlgo are at the forefront with their AI backtesting and Quant AI agent for Pine Script on TradingView. Make it forward-looking and exciting.",
      "Write a Telegram post (200-260 words) about LuxAlgo's Quant AI agent - explain how it can build Pine Script indicators and strategies using natural language, replicate any strategy in one click, and automate the entire process. Make it sound revolutionary.",
      "Write a Telegram post (200-260 words) about the intersection of AI and technical analysis. Explain how LuxAlgo uses AI to scan millions of strategy combinations, find optimal parameters, and deliver actionable trading signals.",
      "Write a Telegram post (200-260 words) about how AI backtesting is changing the game for traders. Explain LuxAlgo's approach to letting traders test strategies across any asset and timeframe with AI optimization."
    ]
  },
  {
    id: 'chart_pattern',
    name: 'Chart Pattern Alert',
    emoji: '📈',
    category: 'education',
    prompts: [
      "Write a Telegram post (180-240 words) about identifying fair value gaps (FVG) in crypto and forex charts. Explain what they are, why they matter, and how LuxAlgo's PAC indicator automatically highlights them on TradingView.",
      "Write a Telegram post (180-240 words) about order blocks in trading - what they are, how institutional traders use them, and how LuxAlgo's indicators auto-detect them on your TradingView charts.",
      "Write a Telegram post (180-240 words) about the importance of identifying liquidity zones in trading. Explain the concept and how LuxAlgo maps these zones automatically, helping traders anticipate price movements.",
      "Write a Telegram post (180-240 words) about Break of Structure (BOS) and Change of Character (CHoCH) in price action. Explain these concepts and how LuxAlgo labels them automatically on TradingView charts.",
      "Write a Telegram post (180-240 words) about divergence trading - what RSI and MACD divergences mean, and how LuxAlgo's Oscillator Matrix detects them automatically across multiple indicators."
    ]
  },
  {
    id: 'quick_hack',
    name: 'Quick Trading Hack',
    emoji: '⚡',
    category: 'tips',
    prompts: [
      "Write a SHORT Telegram post (100-150 words) sharing a quick trading hack: setting up TradingView alerts with LuxAlgo indicators so you never miss a trading setup. Make it punchy and actionable.",
      "Write a SHORT Telegram post (100-150 words) about a quick hack: using LuxAlgo's screener to scan the top 50 crypto coins for setups in seconds instead of checking charts one by one.",
      "Write a SHORT Telegram post (100-150 words) sharing a quick tip: combining LuxAlgo's buy signals with volume confirmation for higher-probability trades. Keep it concise and valuable.",
      "Write a SHORT Telegram post (100-150 words) about a trading hack: using multi-timeframe analysis with LuxAlgo - checking the daily trend with weekly confirmation before entering trades.",
      "Write a SHORT Telegram post (100-150 words) sharing a quick hack: using LuxAlgo's exit hints feature to know exactly when to take profits instead of guessing."
    ]
  },
  {
    id: 'pro_strategy',
    name: 'Pro Strategy',
    emoji: '🏆',
    category: 'advanced',
    prompts: [
      "Write a Telegram post (200-280 words) about an advanced trading strategy: combining LuxAlgo's market structure analysis (BOS/CHoCH) with order block entries for high-probability setups. Make it sound like expert knowledge being shared.",
      "Write a Telegram post (200-280 words) about a pro strategy: using LuxAlgo's Oscillator Matrix to identify momentum divergences as early reversal signals, combined with the Signals & Overlays for entry confirmation.",
      "Write a Telegram post (200-280 words) about building a systematic trading approach using LuxAlgo's AI backtesting. Explain how pros test and validate strategies with data before risking capital.",
      "Write a Telegram post (200-280 words) about a multi-indicator strategy: using LuxAlgo's PAC for structure, Signals for entries, and Oscillator for momentum confirmation. Show the power of the full toolkit working together."
    ]
  },
  {
    id: 'hidden_gem',
    name: 'Hidden Gem Feature',
    emoji: '💎',
    category: 'feature',
    prompts: [
      "Write a Telegram post (180-240 words) about a lesser-known LuxAlgo feature that most traders don't know about: the ability to set advanced webhook alerts that can connect to brokers and prop firm platforms for automated execution.",
      "Write a Telegram post (180-240 words) about LuxAlgo's 30-day money-back guarantee - how new traders can try the full platform risk-free. Make it informative, not pushy.",
      "Write a Telegram post (180-240 words) about LuxAlgo's Discord community - one of the largest trading communities globally. Highlight the value of learning from other traders and getting support.",
      "Write a Telegram post (180-240 words) about LuxAlgo's prop firm integration features. Explain how traders can use LuxAlgo's strategies and alerts to tackle prop firm challenges with AI-backed analysis.",
      "Write a Telegram post (180-240 words) about LuxAlgo's free tier and library of community indicators. Explain how traders can start exploring the platform before committing to a premium plan."
    ]
  },
  {
    id: 'platform_news',
    name: 'Platform Update',
    emoji: '🔔',
    category: 'news',
    prompts: [
      "Write a Telegram post (150-220 words) in the style of a platform news update, talking about how LuxAlgo continues to evolve with AI features like Quant and backtesting. Make it sound like an exciting industry development.",
      "Write a Telegram post (150-220 words) about the growing trend of AI-powered trading platforms. Position LuxAlgo as one of the leaders in this space with their TradingView integration and AI tools.",
      "Write a Telegram post (150-220 words) about how the trading community is embracing automated analysis. Mention LuxAlgo's growing user base and their comprehensive suite of tools on TradingView.",
      "Write a Telegram post (150-220 words) about new developments in the TradingView ecosystem and how LuxAlgo stays at the cutting edge with constant updates to their indicator suite and AI features."
    ]
  },
  {
    id: 'market_psychology',
    name: 'Market Psychology',
    emoji: '🧘',
    category: 'education',
    prompts: [
      "Write a Telegram post (180-250 words) about trading psychology - how emotions destroy trading accounts and why using objective tools like LuxAlgo's indicator signals helps remove emotional bias from decisions.",
      "Write a Telegram post (180-250 words) about FOMO in crypto trading - why traders jump into trades too late and how using structured analysis with tools like LuxAlgo helps maintain discipline.",
      "Write a Telegram post (180-250 words) about the importance of having a trading plan and how LuxAlgo's backtesting capabilities help traders build confidence in their strategies before going live.",
      "Write a Telegram post (180-250 words) about revenge trading and how to avoid it. Explain how systematic approaches using LuxAlgo indicators provide clear, data-driven signals that reduce impulsive decisions."
    ]
  },
  {
    id: 'beginner_guide',
    name: 'Beginner\'s Corner',
    emoji: '📚',
    category: 'education',
    prompts: [
      "Write a Telegram post (200-260 words) for complete beginners explaining what TradingView is and how adding LuxAlgo indicators can transform their charts from confusing to clear. Keep it simple and welcoming.",
      "Write a Telegram post (200-260 words) for beginners about the basics of technical analysis - what candles, trends, support/resistance mean - and how LuxAlgo automates the hard parts. Make it encouraging.",
      "Write a Telegram post (200-260 words) explaining what trading indicators are in simple terms, and why LuxAlgo's suite is considered one of the best on TradingView. Target people new to trading.",
      "Write a Telegram post (200-260 words) guiding beginners on how to get started with crypto trading analysis. Recommend using TradingView with LuxAlgo's tools as a starting point. Be supportive, not intimidating."
    ]
  }
];

// Track recently used templates to avoid repetition
let recentlyUsed = [];
const MAX_RECENT = 6;

function getRandomTemplate(specificId = null) {
  if (specificId) {
    return templates.find(t => t.id === specificId) || templates[0];
  }

  // Filter out recently used
  const available = templates.filter(t => !recentlyUsed.includes(t.id));
  const pool = available.length > 0 ? available : templates;

  const template = pool[Math.floor(Math.random() * pool.length)];

  recentlyUsed.push(template.id);
  if (recentlyUsed.length > MAX_RECENT) {
    recentlyUsed.shift();
  }

  return template;
}

function getRandomPrompt(template) {
  return template.prompts[Math.floor(Math.random() * template.prompts.length)];
}

function getAllCategories() {
  return templates.map(t => ({
    id: t.id,
    name: t.name,
    emoji: t.emoji,
    category: t.category
  }));
}

module.exports = { templates, getRandomTemplate, getRandomPrompt, getAllCategories };
