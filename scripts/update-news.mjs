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
    description: 'Amerikansk politik som morgonradio från en bil med trasiga bromsar.',
    sourceLabel: 'Google News RSS: Trump / USA',
    feedUrl: 'https://news.google.com/rss/search?q=%28Trump+OR+%22Donald+Trump%22+OR+White+House%29+%28USA+OR+Congress+OR+federal%29+when:7d&hl=en-US&gl=US&ceid=US:en'
  },
  {
    id: 'putin-ukraina',
    name: 'Putin / Ukraina',
    label: 'Krig, repression, diplomatiskt grus',
    description: 'Frontlinjer, Kreml-signaler och ännu en dag där ordet stabilitet mest känns teoretiskt.',
    sourceLabel: 'Google News RSS: Putin / Ukraina',
    feedUrl: 'https://news.google.com/rss/search?q=%28Putin+OR+Kremlin+OR+Russia%29+%28Ukraine+OR+Ukrainian%29+when:7d&hl=en-US&gl=US&ceid=US:en'
  },
  {
    id: 'iran',
    name: 'Iran',
    label: 'Regionen håller andan igen',
    description: 'Iransk maktpolitik, säkerhetsläget och det eviga frågetecknet kring vad som eskalerar härnäst.',
    sourceLabel: 'Google News RSS: Iran',
    feedUrl: 'https://news.google.com/rss/search?q=Iran+%28regime+OR+Tehran+OR+nuclear+OR+military+OR+protests%29+when:7d&hl=en-US&gl=US&ceid=US:en'
  },
  {
    id: 'orban-eu',
    name: 'Orbán / EU',
    label: 'Illiberal administration, kontinentalt tålamodstest',
    description: 'Ungern, EU-bråk, veto-hintar och den där ständiga frågan om hur mycket institutioner faktiskt tål.',
    sourceLabel: 'Google News RSS: Orbán / EU',
    feedUrl: 'https://news.google.com/rss/search?q=%28Orban+OR+Orb%C3%A1n+OR+Hungary%29+%28EU+OR+Europe+OR+Brussels%29+when:14d&hl=en-US&gl=US&ceid=US:en'
  }
];

const ITEMS_PER_SECTION = 5;
const RSS_CANDIDATES_PER_SECTION = 12;
const ARTICLE_TEXT_CHAR_LIMIT = 5000;

