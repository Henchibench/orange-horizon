import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(__dirname);
const outputPath = `${projectRoot}/docs/data/news.json`;
const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim();
const anthropicEndpoint = 'https://api.anthropic.com/v1';
const anthropicPreferredModels = [
  process.env.ANTHROPIC_MODEL?.trim(),
  'claude-haiku-4-5',
  'claude-haiku-4-5-20251001',
  'claude-3-5-haiku-20241022',
  'claude-3-haiku-20240307'
].filter(Boolean);

const sections = [
  {
    id: 'trump-usa',
    name: 'Trump / USA',
    label: 'Makt, cirkus, federalt brus',
    description: 'Amerikansk politik, institutionellt slitage och Trumps omloppsbana.',
    feeds: [
      { label: 'The Guardian: Donald Trump', url: 'https://www.theguardian.com/us-news/donaldtrump/rss', include: [/trump|donald trump|white house/i], headlineOnly: true },
      { label: 'BBC News: US & Canada', url: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml', include: [/trump|donald trump|white house/i], headlineOnly: true },
      { label: 'BBC News: Politics', url: 'https://feeds.bbci.co.uk/news/politics/rss.xml', include: [/trump|donald trump|white house/i], headlineOnly: true },
      { label: 'Al Jazeera RSS', url: 'https://www.aljazeera.com/xml/rss/all.xml', include: [/trump|donald trump|white house/i], headlineOnly: true }
    ]
  },
  {
    id: 'putin-ukraina',
    name: 'Putin / Ukraina',
    label: 'Krig, repression, diplomatiskt grus',
    description: 'Fronten, Kreml och följderna i Ukraina och bortom den.',
    feeds: [
      { label: 'The Guardian: Ukraine', url: 'https://www.theguardian.com/world/ukraine/rss', include: [/ukraine|ukrainian|russia|russian|putin|kremlin|kyiv|kharkiv|odesa|odessa|donetsk|dnipro/i] },
      { label: 'BBC News: Europe', url: 'https://feeds.bbci.co.uk/news/world/europe/rss.xml', include: [/ukraine|ukrainian|russia|russian|putin|kremlin|kyiv|moscow/i] },
      { label: 'DW: All', url: 'https://rss.dw.com/rdf/rss-en-all', include: [/ukraine|ukrainian|russia|russian|putin|kremlin|kyiv|moscow/i] },
      { label: 'Al Jazeera RSS', url: 'https://www.aljazeera.com/xml/rss/all.xml', include: [/ukraine|ukrainian|russia|russian|putin|kremlin|kyiv|moscow/i] }
    ]
  },
  {
    id: 'iran',
    name: 'Iran',
    label: 'Regionen håller andan igen',
    description: 'Iran, säkerhetsläget och maktspel som sällan blir mindre riskfyllt.',
    feeds: [
      { label: 'The Guardian: Iran', url: 'https://www.theguardian.com/world/iran/rss', include: [/iran|iranian|tehran|khamenei|revolutionary guard|irgc|nuclear|uranium|missile|isfahan|fordow/i] },
      { label: 'BBC News: Middle East', url: 'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml', include: [/iran|iranian|tehran|khamenei|revolutionary guard|irgc|nuclear|uranium|missile|fordow/i] },
      { label: 'Al Jazeera RSS', url: 'https://www.aljazeera.com/xml/rss/all.xml', include: [/iran|iranian|tehran|khamenei|revolutionary guard|irgc|nuclear|uranium|missile|fordow/i] },
      { label: 'DW: All', url: 'https://rss.dw.com/rdf/rss-en-all', include: [/iran|iranian|tehran|khamenei|revolutionary guard|irgc|nuclear|uranium|missile|fordow/i] }
    ]
  },
  {
    id: 'orban-eu',
    name: 'Orbán / EU',
    label: 'Illiberal administration, kontinentalt tålamodstest',
    description: 'Ungern, EU-bråk, veto-spel och Orbáns ständiga närvaro i marginalnoterna.',
    feeds: [
      { label: 'The Guardian: Hungary', url: 'https://www.theguardian.com/world/hungary/rss', include: [/orban|orbán|hungary|hungarian|budapest/i], headlineOnly: true },
      { label: 'Politico Europe', url: 'https://www.politico.eu/feed/', include: [/orban|orbán|hungary|hungarian|budapest/i], headlineOnly: true },
      { label: 'DW: EU', url: 'https://rss.dw.com/rdf/rss-en-eu', include: [/orban|orbán|hungary|hungarian|budapest/i], headlineOnly: true },
      { label: 'BBC News: Europe', url: 'https://feeds.bbci.co.uk/news/world/europe/rss.xml', include: [/orban|orbán|hungary|hungarian|budapest/i], headlineOnly: true }
    ]
  }
];

const ITEMS_PER_SECTION = 5;
const FEED_ITEMS_PER_SOURCE = 16;
const ARTICLE_TEXT_CHAR_LIMIT = 6000;
const MIN_ARTICLE_TEXT_FOR_REAL_SUMMARY = 260;
const MAX_PUBLIC_SUMMARY_LENGTH = 360;

const fetchText = async (url, options = {}) => {
  const response = await fetch(url, {
    redirect: 'follow',
    ...options,
    headers: {
      'user-agent': 'vad-i-helvete-hander-bot/3.0 (+https://github.com/Henchibench/orange-horizon)',
      'accept-language': 'en-US,en;q=0.9,sv-SE;q=0.8,sv;q=0.7',
      ...(options.headers || {})
    }
  });

  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  return response.text();
};

const decode = (text = '') => text
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&#x27;/gi, "'")
  .replace(/&#x2F;/gi, '/')
  .replace(/&#x([\da-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(parseInt(value, 10)))
  .trim();

const stripTags = (text = '') => decode(
  decode(text)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, ' • ')
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1')
    .replace(/<font\b[^>]*>([\s\S]*?)<\/font>/gi, ' $1 ')
    .replace(/<[^>]+>/g, ' ')
).replace(/\s+/g, ' ').trim();

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const toTimestamp = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};
const unique = (values) => [...new Set(values.filter(Boolean))];
const normalizeWhitespace = (value = '') => value.replace(/\s+/g, ' ').trim();
const firstMatch = (text, regexes) => { for (const regex of regexes) { const match = text.match(regex); if (match?.[1]) return match[1]; } return ''; };

const splitHeadlineAndSource = (rawTitle, explicitSource = '') => {
  const parts = rawTitle.split(/\s+-\s+(?=[^-]+$)/);
  if (parts.length >= 2) {
    const source = parts.pop();
    return { headline: parts.join(' - ').trim(), source: explicitSource || source?.trim() || 'Okänd källa' };
  }
  return { headline: rawTitle.trim(), source: explicitSource || 'Okänd källa' };
};

const stripBoilerplate = (html = '') => html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
  .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
  .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
  .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, ' ')
  .replace(/<!--([\s\S]*?)-->/g, ' ');

const extractMetaContent = (html, key, attr = 'name') => {
  const match = html.match(new RegExp(`<meta[^>]+${attr}=["']${escapeRegExp(key)}["'][^>]+content=["']([\s\S]*?)["'][^>]*>`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([\s\S]*?)["'][^>]+${attr}=["']${escapeRegExp(key)}["'][^>]*>`, 'i'));
  return match ? stripTags(match[1]) : '';
};

const textDensityScore = (block) => {
  const text = stripTags(block);
  const paragraphs = (block.match(/<p\b/gi) || []).length;
  const sentences = (text.match(/[.!?]\s/g) || []).length;
  return text.length + paragraphs * 280 + sentences * 40;
};

const extractReadableText = (html) => {
  const cleaned = stripBoilerplate(html);
  const prioritizedBlocks = [
    ...cleaned.matchAll(/<(article|main|section|div)[^>]*(?:id|class)=["'][^"']*(article|story|content|main|post|entry|body|article-body|story-body|article-content)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi)
  ].map((match) => match[3]);

  const candidateBlocks = prioritizedBlocks.length
    ? prioritizedBlocks
    : [...cleaned.matchAll(/<(article|main)[^>]*>([\s\S]*?)<\/\1>/gi)].map((match) => match[2]);

  const bestBlock = [...candidateBlocks].sort((a, b) => textDensityScore(b) - textDensityScore(a))[0] || cleaned;
  const paragraphTexts = unique(
    [...bestBlock.matchAll(/<(p|h2|h3|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi)]
      .map((match) => stripTags(match[2]))
      .map((text) => text.replace(/\s+/g, ' ').trim())
      .filter((text) => text.length >= 50)
      .filter((text) => !/^(sign up|read more|listen to|watch:|related:|advertisement|newsletter|view image)/i.test(text))
  );

  return (paragraphTexts.length ? paragraphTexts.join('\n\n') : stripTags(bestBlock)).replace(/\n{3,}/g, '\n\n').slice(0, ARTICLE_TEXT_CHAR_LIMIT).trim();
};

const cleanFeedSummary = (description, headline, source) => {
  const cleaned = stripTags(description)
    .replace(new RegExp(`\\b${escapeRegExp(source)}\\b`, 'gi'), ' ')
    .replace(new RegExp(`\\b${escapeRegExp(headline)}\\b`, 'gi'), ' ')
    .replace(/^(updated?|published|source):\s*/i, '')
    .replace(/continue reading\.{0,3}$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';
  if (/^(read more|click here|listen to|watch|photo|video)/i.test(cleaned)) return '';
  if (cleaned.length < 70) return '';
  return cleaned;
};

const summarizeFromArticleText = (articleText) => {
  const pieces = normalizeWhitespace(articleText)
    .split(/(?<=[.!?])\s+(?=[A-ZÅÄÖ0-9"'])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 55)
    .filter((sentence) => !/^(sign up|read more|listen to|watch|related|advertisement|newsletter|view image)/i.test(sentence));

  return pieces.slice(0, 3).join(' ').trim();
};

const uniqueBy = (items, keyFn) => {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
};

const negativePatterns = [/opinion/i, /analysis/i, /newsletter/i, /live updates?/i, /what to know/i, /explained/i, /qa\b/i, /podcast/i, /video/i, /photos?/i, /editorial/i, /press release/i, /at a glance/i, /commentisfree/i, /show key events only/i];

const scoreArticle = (sectionId, item) => {
  const corpus = `${item.headline} ${item.feedSummary || ''} ${item.articleText || ''}`.toLowerCase();
  let score = 0;
  const add = (pattern, points) => { if (pattern.test(corpus)) score += points; };
  const penalize = (pattern, points) => { if (pattern.test(corpus)) score -= points; };

  if (sectionId === 'trump-usa') {
    add(/trump|white house|congress|federal|supreme court|pentagon|immigration|tariff|deport|justice department|campaign/, 8);
    add(/lawsuit|veto|ban|purge|retaliat|military|budget|detain|firing|cuts?|election/, 10);
    penalize(/sports|culture|celebrity|weather/, 8);
  }
  if (sectionId === 'putin-ukraina') {
    add(/putin|kremlin|russia|ukraine|drone|missile|occupation|civilian|attack|offensive|sanction|war crime/, 10);
    add(/killed|wounded|strike|escalat|front|repression|ceasefire|prison/, 10);
    penalize(/history|essay|opinion/, 8);
  }
  if (sectionId === 'iran') {
    add(/iran|tehran|revolutionary guard|nuclear|missile|proxy|regime|fordow|uranium|strike|protest/, 10);
    add(/killed|seize|attack|military|sanction|escalat|war/, 8);
    penalize(/opinion|history|explained/, 10);
  }
  if (sectionId === 'orban-eu') {
    add(/orban|orbán|hungary|brussels|eu|veto|russia|election|rule of law|commission/, 10);
    add(/block|sanction|spy|assassination|authoritarian|corrupt|funds|aid|ukraine/, 10);
    penalize(/opinion|preview|newsletter/, 10);
  }

  for (const pattern of negativePatterns) penalize(pattern, 9);
  if (/commentisfree|\/opinion\//i.test(item.link || '')) score -= 14;
  if (sectionId === 'iran' && !/iran|tehran|khamenei|irgc|iranian|isfahan|fordow/.test(corpus)) score -= 18;
  if (sectionId === 'trump-usa' && !/trump|donald trump|white house/.test(corpus)) score -= 10;
  if (item.extractionStatus === 'ok') score += 8;
  if ((item.articleText || '').length > 1000) score += 4;
  if ((item.articleText || '').length < 180) score -= 4;
  if (/bbc|the guardian|politico europe|dw|al jazeera/i.test(item.source)) score += 2;
  return score;
};

const buildSectionSnapshot = (section) => ({
  id: section.id,
  name: section.name,
  label: section.label,
  description: section.description,
  itemCount: section.items.length,
  items: section.items.map((item) => ({
    id: item.id,
    headline: item.headline,
    source: item.source,
    pubDate: item.pubDate,
    actualUrl: item.actualUrl,
    extractionStatus: item.extractionStatus,
    feedSummary: item.feedSummary,
    articleSummary: item.articleSummary,
    articleText: (item.articleText || '').slice(0, 2200)
  }))
});

const readErrorBody = async (response) => {
  const text = (await response.text()).trim();
  return text ? text.slice(0, 500) : 'empty response body';
};

const extractJsonText = (text) => {
  const trimmed = `${text}`.trim();
  if (!trimmed) throw new Error('Anthropic returned empty text payload');
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch) return fencedMatch[1].trim();
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) return trimmed.slice(firstBrace, lastBrace + 1).trim();
  return trimmed;
};

const listAnthropicModels = async () => {
  const response = await fetch(`${anthropicEndpoint}/models`, {
    headers: { 'x-api-key': anthropicApiKey, 'anthropic-version': '2023-06-01' }
  });
  if (!response.ok) throw new Error(`Anthropic models API error: ${response.status} ${response.statusText} - ${await readErrorBody(response)}`);
  const data = await response.json();
  return Array.isArray(data?.data) ? data.data.map((model) => `${model.id || ''}`.trim()).filter(Boolean) : [];
};

const rankAnthropicModel = (modelId) => (/haiku-4-5/.test(modelId) ? 500 : /haiku/.test(modelId) ? 400 : /sonnet/.test(modelId) ? 300 : /opus/.test(modelId) ? 200 : 100);
const chooseAnthropicModel = (availableModels) => {
  for (const preferred of anthropicPreferredModels) if (availableModels.includes(preferred)) return preferred;
  return [...availableModels].sort((a, b) => rankAnthropicModel(b) - rankAnthropicModel(a) || a.localeCompare(b))[0] || null;
};

const buildAnthropicPrompt = (sectionData) => JSON.stringify({
  task: 'Skriv publiceringsklar svensk startsidestext för sajten "Vad i helvete händer?!". Alla brief-bullets, sektionssammanfattningar och artikelbeskrivningar måste vara idiomatisk svenska utan engelska ord, halvöversättningar, meta-kommentarer eller AI-prat. Var konkret: nämn aktörer, åtgärder, följder och konfliktlinjer. Inga ellipser. Ingen utfyllnad. Du måste fylla varje section-id och item-id exakt en gång; lämna inget tomt och hoppa inte över någon post.',
  rules: {
    language: 'svenska',
    tone: 'torr, ren, redaktionell, saklig med lätt ironi',
    preserveFacts: true,
    noFabrication: true,
    noEnglishLeakage: true,
    noMetaCopy: true,
    noEllipsis: true,
    briefBulletsCount: 3,
    briefBulletMinChars: 70,
    briefBulletMaxChars: 200,
    sectionSummaryMinChars: 110,
    sectionSummaryMaxChars: 280,
    itemSummaryMinChars: 90,
    itemSummaryMaxChars: 320,
    briefIntroMinChars: 40,
    briefIntroTargetChars: 170,
    briefIntroMaxChars: 220,
    briefIntroStyle: '1-2 korta meningar, konkret öppning utan svepande scenbygge',
    leadWithWhatActuallyHappened: true,
    mentionActorsAndConsequences: true,
    useEveryProvidedIdExactlyOnce: true,
    noMissingSectionsOrItems: true
  },
  responseSchema: {
    brief: { title: 'string', intro: 'string', bullets: ['string', 'string', 'string'] },
    sections: [{ id: 'string', summary: 'string' }],
    items: [{ id: 'string', summary: 'string' }]
  },
  sections: sectionData.map(buildSectionSnapshot)
}, null, 2);

const callAnthropicApi = async ({ model, system, user, maxTokens = 2400, temperature = 0.15 }) => {
  const response = await fetch(`${anthropicEndpoint}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: 'user', content: user }]
    })
  });

  if (!response.ok) throw new Error(`Anthropic API error: ${response.status} ${response.statusText} - ${await readErrorBody(response)}`);
  const data = await response.json();
  const text = data?.content?.filter((block) => block.type === 'text').map((block) => block.text).join('\n').trim();
  if (!text) throw new Error('Anthropic returned no text content');
  return text;
};