const fetchText = async (url, options = {}) => {
  const response = await fetch(url, {
    redirect: 'follow',
    ...options,
    headers: {
      'user-agent': 'vad-i-helvete-hander-bot/1.1 (+https://github.com/Henchibench/orange-horizon)',
      'accept-language': 'en-US,en;q=0.9,sv-SE;q=0.8,sv;q=0.7',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

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
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1')
    .replace(/<font\b[^>]*>([\s\S]*?)<\/font>/gi, ' $1 ')
    .replace(/<[^>]+>/g, ' ')
)
  .replace(/\s+/g, ' ')
  .trim();

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const clampText = (value = '', max = 280) => value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
const toTimestamp = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};
const unique = (values) => [...new Set(values.filter(Boolean))];

const splitHeadlineAndSource = (rawTitle) => {
  const parts = rawTitle.split(/\s+-\s+(?=[^-]+$)/);
  if (parts.length >= 2) {
    const source = parts.pop();
    return {
      headline: parts.join(' - ').trim(),
      source: source?.trim() || 'Okänd källa'
    };
  }

  return {
    headline: rawTitle.trim(),
    source: 'Okänd källa'
  };
};

const tidyDescription = (description, headline, source) => {
  const cleaned = stripTags(description)
    .replace(new RegExp(`\\b${escapeRegExp(source)}\\b`, 'gi'), ' ')
    .replace(new RegExp(`\\b${escapeRegExp(headline)}\\b`, 'gi'), ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length >= 40) return cleaned;
  return 'Rubriken räcker tyvärr långt. Själva storyn lär som vanligt vara mer deprimerande i detalj.';
};

const decodeGoogleNewsUrl = async (sourceUrl) => {
  try {
    const url = new URL(sourceUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.hostname !== 'news.google.com' || parts.at(-2) !== 'articles') {
      return sourceUrl;
    }

    const encoded = parts.at(-1);
    if (!encoded) return sourceUrl;
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    let binary = Buffer.from(normalized, 'base64').toString('binary');
    const prefix = Buffer.from([0x08, 0x13, 0x22]).toString('binary');
    const suffix = Buffer.from([0xd2, 0x01, 0x00]).toString('binary');

    if (binary.startsWith(prefix)) binary = binary.slice(prefix.length);
    if (binary.endsWith(suffix)) binary = binary.slice(0, -suffix.length);

    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const len = bytes[0] >= 0x80 ? bytes[1] + ((bytes[0] & 0x7f) << 7) : bytes[0];
    let decodedPayload = binary.slice(bytes[0] >= 0x80 ? 2 : 1, (bytes[0] >= 0x80 ? 2 : 1) + len);

    if (decodedPayload.startsWith('AU_yqL')) {
      const s = `[[[\"Fbv4je\",\"[\\\"garturlreq\\\",[[\\\"en-US\\\",\\\"US\\\",[\\\"FINANCE_TOP_INDICES\\\",\\\"WEB_TEST_1_0_0\\\"],null,null,1,1,\\\"US:en\\\",null,180,null,null,null,null,null,0,null,null,[1608992183,723341000]],\\\"en-US\\\",\\\"US\\\",1,[2,3,4,8],1,0,\\\"655000234\\\",0,0,null,0],\\\"${encoded}\\\"]\",null,\"generic\"]]]`;
      const responseText = await fetchText('https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded;charset=utf-8',
          referer: 'https://news.google.com/'
        },
        body: `f.req=${encodeURIComponent(s)}`
      });

      const header = '[\\"garturlres\\",\\"';
      const footer = '\\",';
      if (responseText.includes(header)) {
        const start = responseText.slice(responseText.indexOf(header) + header.length);
        if (start.includes(footer)) {
          return start.slice(0, start.indexOf(footer));
        }
      }
    }

    if (/^https?:\/\//i.test(decodedPayload)) {
      return decodedPayload;
    }
  } catch {
    // ignore and fall back
  }

  return sourceUrl;
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
  return match ? decode(match[1]) : '';
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
    ...cleaned.matchAll(/<(article|main|section|div)[^>]*(?:id|class)=["'][^"']*(article|story|content|main|post|entry|body|article-body|story-body)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi)
  ].map((match) => match[3]);

  const candidateBlocks = prioritizedBlocks.length
    ? prioritizedBlocks
    : [...cleaned.matchAll(/<(article|main)[^>]*>([\s\S]*?)<\/\1>/gi)].map((match) => match[2]);

  const bestBlock = [...candidateBlocks]
    .sort((a, b) => textDensityScore(b) - textDensityScore(a))[0] || cleaned;

  const paragraphTexts = unique(
    [...bestBlock.matchAll(/<(p|h2|h3|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi)]
      .map((match) => stripTags(match[2]))
      .map((text) => text.replace(/\s+/g, ' ').trim())
      .filter((text) => text.length >= 40)
  );

  const text = (paragraphTexts.length ? paragraphTexts.join('\n\n') : stripTags(bestBlock))
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return clampText(text, ARTICLE_TEXT_CHAR_LIMIT);
};

const decodeDdgRedirect = (value = '') => {
  try {
    const raw = value.startsWith('//') ? `https:${value}` : value;
    const url = new URL(raw);
    return decodeURIComponent(url.searchParams.get('uddg') || value);
  } catch {
    return value;
  }
};

const findArticleUrlViaSearch = async (item) => {
  if (!item.sourceUrl) return null;

  const sourceDomain = new URL(item.sourceUrl).hostname.replace(/^www\./, '');
  const query = encodeURIComponent(`site:${sourceDomain} "${item.headline}"`);
  const html = await fetchText(`https://duckduckgo.com/html/?q=${query}`);
  const matches = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"/g)]
    .map((match) => decodeDdgRedirect(decode(match[1])))
    .filter((candidate) => {
      try {
        const hostname = new URL(candidate).hostname.replace(/^www\./, '');
        return hostname === sourceDomain || hostname.endsWith(`.${sourceDomain}`);
      } catch {
        return false;
      }
    });

  return matches[0] || null;
};

const buildFallbackArticleSummary = (item) => {
  const base = item.articleText || item.description || item.headline;
  const cleaned = base.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return 'Originaltexten vägrade samarbeta, så här får rubriken göra grovjobbet.';
  }

  if (item.extractionStatus === 'ok' && cleaned.length > 120) {
    return clampText(cleaned, 220);
  }

  return clampText(
    item.description && item.description !== item.headline
      ? item.description
      : 'Originaltexten gick inte att få loss ordentligt, så vi får nöja oss med rubriken och anta att detaljerna är värre.',
    220
  );
};

const negativePatterns = [
  /opinion/i,
  /analysis/i,
  /newsletter/i,
  /live updates?/i,
  /what to know/i,
  /explained/i,
  /qa\b/i,
  /podcast/i,
  /video/i,
  /photos?/i,
  /editorial/i,
  /the conversation/i,
  /think tank/i,
  /committee/i,
  /center for/i,
  /department of/i,
  /white house \(.gov\)/i,
  /official/i,
  /press release/i
];

const scoreArticle = (sectionId, item) => {
  const corpus = `${item.headline} ${item.description} ${item.articleText || ''}`.toLowerCase();
  let score = 0;

  const add = (pattern, points) => {
    if (pattern.test(corpus)) score += points;
  };
  const penalize = (pattern, points) => {
    if (pattern.test(corpus)) score -= points;
  };

  if (sectionId === 'trump-usa') {
    add(/trump|white house|congress|federal|supreme court|pentagon|immigration|tariff|deport|authoritarian|justice department|campaign/, 8);
    add(/lawsuit|veto|ban|purge|retaliat|crackdown|military|budget|seize|detain|firing|cuts?/, 10);
    penalize(/japan|ceremony|visit|photo|sports|culture/, 8);
  }

  if (sectionId === 'putin-ukraina') {
    add(/putin|kremlin|russia|ukraine|drone|missile|bomb|occupation|civilian|attack|offensive|sanction|war crime/, 10);
    add(/killed|wounded|strike|escalat|front|prison|repression/, 10);
    penalize(/history|essay|after the war|long read/, 8);
  }

  if (sectionId === 'iran') {
    add(/iran|tehran|revolutionary guard|nuclear|missile|proxy|regime|fordow|uranium|strike|protest/, 10);
    add(/killed|seize|attack|military|sanction|escalat|war/, 8);
    penalize(/opinion|history|future|explained|should it/, 10);
  }

  if (sectionId === 'orban-eu') {
    add(/orban|orbán|hungary|brussels|eu|veto|ukraine loan|russia|leak|election|blackmail|disloyalty/, 10);
    add(/block|ransom|sanction|spy|assassination|authoritarian|corrupt/, 10);
    penalize(/expect .* win|conservative|opinion/, 10);
  }

  for (const pattern of negativePatterns) {
    penalize(pattern, 9);
  }

  if (item.extractionStatus === 'ok') score += 6;
  if (item.actualUrl && item.actualUrl !== item.link) score += 2;
  if ((item.articleText || '').length > 800) score += 4;
  if ((item.articleText || '').length < 180) score -= 4;
  if (/reuters|ap news|bbc|politico|washington post|new york times|pbs|al jazeera|dw\.com|atlantic council|cbs news/i.test(item.source)) score += 4;

  return score;
};

const summarizeSectionRuleBased = (section) => {
  const lead = section.items[0];
  const second = section.items[1];
  if (!lead) {
    return 'Tomt i flödet. Antingen lugn morgon eller bara internet som spelar död.';
  }

  const lines = [`Värst just nu: ${lead.headline}.`];
  if (lead.aiSummary || lead.fallbackSummary) lines.push(clampText(lead.aiSummary || lead.fallbackSummary, 140));
  if (second) lines.push(`Strax bakom: ${second.headline}.`);
  return lines.join(' ');
};

const buildBriefRuleBased = (sectionData) => {
  const allItems = sectionData.flatMap((section) => section.items).sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0) || toTimestamp(b.pubDate) - toTimestamp(a.pubDate));
  const freshest = [...allItems].sort((a, b) => toTimestamp(b.pubDate) - toTimestamp(a.pubDate))[0];
  const sharpest = allItems[0];
  const busiest = [...sectionData].sort((a, b) => b.items.length - a.items.length)[0];
  const freshestSection = freshest ? sectionData.find((section) => section.id === freshest.sectionId) : null;
  const sharpestSection = sharpest ? sectionData.find((section) => section.id === sharpest.sectionId) : null;

  return {
    title: 'Det viktigaste först.',
    intro: 'Fyra bevakningar. Mindre brus, mer faktiskt haveri.',
    bullets: [
      sharpest && sharpestSection ? `${sharpestSection.name}: ${sharpest.headline}.` : 'Inget vasst nog att peka ut, vilket känns osannolikt.',
      freshest && freshestSection ? `Färskast i högen: ${freshestSection.name} – ${freshest.headline}.` : 'Tidslinjen ser märkligt tom ut.',
      busiest ? `Mest användbart stök: ${busiest.name} med ${busiest.items.length} utvalda artiklar.` : 'Alla sektioner verkar märkligt lugna.'
    ]
  };
};