const repairJsonWithAnthropic = async (model, rawText) => {
  const repaired = await callAnthropicApi({
    model,
    maxTokens: 2600,
    temperature: 0,
    system: 'Du reparerar JSON. Returnera enbart giltig JSON utan markdown, kommentarer eller förklaringar. Ändra inte sakuppgifter i onödan.',
    user: `Gör följande text till giltig JSON med exakt samma struktur och innehåll så långt det går:\n\n${rawText}`
  });
  return JSON.parse(extractJsonText(repaired));
};

const parseAnthropicJson = async (model, text) => {
  try {
    return JSON.parse(extractJsonText(text));
  } catch (parseError) {
    return repairJsonWithAnthropic(model, text);
  }
};

const callAnthropicSummaries = async (sectionData) => {
  if (!anthropicApiKey) throw new Error('missing-api-key');
  const availableModels = await listAnthropicModels();
  const model = chooseAnthropicModel(availableModels);
  if (!model) throw new Error('Anthropic models API returned no usable models');

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const text = await callAnthropicApi({
        model,
        maxTokens: 2400,
        temperature: 0,
        system: 'Du skriver svensk publiceringstext för en offentlig nyhetssajt. Returnera enbart giltig JSON. All offentlig summary-text måste vara ren svenska utan engelska glosor, översättningsrester, AI-förklaringar eller ellipser. Fyll varje angivet section-id och item-id exakt en gång.',
        user: buildAnthropicPrompt(sectionData)
      });

      const parsed = await parseAnthropicJson(model, text);
      return { ok: true, data: parsed, model };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Anthropic summary generation failed');
};

const fillMissingSummaries = async (model, sectionData, aiPayload) => {
  const missingSections = sectionData
    .filter((section) => !cleanPublicText(aiPayload?.sections?.find((candidate) => candidate?.id === section.id)?.summary || ''))
    .map((section) => ({ id: section.id, name: section.name, label: section.label, description: section.description, items: section.items.map((item) => ({ id: item.id, headline: item.headline, source: item.source, feedSummary: item.feedSummary, articleSummary: item.articleSummary, articleText: (item.articleText || '').slice(0, 1400) })) }));

  const missingItems = sectionData.flatMap((section) => section.items
    .filter((item) => !cleanPublicText(aiPayload?.items?.find((candidate) => candidate?.id === item.id)?.summary || ''))
    .map((item) => ({ id: item.id, sectionId: section.id, sectionName: section.name, headline: item.headline, source: item.source, feedSummary: item.feedSummary, articleSummary: item.articleSummary, articleText: (item.articleText || '').slice(0, 1400) })));

  if (!missingSections.length && !missingItems.length) return aiPayload;

  const repairPrompt = JSON.stringify({
    task: 'Fyll endast saknade svenska sammanfattningar. Returnera enbart giltig JSON. Skriv en summary för varje angivet id exakt en gång. Lämna inget tomt.',
    rules: {
      language: 'svenska',
      sectionSummaryMinChars: 110,
      sectionSummaryMaxChars: 280,
      itemSummaryMinChars: 90,
      itemSummaryMaxChars: 320,
      noEnglishLeakage: true,
      noMetaCopy: true,
      noEllipsis: true
    },
    responseSchema: {
      sections: [{ id: 'string', summary: 'string' }],
      items: [{ id: 'string', summary: 'string' }]
    },
    missingSections,
    missingItems
  }, null, 2);

  let repaired = null;
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const text = await callAnthropicApi({
        model,
        maxTokens: 1800,
        temperature: 0,
        system: 'Du kompletterar saknade svenska sammanfattningar för en offentlig nyhetssajt. Returnera enbart giltig JSON. Fyll varje angivet id exakt en gång.',
        user: repairPrompt
      });

      repaired = await parseAnthropicJson(model, text);
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!repaired) throw lastError || new Error('Missing-summary repair failed');

  const sectionMap = new Map((aiPayload?.sections || []).map((section) => [section.id, section]));
  for (const section of repaired?.sections || []) if (section?.id) sectionMap.set(section.id, section);
  const itemMap = new Map((aiPayload?.items || []).map((item) => [item.id, item]));
  for (const item of repaired?.items || []) if (item?.id) itemMap.set(item.id, item);

  return {
    ...aiPayload,
    sections: [...sectionMap.values()],
    items: [...itemMap.values()]
  };
};