const buildAnthropicPrompt = (sectionData, fallbackBrief) => JSON.stringify({
  task: 'Skriv en kort svensk morgonbrief i torrt ironisk ton. Sammanfatta det faktiska artikelinnehållet när textutdrag finns. Om extraktionen saknas eller är tunn ska du uttryckligen luta dig på rubrik/metadata utan att hitta på detaljer.',
  rules: {
    language: 'svenska',
    tone: 'torr, lätt ironisk, nykter, redaktionell, inte flåshurtig',
    titleMaxChars: 48,
    introMaxChars: 90,
    briefBulletsCount: 3,
    bulletMaxChars: 120,
    sectionSummaryMaxChars: 170,
    itemSummaryMaxChars: 220,
    preserveFacts: true,
    noFabrication: true,
    mentionUncertaintyIfNeeded: true,
    avoidGenericAiPhrases: true,
    avoidSceneSetting: true,
    avoidPepTalk: true
  },
  responseSchema: {
    brief: {
      title: 'string',
      intro: 'string',
      bullets: ['string', 'string', 'string']
    },
    sections: [
      {
        id: 'string',
        summary: 'string'
      }
    ],
    items: [
      {
        id: 'string',
        summary: 'string'
      }
    ]
  },
  fallbackReference: fallbackBrief,
  sections: sectionData.map((section) => ({
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
      extractionNote: item.extractionNote,
      description: item.description,
      articleText: clampText(item.articleText || '', 1500)
    }))
  }))
}, null, 2);