const englishLeakPatterns = [
  /\bthe\b/i, /\band\b/i, /\bwith\b/i, /\bafter\b/i, /\bbefore\b/i, /\bwhat\b/i, /\bwhy\b/i,
  /\bongoing\b/i, /\bbreaking\b/i, /\bheadline\b/i, /\bsummary\b/i, /\bstory\b/i, /\bupdate\b/i,
  /\barticle\b/i, /\bwar briefing\b/i, /\bAt a glance\b/i, /\bcontinue reading\b/i,
  /\bUS-Israel\b/i, /\bUnited States\b/i, /\bforced injection\b/i
];

const bannedMetaPatterns = [/\bai\b/i, /modell/i, /pipeline/i, /feed/i, /rss/i, /sammanfattningen bygger/i, /översatt av/i, /genererad/i, /meta/i, /tool/i];

const cleanPublicText = (value = '') => normalizeWhitespace(stripTags(value))
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'")
  .replace(/\s+([,.;:!?])/g, '$1')
  .replace(/\.{3,}|…/g, '.')
  .trim();

const squeezeToSentenceLimit = (value, max) => {
  if (value.length <= max) return value;
  const sentences = value.match(/[^.!?]+[.!?]/g)?.map((part) => normalizeWhitespace(part)).filter(Boolean) || [];
  if (sentences.length) {
    let candidate = '';
    for (const sentence of sentences) {
      const next = candidate ? `${candidate} ${sentence}` : sentence;
      if (next.length > max) break;
      candidate = next;
    }
    if (candidate) return candidate;
  }

  const trimmed = value.slice(0, max).replace(/[,:;\-–—]\s*$/u, '').trim();
  const lastSpace = trimmed.lastIndexOf(' ');
  const compact = (lastSpace >= 40 ? trimmed.slice(0, lastSpace) : trimmed).trim().replace(/[,:;\-–—]$/u, '');
  return `${compact}.`;
};

const normalizePublicLength = (value, max, { stripLeadIn = false } = {}) => {
  const cleaned = cleanPublicText(value);
  const prepared = stripLeadIn
    ? cleaned.replace(/^(kort sagt|kort version|i korthet|det korta läget|läget just nu)[:,-]?\s*/i, '')
    : cleaned;

  if (!prepared || prepared.length <= max) return prepared;
  const sentenceLimited = squeezeToSentenceLimit(prepared, max);
  if (sentenceLimited.length <= max) return sentenceLimited;
  return squeezeToSentenceLimit(prepared, Math.max(40, max - 20));
};

const normalizeBriefIntro = (value) => normalizePublicLength(value, 220, { stripLeadIn: true });

const looksSwedishEnough = (text) => {
  const lower = text.toLowerCase();
  const swedishSignals = [' och ', ' att ', ' som ', ' för ', ' med ', ' till ', ' efter ', ' mot ', ' från ', ' över ', ' under ', ' enligt ', ' mellan ', ' i ', ' på '];
  return swedishSignals.filter((word) => lower.includes(word)).length >= 2 || /[åäö]/i.test(text);
};

const validatePublicText = (text, label, { min = 40, max = MAX_PUBLIC_SUMMARY_LENGTH } = {}) => {
  const value = cleanPublicText(text);
  if (!value) throw new Error(`${label}: empty`);
  if (value.length < min) throw new Error(`${label}: too-short`);
  if (value.length > max) throw new Error(`${label}: too-long`);
  if (!/[.!?]$/.test(value)) throw new Error(`${label}: no-terminal-punctuation`);
  if (/[:]\s*$/.test(value)) throw new Error(`${label}: dangling-colon`);
  if (/\b(källa|source)\s*:/i.test(value)) throw new Error(`${label}: source-label-leak`);
  if (englishLeakPatterns.some((pattern) => pattern.test(value))) throw new Error(`${label}: english-leak`);
  if (bannedMetaPatterns.some((pattern) => pattern.test(value))) throw new Error(`${label}: meta-leak`);
  if (!looksSwedishEnough(` ${value} `)) throw new Error(`${label}: not-swedish-enough`);
  return value;
};