const readErrorBody = async (response) => {
  const text = (await response.text()).trim();
  return text ? text.slice(0, 500) : 'empty response body';
};

const extractJsonText = (text) => {
  const trimmed = `${text}`.trim();
  if (!trimmed) {
    throw new Error('Anthropic returned empty text payload');
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch) return fencedMatch[1].trim();

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim();
  }

  return trimmed;
};

const listAnthropicModels = async () => {
  const response = await fetch(`${anthropicEndpoint}/models`, {
    headers: {
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01'
    }
  });

  if (!response.ok) {
    throw new Error(`Anthropic models API error: ${response.status} ${response.statusText} - ${await readErrorBody(response)}`);
  }

  const data = await response.json();
  return Array.isArray(data?.data)
    ? data.data.map((model) => `${model.id || ''}`.trim()).filter(Boolean)
    : [];
};

const rankAnthropicModel = (modelId) => {
  if (/haiku-4-5/.test(modelId)) return 500;
  if (/haiku/.test(modelId)) return 400;
  if (/sonnet/.test(modelId)) return 300;
  if (/opus/.test(modelId)) return 200;
  return 100;
};

const chooseAnthropicModel = (availableModels) => {
  for (const preferred of anthropicPreferredModels) {
    if (availableModels.includes(preferred)) return preferred;
  }

  return [...availableModels]
    .sort((a, b) => rankAnthropicModel(b) - rankAnthropicModel(a) || a.localeCompare(b))[0] || null;
};