const mergeSummariesStrict = (sectionData, aiPayload) => {
  const aiSections = new Map((aiPayload?.sections || []).map((section) => [section.id, section.summary]));
  const aiItems = new Map((aiPayload?.items || []).map((item) => [item.id, item.summary]));

  const brief = {
    title: validatePublicText(aiPayload?.brief?.title, 'brief.title', { min: 10, max: 56 }),
    intro: validatePublicText(normalizeBriefIntro(aiPayload?.brief?.intro), 'brief.intro', { min: 40, max: 220 }),
    bullets: (aiPayload?.brief?.bullets || []).slice(0, 3).map((bullet, index) => validatePublicText(normalizePublicLength(bullet, 200), `brief.bullets[${index}]`, { min: 70, max: 200 }))
  };

  if (brief.bullets.length !== 3) throw new Error('brief.bullets: wrong-count');

  const sectionsWithSummaries = sectionData.map((section) => ({
    ...section,
    summary: validatePublicText(normalizePublicLength(aiSections.get(section.id), 280), `section.${section.id}.summary`, { min: 110, max: 280 }),
    items: section.items.map((item) => ({
      ...item,
      description: validatePublicText(normalizePublicLength(aiItems.get(item.id), 320), `item.${item.id}.summary`, { min: 90, max: 320 })
    }))
  }));

  return { brief, sections: sectionsWithSummaries };
};

const buildUnavailablePayload = (reason, baseSections = []) => ({
  state: 'unavailable',
  site: {
    title: 'Vad i helvete händer?!',
    subtitle: 'Tillfälligt otillgänglig.',
    note: null
  },
  generatedAt: new Date().toISOString(),
  summaryMeta: {
    provider: 'none',
    model: null,
    fallbackReason: reason
  },
  brief: null,
  sections: [],
  sources: baseSections.map(({ id, name, sourceLabel, feedUrls }) => ({ id, name, sourceLabel, feedUrls }))
});

const fetchArticleDetails = async (item) => {
  try {
    const html = await fetchText(item.link);
    const articleText = extractReadableText(html);
    const metaDescription = extractMetaContent(html, 'description') || extractMetaContent(html, 'og:description', 'property');
    const articleSummary = summarizeFromArticleText(articleText);
    const feedSummary = cleanFeedSummary(item.rawDescription, item.headline, item.source);
    const metaSummary = cleanFeedSummary(metaDescription, item.headline, item.source);
    const extractionStatus = articleText.length >= MIN_ARTICLE_TEXT_FOR_REAL_SUMMARY ? 'ok' : (articleText.length >= 120 || metaSummary ? 'partial' : 'failed');

    return {
      ...item,
      actualUrl: item.link,
      articleText,
      articleSummary,
      feedSummary,
      metaSummary,
      extractionStatus,
      extractionNote: articleSummary ? 'article-text' : (feedSummary ? 'feed-description' : (metaSummary ? 'meta-description' : 'headline-only'))
    };
  } catch (error) {
    const feedSummary = cleanFeedSummary(item.rawDescription, item.headline, item.source);
    return {
      ...item,
      actualUrl: item.link,
      articleText: '',
      articleSummary: '',
      feedSummary,
      metaSummary: '',
      extractionStatus: feedSummary ? 'partial' : 'failed',
      extractionNote: error.message
    };
  }
};