const callAnthropicSummaries = async (sectionData, fallbackBrief) => {
  if (!anthropicApiKey) {
    return { ok: false, reason: 'missing-api-key' };
  }

  const availableModels = await listAnthropicModels();
  const model = chooseAnthropicModel(availableModels);
  if (!model) throw new Error('Anthropic models API returned no usable models');

  const response = await fetch(`${anthropicEndpoint}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 1600,
      temperature: 0.2,
      system: 'Du skriver för sajten "Vad i helvete händer?!". Skriv kort, torrt och redaktionellt. Sammanfatta artikeltext när den finns. Om den saknas, säg det indirekt och håll dig till rubrik/metadata. Returnera enbart giltig JSON utan markdown eller kommentarer.',
      messages: [
        {
          role: 'user',
          content: buildAnthropicPrompt(sectionData, fallbackBrief)
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status} ${response.statusText} - ${await readErrorBody(response)}`);
  }

  const data = await response.json();
  const text = data?.content?.filter((block) => block.type === 'text').map((block) => block.text).join('\n').trim();
  if (!text) throw new Error('Anthropic returned no text content');
  return { ok: true, data: JSON.parse(extractJsonText(text)), model, availableModels };
};

const mergeSummaries = (sectionData, fallbackBrief, aiPayload) => {
  const aiSections = new Map((aiPayload?.sections || []).map((section) => [section.id, section.summary]));
  const aiItems = new Map((aiPayload?.items || []).map((item) => [item.id, item.summary]));

  const brief = {
    title: typeof aiPayload?.brief?.title === 'string' && aiPayload.brief.title.trim() ? aiPayload.brief.title.trim() : fallbackBrief.title,
    intro: typeof aiPayload?.brief?.intro === 'string' && aiPayload.brief.intro.trim() ? aiPayload.brief.intro.trim() : fallbackBrief.intro,
    bullets: Array.isArray(aiPayload?.brief?.bullets)
      ? aiPayload.brief.bullets.map((bullet) => `${bullet}`.trim()).filter(Boolean).slice(0, 3)
      : fallbackBrief.bullets
  };

  if (brief.bullets.length !== 3) brief.bullets = fallbackBrief.bullets;

  const sectionsWithSummaries = sectionData.map((section) => ({
    ...section,
    summary: typeof aiSections.get(section.id) === 'string' && aiSections.get(section.id).trim()
      ? aiSections.get(section.id).trim()
      : section.summary,
    items: section.items.map((item) => ({
      ...item,
      aiSummary: typeof aiItems.get(item.id) === 'string' && aiItems.get(item.id).trim()
        ? aiItems.get(item.id).trim()
        : null,
      description: typeof aiItems.get(item.id) === 'string' && aiItems.get(item.id).trim()
        ? aiItems.get(item.id).trim()
        : item.description
    }))
  }));

  return { brief, sections: sectionsWithSummaries };
};

const fetchArticleDetails = async (item) => {
  try {
    const decodedUrl = await decodeGoogleNewsUrl(item.link);
    const actualUrl = decodedUrl.includes('news.google.com/') ? (await findArticleUrlViaSearch(item)) || decodedUrl : decodedUrl;
    const html = await fetchText(actualUrl);
    const articleText = extractReadableText(html);
    const extractionNote = actualUrl === decodedUrl
      ? (articleText.length >= 180 ? 'article-text' : 'thin-article-text')
      : (articleText.length >= 180 ? 'article-text-via-search' : 'thin-article-text-via-search');
    const metaDescription = extractMetaContent(html, 'description') || extractMetaContent(html, 'og:description', 'property');
    const extractionStatus = articleText.length >= 180 ? 'ok' : 'partial';

    return {
      ...item,
      actualUrl,
      articleText,
      extractionStatus,
      extractionNote,
      fallbackSummary: buildFallbackArticleSummary({ ...item, actualUrl, articleText, extractionStatus }),
      description: metaDescription ? clampText(metaDescription, 220) : buildFallbackArticleSummary({ ...item, actualUrl, articleText, extractionStatus })
    };
  } catch (error) {
    return {
      ...item,
      actualUrl: item.link,
      articleText: '',
      extractionStatus: 'failed',
      extractionNote: error.message,
      fallbackSummary: buildFallbackArticleSummary(item)
    };
  }
};

const parseFeedItems = (section, xml) => [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
  .slice(0, RSS_CANDIDATES_PER_SECTION)
  .map((match, index) => {
    const itemXml = match[1];
    const pick = (tag) => itemXml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\/${tag}>`, 'i'))?.[1] ?? '';
    const rawTitle = decode(pick('title'));
    const { headline, source } = splitHeadlineAndSource(rawTitle);
    const description = tidyDescription(pick('description'), headline, source);
    const sourceUrl = decode(itemXml.match(/<source[^>]+url="([^"]+)"/i)?.[1] || '');
    return {
      id: `${section.id}-${index + 1}`,
      sectionId: section.id,
      sectionName: section.name,
      headline,
      source,
      sourceUrl,
      link: decode(pick('link')),
      actualUrl: null,
      pubDate: decode(pick('pubDate')),
      description,
      articleText: '',
      extractionStatus: 'pending',
      extractionNote: null,
      fallbackSummary: null,
      aiSummary: null,
      relevanceScore: 0
    };
  })
  .filter((item) => item.headline && item.link);

const rawSectionData = await Promise.all(sections.map(async (section) => {
  const xml = await fetchText(section.feedUrl);
  const enrichedItems = await Promise.all(parseFeedItems(section, xml).map(fetchArticleDetails));
  const selectedItems = enrichedItems
    .map((item) => ({ ...item, relevanceScore: scoreArticle(section.id, item) }))
    .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0) || toTimestamp(b.pubDate) - toTimestamp(a.pubDate))
    .slice(0, ITEMS_PER_SECTION)
    .map((item) => ({
      ...item,
      description: item.fallbackSummary || item.description
    }));

  return {
    ...section,
    items: selectedItems,
    summary: summarizeSectionRuleBased({ ...section, items: selectedItems })
  };
}));

const fallbackBrief = buildBriefRuleBased(rawSectionData);
let finalBrief = fallbackBrief;
let finalSections = rawSectionData;
let summaryMeta = {
  provider: 'rule-based',
  model: null,
  fallbackReason: anthropicApiKey ? 'not-requested' : 'missing-api-key'
};

if (anthropicApiKey) {
  try {
    const aiResult = await callAnthropicSummaries(rawSectionData, fallbackBrief);
    if (aiResult.ok) {
      const merged = mergeSummaries(rawSectionData, fallbackBrief, aiResult.data);
      finalBrief = merged.brief;
      finalSections = merged.sections;
      summaryMeta = {
        provider: 'anthropic',
        model: aiResult.model,
        fallbackReason: null
      };
    }
  } catch (error) {
    console.warn(`Anthropic summary layer unavailable, falling back to rule-based summaries: ${error.message}`);
    summaryMeta = {
      provider: 'rule-based',
      model: anthropicPreferredModels[0] || null,
      fallbackReason: error.message
    };
  }
}

const payload = {
  site: {
    title: 'Vad i helvete händer?!',
    subtitle: 'En torrt ironisk morgonbrief om världsläget, uppdaterad ungefär varje timme.',
    note: 'RSS först, riktiga artikel-URL:er när de går att få loss, och originaltext när sajterna inte gömmer allt bakom lås eller skräp-html.'
  },
  generatedAt: new Date().toISOString(),
  summaryMeta,
  brief: finalBrief,
  sections: finalSections,
  sources: finalSections.map(({ id, name, sourceLabel, feedUrl }) => ({ id, name, sourceLabel, feedUrl }))
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${finalSections.reduce((sum, section) => sum + section.items.length, 0)} items across ${finalSections.length} sections to ${outputPath} using ${summaryMeta.provider}${summaryMeta.model ? ` (${summaryMeta.model})` : ''}`);