const parseFeedItems = (section, feed, xml) => [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)]
  .slice(0, FEED_ITEMS_PER_SOURCE)
  .map((match, index) => {
    const itemXml = match[1];
    const title = decode(firstMatch(itemXml, [/<title>([\s\S]*?)<\/title>/i]));
    const link = decode(firstMatch(itemXml, [/<link>([\s\S]*?)<\/link>/i, /rdf:about=["']([^"']+)["']/i]));
    const sourceFromTag = stripTags(firstMatch(itemXml, [/<source[^>]*>([\s\S]*?)<\/source>/i, /<dc:creator>([\s\S]*?)<\/dc:creator>/i]));
    const { headline, source } = splitHeadlineAndSource(title, sourceFromTag || feed.label);
    const rawDescription = firstMatch(itemXml, [/<description>([\s\S]*?)<\/description>/i, /<content:encoded>([\s\S]*?)<\/content:encoded>/i]);
    const pubDate = decode(firstMatch(itemXml, [/<pubDate>([\s\S]*?)<\/pubDate>/i, /<dc:date>([\s\S]*?)<\/dc:date>/i, /<published>([\s\S]*?)<\/published>/i]));
    const haystack = `${headline} ${stripTags(rawDescription)}`;
    const includeCorpus = feed.headlineOnly ? headline : haystack;
    const includeMatch = !feed.include?.length || feed.include.some((pattern) => pattern.test(includeCorpus));
    const excludeMatch = feed.exclude?.some((pattern) => pattern.test(haystack));

    return includeMatch && !excludeMatch ? {
      id: `${section.id}-${feed.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index + 1}`,
      sectionId: section.id,
      sectionName: section.name,
      headline,
      source,
      link,
      actualUrl: null,
      pubDate,
      rawDescription,
      articleText: '',
      articleSummary: '',
      feedSummary: '',
      metaSummary: '',
      extractionStatus: 'pending',
      extractionNote: null,
      feedLabel: feed.label,
      feedUrl: feed.url,
      relevanceScore: 0
    } : null;
  })
  .filter((item) => item && item.headline && item.link);

const rawSectionData = await Promise.all(sections.map(async (section) => {
  const feedGroups = await Promise.all(section.feeds.map(async (feed) => ({ feed, xml: await fetchText(feed.url) })));
  const parsedItems = feedGroups.flatMap(({ feed, xml }) => parseFeedItems(section, feed, xml));
  const dedupedItems = uniqueBy(parsedItems, (item) => {
    try {
      const url = new URL(item.link);
      url.hash = '';
      return `${normalizeWhitespace(item.headline).toLowerCase()}::${url.origin}${url.pathname}`;
    } catch {
      return `${normalizeWhitespace(item.headline).toLowerCase()}::${item.link}`;
    }
  });

  const enrichedItems = await Promise.all(dedupedItems.map(fetchArticleDetails));
  const selectedItems = enrichedItems
    .map((item) => ({ ...item, relevanceScore: scoreArticle(section.id, item) }))
    .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0) || toTimestamp(b.pubDate) - toTimestamp(a.pubDate))
    .slice(0, ITEMS_PER_SECTION);

  return {
    ...section,
    sourceLabel: unique(section.feeds.map((feed) => feed.label)).join(' • '),
    feedUrl: section.feeds[0]?.url || '',
    feedUrls: section.feeds.map((feed) => ({ label: feed.label, url: feed.url })),
    items: selectedItems
  };
}));

let payload;
try {
  const aiResult = await callAnthropicSummaries(rawSectionData);
  const completedPayload = await fillMissingSummaries(aiResult.model, rawSectionData, aiResult.data);
  const merged = mergeSummariesStrict(rawSectionData, completedPayload);
  payload = {
    state: 'ready',
    site: {
      title: 'Vad i helvete händer?!',
      subtitle: 'En svensk morgonbrief om världsläget, uppdaterad ungefär varje timme.',
      note: null
    },
    generatedAt: new Date().toISOString(),
    summaryMeta: {
      provider: 'anthropic',
      model: aiResult.model,
      fallbackReason: null
    },
    brief: merged.brief,
    sections: merged.sections,
    sources: merged.sections.map(({ id, name, sourceLabel, feedUrls }) => ({ id, name, sourceLabel, feedUrls }))
  };
} catch (error) {
  console.warn(`Publication state switched to unavailable: ${error.message}`);
  payload = buildUnavailablePayload(error.message, rawSectionData);
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${payload.state} payload to ${outputPath}${payload.summaryMeta?.model ? ` using ${payload.summaryMeta.model}` : ''}`);
