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
      {
        label: 'The Guardian: Donald Trump',
        url: 'https://www.theguardian.com/us-news/donaldtrump/rss',
        include: [/trump|donald trump|white house/i],
        headlineOnly: true
      },
      {
        label: 'BBC News: US & Canada',
        url: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml',
        include: [/trump|donald trump|white house/i],
        headlineOnly: true
      },
      {
        label: 'BBC News: Politics',
        url: 'https://feeds.bbci.co.uk/news/politics/rss.xml',
        include: [/trump|donald trump|white house/i],
        headlineOnly: true
      },
      {
        label: 'Al Jazeera RSS',
        url: 'https://www.aljazeera.com/xml/rss/all.xml',
        include: [/trump|donald trump|white house/i],
        headlineOnly: true
      }
    ]
  },
  {
    id: 'putin-ukraina',
    name: 'Putin / Ukraina',
    label: 'Krig, repression, diplomatiskt grus',
    description: 'Fronten, Kreml och följderna i Ukraina och bortom den.',
    feeds: [
      {
        label: 'The Guardian: Ukraine',
        url: 'https://www.theguardian.com/world/ukraine/rss',
        include: [/ukraine|ukrainian|russia|russian|putin|kremlin|kyiv|kharkiv|odesa|odessa|donetsk|dnipro/i]
      },
      {
        label: 'BBC News: Europe',
        url: 'https://feeds.bbci.co.uk/news/world/europe/rss.xml',
        include: [/ukraine|ukrainian|russia|russian|putin|kremlin|kyiv|moscow/i]
      },
      {
        label: 'DW: All',
        url: 'https://rss.dw.com/rdf/rss-en-all',
        include: [/ukraine|ukrainian|russia|russian|putin|kremlin|kyiv|moscow/i]
      },
      {
        label: 'Al Jazeera RSS',
        url: 'https://www.aljazeera.com/xml/rss/all.xml',
        include: [/ukraine|ukrainian|russia|russian|putin|kremlin|kyiv|moscow/i]
      }
    ]
  },
  {
    id: 'iran',
    name: 'Iran',
    label: 'Regionen håller andan igen',
    description: 'Iran, säkerhetsläget och maktspel som sällan blir mindre riskfyllt.',
    feeds: [
      {
        label: 'The Guardian: Iran',
        url: 'https://www.theguardian.com/world/iran/rss',
        include: [/iran|iranian|tehran|khamenei|revolutionary guard|irgc|nuclear|uranium|missile|isfahan|fordow/i]
      },
      {
        label: 'BBC News: Middle East',
        url: 'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml',
        include: [/iran|iranian|tehran|khamenei|revolutionary guard|irgc|nuclear|uranium|missile|fordow/i]
      },
      {
        label: 'Al Jazeera RSS',
        url: 'https://www.aljazeera.com/xml/rss/all.xml',
        include: [/iran|iranian|tehran|khamenei|revolutionary guard|irgc|nuclear|uranium|missile|fordow/i]
      },
      {
        label: 'DW: All',
        url: 'https://rss.dw.com/rdf/rss-en-all',
        include: [/iran|iranian|tehran|khamenei|revolutionary guard|irgc|nuclear|uranium|missile|fordow/i]
      }
    ]
  },
  {
    id: 'orban-eu',
    name: 'Orbán / EU',
    label: 'Illiberal administration, kontinentalt tålamodstest',
    description: 'Ungern, EU-bråk, veto-spel och Orbáns ständiga närvaro i marginalnoterna.',
    feeds: [
      {
        label: 'The Guardian: Hungary',
        url: 'https://www.theguardian.com/world/hungary/rss',
        include: [/orban|orbán|hungary|hungarian|budapest/i],
        headlineOnly: true
      },
      {
        label: 'Politico Europe',
        url: 'https://www.politico.eu/feed/',
        include: [/orban|orbán|hungary|hungarian|budapest/i],
        headlineOnly: true
      },
      {
        label: 'DW: EU',
        url: 'https://rss.dw.com/rdf/rss-en-eu',
        include: [/orban|orbán|hungary|hungarian|budapest/i],
        headlineOnly: true
      },
      {
        label: 'BBC News: Europe',
        url: 'https://feeds.bbci.co.uk/news/world/europe/rss.xml',
        include: [/orban|orbán|hungary|hungarian|budapest/i],
        headlineOnly: true
      }
    ]
  }
];

const ITEMS_PER_SECTION = 5;
const FEED_ITEMS_PER_SOURCE = 16;
const ARTICLE_TEXT_CHAR_LIMIT = 5000;
const MIN_ARTICLE_TEXT_FOR_REAL_SUMMARY = 240;

const fetchText = async (url, options = {}) => {
  const response = await fetch(url, {
    redirect: 'follow',
    ...options,
    headers: {
      'user-agent': 'vad-i-helvete-hander-bot/2.0 (+https://github.com/Henchibench/orange-horizon)',
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
    .replace(/<\/li>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, ' • ')
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
const normalizeWhitespace = (value = '') => value.replace(/\s+/g, ' ').trim();

const firstMatch = (text, regexes) => {
  for (const regex of regexes) {
    const match = text.match(regex);
    if (match?.[1]) return match[1];
  }
  return '';
};

const splitHeadlineAndSource = (rawTitle, explicitSource = '') => {
  const parts = rawTitle.split(/\s+-\s+(?=[^-]+$)/);
  if (parts.length >= 2) {
    const source = parts.pop();
    return {
      headline: parts.join(' - ').trim(),
      source: explicitSource || source?.trim() || 'Okänd källa'
    };
  }

  return {
    headline: rawTitle.trim(),
    source: explicitSource || 'Okänd källa'
  };
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

  const bestBlock = [...candidateBlocks]
    .sort((a, b) => textDensityScore(b) - textDensityScore(a))[0] || cleaned;

  const paragraphTexts = unique(
    [...bestBlock.matchAll(/<(p|h2|h3|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi)]
      .map((match) => stripTags(match[2]))
      .map((text) => text.replace(/\s+/g, ' ').trim())
      .filter((text) => text.length >= 50)
      .filter((text) => !/^(sign up|read more|listen to|watch:|related:|advertisement|newsletter)/i.test(text))
  );

  const text = (paragraphTexts.length ? paragraphTexts.join('\n\n') : stripTags(bestBlock))
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return clampText(text, ARTICLE_TEXT_CHAR_LIMIT);
};

const cleanFeedSummary = (description, headline, source) => {
  const cleaned = stripTags(description)
    .replace(new RegExp(`\\b${escapeRegExp(source)}\\b`, 'gi'), ' ')
    .replace(new RegExp(`\\b${escapeRegExp(headline)}\\b`, 'gi'), ' ')
    .replace(/^(updated?|published|source):\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';
  if (/^(read more|click here|listen to|watch|photo|video)/i.test(cleaned)) return '';
  if (cleaned.length < 70) return '';
  return clampText(cleaned, 220);
};

const sentencesFromText = (text = '') => normalizeWhitespace(text)
  .split(/(?<=[.!?])\s+(?=[A-ZÅÄÖ0-9"'])/)
  .map((part) => part.trim())
  .filter(Boolean);

const sanitizeEnglishLeak = (text = '') => text
  .replace(/^leadande spår:/i, 'Här är läget:')
  .replace(/^nästa upp:/i, 'Mer i samma spår:')
  .replace(/^breaking:/i, 'Snabbt:')
  .replace(/\bheadline-only\b/gi, 'bara rubrik')
  .replace(/\bfeed-description\b/gi, 'feed-beskrivning')
  .replace(/\barticle-text\b/gi, 'artikeltext')
  .replace(/\bmeta-description\b/gi, 'metabeskrivning')
  .replace(/\bTop line\b/gi, 'Kort sagt')
  .trim();

const stripLeadLabel = (text = '') => text
  .replace(/^kortversionen:\s*/i, '')
  .replace(/^kort sagt:\s*/i, '')
  .replace(/^här är läget:\s*/i, '')
  .trim();

const patternSummarizeEnglishToSwedish = (text = '') => {
  const value = normalizeWhitespace(stripTags(text));
  if (!value) return '';

  let match = value.match(/^An aerial attack on (.+?) has killed (.+?) and wounded (.+?)[\.,]/i);
  if (match) return `Ett flyganfall mot ${translateNewsText(match[1])} dödade ${translateNewsText(match[2])} och skadade ${translateNewsText(match[3])}.`;

  match = value.match(/^Federal prosecutors examined whether (.+?) showed a classified map to (.+?) after (.+?)[\.,]/i);
  if (match) return `Federala åklagare granskar om ${translateNewsText(match[1])} visade en hemligstämplad karta för ${translateNewsText(match[2])} efter ${translateNewsText(match[3])}.`;

  match = value.match(/^Iran(?:’s|'s) military has said (.+?), dismissing claims (.+?)[\.,]/i);
  if (match) return `Irans militär säger att ${translateNewsText(match[1])} och avfärdar uppgifter om ${translateNewsText(match[2])}.`;

  match = value.match(/^Moldova declared a state of emergency in the energy sector after (.+?)[\.,]/i);
  if (match) return `Moldavien utlyser nödläge i energisektorn efter att ${translateNewsText(match[1])}.`;

  match = value.match(/^Ukraine has begun the compulsory evacuation of children from (.+?), in a sign (.+?)[\.,]/i);
  if (match) return `Ukraina tvångsevakuerar barn från ${translateNewsText(match[1])} när ${translateNewsText(match[2])}.`;

  match = value.match(/^The EU will find ways to pay out the promised (.+?) loan to Ukraine despite Hungary(?:’s|'s) (.+?), (.+?) said/i);
  if (match) return `EU säger att lånet på ${translateNewsText(match[1])} till Ukraina ska betalas ut trots Ungerns ${translateNewsText(match[2])}.`;

  match = value.match(/^Ukraine(?:’s|'s) military struck (.+?) in (.+?), (.+?) said/i);
  if (match) return `Ukrainas militär slog mot ${translateNewsText(match[1])} i ${translateNewsText(match[2])}, enligt ${translateNewsText(match[3])}.`;

  match = value.match(/^Russia has launched (.+?) at Ukraine, killing at least (.+?), as (.+?)[\.,]/i);
  if (match) return `Ryssland har inlett ${translateNewsText(match[1])} mot Ukraina, dödat minst ${translateNewsText(match[2])} och ${translateNewsText(match[3])}.`;

  match = value.match(/^Democrats managed to flip a seat (.+?)[\.,]/i);
  if (match) return `Demokraterna vann ett mandat ${translateNewsText(match[1])}.`;

  match = value.match(/^Donald Trump declared victory in his war on Iran (.+?), amid reports that (.+?)[\.,]/i);
  if (match) return `Trump utropade seger i kriget mot Iran ${translateNewsText(match[1])}, samtidigt som uppgifter kom om att ${translateNewsText(match[2])}.`;

  return '';
};

const translateNewsText = (text = '') => normalizeWhitespace(stripTags(text))
  .replace(/\bthe United States\b/gi, 'USA')
  .replace(/\bUnited States\b/g, 'USA')
  .replace(/\bUS President\b/g, 'USA:s president')
  .replace(/\bPresident Donald Trump\b/g, 'president Donald Trump')
  .replace(/\btalks are under way to end the conflict\b/gi, 'samtal pågår för att avsluta konflikten')
  .replace(/\bnegotiating with itself to save face\b/gi, 'förhandlar med sig självt för att rädda ansiktet')
  .replace(/\bis failing in its war\b/gi, 'håller på att misslyckas i sitt krig')
  .replace(/\ba military base in western Iraq’s Anbar province\b/gi, 'en militärbas i Anbarprovinsen i västra Irak')
  .replace(/\bseven fighters\b/gi, 'sju soldater')
  .replace(/\ba key power line with Europe was disconnected following Russian strikes in Ukraine\b/gi, 'en viktig kraftledning till Europa slogs ut efter ryska angrepp i Ukraina')
  .replace(/\bthe city of Sloviansk\b/gi, 'staden Slovjansk')
  .replace(/\bthe security situation is deteriorating in one of the country’s main remaining strongholds in the Donbas area\b/gi, 'säkerhetsläget försämras i en av landets viktigaste kvarvarande fästpunkter i Donbas')
  .replace(/\bongoing resistance\b/gi, 'fortsatta motstånd')
  .replace(/\bpeople on his plane\b/gi, 'personer ombord på sitt plan')
  .replace(/\bhis first term\b/gi, 'sin första mandatperiod')
  .replace(/\bUkraine\b/g, 'Ukraina')
  .replace(/\bRussia\b/g, 'Ryssland')
  .replace(/\bHungary\b/g, 'Ungern')
  .replace(/\bIran\b/g, 'Iran')
  .replace(/\bongoing\b/gi, 'pågående')
  .replace(/\bthe\b/gi, '')
  .replace(/\s{2,}/g, ' ')
  .trim();

const summarizeFromArticleText = (articleText) => {
  const sentences = sentencesFromText(articleText)
    .filter((sentence) => sentence.length >= 45)
    .filter((sentence) => !/^(sign up|read more|listen to|watch|related|advertisement|newsletter)/i.test(sentence));

  if (!sentences.length) return '';

  const selected = [];
  let total = 0;
  for (const sentence of sentences) {
    if (total >= 240) break;
    selected.push(sentence);
    total += sentence.length + 1;
    if (selected.length >= 2) break;
  }

  return clampText(selected.join(' '), 240);
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
  /press release/i,
  /at a glance/i,
  /commentisfree/i,
  /show key events only/i
];

const scoreArticle = (sectionId, item) => {
  const corpus = `${item.headline} ${item.feedSummary || ''} ${item.articleText || ''}`.toLowerCase();
  let score = 0;

  const add = (pattern, points) => {
    if (pattern.test(corpus)) score += points;
  };
  const penalize = (pattern, points) => {
    if (pattern.test(corpus)) score -= points;
  };

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
  if (item.summarySource === 'article-text') score += 8;
  if (item.summarySource === 'feed-description') score += 3;
  if ((item.articleText || '').length > 1000) score += 4;
  if ((item.articleText || '').length < 180) score -= 4;
  if (/bbc|the guardian|politico europe|dw|al jazeera/i.test(item.source)) score += 2;
  return score;
};

const buildSectionSnapshot = (section) => {
  const lead = section.items[0];
  const runnerUp = section.items[1];
  if (!lead) return 'Tomt i flödet just nu.';

  const leadSource = lead.source ? ` (${lead.source})` : '';
  const runnerUpPart = runnerUp
    ? ` I bakgrunden: ${runnerUp.headline}${runnerUp.source ? ` (${runnerUp.source})` : ''}.`
    : '';

  return clampText(`Tyngdpunkten ligger på ${lead.headline}${leadSource}.${runnerUpPart}`, 280);
};

const detectThemes = (text = '') => {
  const corpus = normalizeWhitespace(text).toLowerCase();
  const themeMap = [
    { key: 'diplomacy', sv: 'diplomatiskt spel', patterns: [/diplomac|talks?|negotiat|ceasefire|proposal|deal\b/] },
    { key: 'war', sv: 'krig och militära angrepp', patterns: [/war|strike|missile|drone|bomb|attack|troops?|air\s*strikes?/] },
    { key: 'law', sv: 'juridiskt efterspel', patterns: [/prosecutor|court|lawsuit|justice department|classified|investigat|trial/] },
    { key: 'election', sv: 'val och partimätning', patterns: [/election|vote|democrat|republican|seat|campaign/] },
    { key: 'sanctions', sv: 'sanktioner och ekonomiskt tryck', patterns: [/sanction|tariff|oil|gas|funds|budget/] },
    { key: 'repression', sv: 'repression och auktoritär kontroll', patterns: [/repression|authoritarian|arrest|detain|prison|rule of law|spy/] },
    { key: 'eu', sv: 'EU-bråk och veto-politik', patterns: [/eu|brussels|commission|veto|hungary|orban|orbán/] }
  ];

  return themeMap.filter((theme) => theme.patterns.some((pattern) => pattern.test(corpus))).map((theme) => theme.sv);
};

const pickBestSummaryText = (item) => item.articleSummary || item.feedSummary || item.headline || '';

const buildItemSummaryFallback = (item) => {
  const sourceText = pickBestSummaryText(item);
  const matched = patternSummarizeEnglishToSwedish(sourceText) || patternSummarizeEnglishToSwedish(item.headline);
  if (matched) return clampText(matched, 260);

  const cleanedHeadline = translateNewsText(item.headline);
  const sourcePart = item.source ? ` Källa: ${item.source}.` : '';
  return clampText(`${cleanedHeadline}${sourcePart}`, 220);
};

const summarizeSectionRuleBased = (section) => {
  const lead = section.items[0];
  const followUps = section.items.slice(1, 3).map((item) => stripLeadLabel(buildItemSummaryFallback(item)));
  if (!lead) return 'Tomt i flödet just nu.';

  const leadLine = stripLeadLabel(buildItemSummaryFallback(lead));
  const followUpLine = followUps.length ? ` Vid sidan av det: ${followUps.join(' ')}` : '';
  return clampText(`${leadLine}${followUpLine}`, 220);
};

const buildBriefRuleBased = (sectionData) => {
  const leadItems = sectionData
    .map((section) => section.items[0])
    .filter(Boolean)
    .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0) || toTimestamp(b.pubDate) - toTimestamp(a.pubDate));

  const bullets = leadItems.slice(0, 3).map((item) => {
    const section = sectionData.find((entry) => entry.id === item.sectionId);
    return clampText(`${section?.name || 'Läget'}: ${stripLeadLabel(buildItemSummaryFallback(item))}`, 160);
  });

  while (bullets.length < 3) bullets.push('Flödet är tunnare än vanligt, så den här körningen har mindre att bygga på.');

  return {
    title: 'Det viktigaste nu',
    intro: 'Tre konkreta huvudspår från körningen, utan meta-snack.',
    bullets: bullets.map((bullet) => sanitizeEnglishLeak(clampText(bullet, 160)))
  };
};

const buildAnthropicPrompt = (sectionData, fallbackBrief) => JSON.stringify({
  task: 'Skriv en svensk, redaktionell briefing för startsidan. Allt i summary-lagret måste vara på svenska. Originalrubriker får vara kvar längre ned i artikellistan, men brief, sektionssammanfattningar och AI-sammanfattningar ska vara svensk text utan engelska fraser.',
  rules: {
    language: 'svenska',
    tone: 'torr, lätt ironisk, nykter, redaktionell',
    titleMaxChars: 48,
    introMaxChars: 110,
    briefBulletsCount: 3,
    bulletMaxChars: 140,
    sectionSummaryMaxChars: 220,
    itemSummaryMaxChars: 260,
    preserveFacts: true,
    noFabrication: true,
    mentionUncertaintyIfNeeded: true,
    avoidGenericAiPhrases: true,
    avoidSceneSetting: true,
    avoidEnglishLeakage: true,
    leadWithSynthesis: true,
    editorialButConcrete: true
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
    itemCount: section.items.length,
    items: section.items.map((item) => ({
      id: item.id,
      headline: item.headline,
      source: item.source,
      pubDate: item.pubDate,
      actualUrl: item.actualUrl,
      extractionStatus: item.extractionStatus,
      summarySource: item.summarySource,
      feedSummary: item.feedSummary,
      articleSummary: item.articleSummary,
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
    headers: {
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01'
    }
  });

  if (!response.ok) {
    throw new Error(`Anthropic models API error: ${response.status} ${response.statusText} - ${await readErrorBody(response)}`);
  }

  const data = await response.json();
  return Array.isArray(data?.data) ? data.data.map((model) => `${model.id || ''}`.trim()).filter(Boolean) : [];
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
  return [...availableModels].sort((a, b) => rankAnthropicModel(b) - rankAnthropicModel(a) || a.localeCompare(b))[0] || null;
};

const callAnthropicSummaries = async (sectionData, fallbackBrief) => {
  if (!anthropicApiKey) return { ok: false, reason: 'missing-api-key' };
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
      max_tokens: 1800,
      temperature: 0.2,
      system: 'Du skriver för sajten "Vad i helvete händer?!". Summary-lagret ska vara helt på svenska: brief, sektionssummeringar och artikeltexter. Behåll originalrubrikerna orörda i underlaget men översätt/sammanfatta i redaktionell svenska. Returnera enbart giltig JSON utan markdown eller kommentarer.',
      messages: [{ role: 'user', content: buildAnthropicPrompt(sectionData, fallbackBrief) }]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status} ${response.statusText} - ${await readErrorBody(response)}`);
  }

  const data = await response.json();
  const text = data?.content?.filter((block) => block.type === 'text').map((block) => block.text).join('\n').trim();
  if (!text) throw new Error('Anthropic returned no text content');
  return { ok: true, data: JSON.parse(extractJsonText(text)), model };
};

const mergeSummaries = (sectionData, fallbackBrief, aiPayload) => {
  const aiSections = new Map((aiPayload?.sections || []).map((section) => [section.id, section.summary]));
  const aiItems = new Map((aiPayload?.items || []).map((item) => [item.id, item.summary]));

  const brief = {
    title: typeof aiPayload?.brief?.title === 'string' && aiPayload.brief.title.trim() ? sanitizeEnglishLeak(aiPayload.brief.title.trim()) : fallbackBrief.title,
    intro: typeof aiPayload?.brief?.intro === 'string' && aiPayload.brief.intro.trim() ? sanitizeEnglishLeak(aiPayload.brief.intro.trim()) : fallbackBrief.intro,
    bullets: Array.isArray(aiPayload?.brief?.bullets)
      ? aiPayload.brief.bullets.map((bullet) => sanitizeEnglishLeak(`${bullet}`.trim())).filter(Boolean).slice(0, 3)
      : fallbackBrief.bullets
  };

  if (brief.bullets.length !== 3) brief.bullets = fallbackBrief.bullets;

  const sectionsWithSummaries = sectionData.map((section) => ({
    ...section,
    summary: typeof aiSections.get(section.id) === 'string' && aiSections.get(section.id).trim()
      ? sanitizeEnglishLeak(aiSections.get(section.id).trim())
      : section.summary,
    items: section.items.map((item) => {
      const aiSummary = typeof aiItems.get(item.id) === 'string' && aiItems.get(item.id).trim()
        ? sanitizeEnglishLeak(aiItems.get(item.id).trim())
        : null;
      return {
        ...item,
        aiSummary,
        description: aiSummary || buildItemSummaryFallback(item)
      };
    })
  }));

  return { brief, sections: sectionsWithSummaries };
};

const fetchArticleDetails = async (item) => {
  try {
    const html = await fetchText(item.link);
    const articleText = extractReadableText(html);
    const metaDescription = extractMetaContent(html, 'description') || extractMetaContent(html, 'og:description', 'property');
    const articleSummary = summarizeFromArticleText(articleText);
    const feedSummary = cleanFeedSummary(item.rawDescription, item.headline, item.source);
    const metaSummary = cleanFeedSummary(metaDescription, item.headline, item.source);
    const description = articleSummary || feedSummary || metaSummary || '';
    const extractionStatus = articleText.length >= MIN_ARTICLE_TEXT_FOR_REAL_SUMMARY ? 'ok' : (articleText.length >= 120 || metaSummary ? 'partial' : 'failed');
    const summarySource = articleSummary ? 'article-text' : (feedSummary ? 'feed-description' : (metaSummary ? 'meta-description' : 'headline-only'));

    return {
      ...item,
      actualUrl: item.link,
      articleText,
      articleSummary,
      feedSummary,
      extractionStatus,
      extractionNote: articleSummary ? 'article-text' : (feedSummary ? 'feed-description' : (metaSummary ? 'meta-description' : 'headline-only')),
      summarySource,
      description
    };
  } catch (error) {
    const feedSummary = cleanFeedSummary(item.rawDescription, item.headline, item.source);
    return {
      ...item,
      actualUrl: item.link,
      articleText: '',
      articleSummary: '',
      feedSummary,
      extractionStatus: feedSummary ? 'partial' : 'failed',
      extractionNote: error.message,
      summarySource: feedSummary ? 'feed-description' : 'headline-only',
      description: feedSummary || ''
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
      description: '',
      articleText: '',
      articleSummary: '',
      feedSummary: '',
      extractionStatus: 'pending',
      extractionNote: null,
      summarySource: 'headline-only',
      feedLabel: feed.label,
      feedUrl: feed.url,
      relevanceScore: 0
    } : null;
  })
  .filter((item) => item && item.headline && item.link);

const rawSectionData = await Promise.all(sections.map(async (section) => {
  const feedGroups = await Promise.all(section.feeds.map(async (feed) => ({
    feed,
    xml: await fetchText(feed.url)
  })));

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
    .slice(0, ITEMS_PER_SECTION)
    .map((item) => ({
      ...item,
      description: buildItemSummaryFallback(item)
    }));

  const sourceSummary = unique(section.feeds.map((feed) => feed.label)).join(' • ');

  return {
    ...section,
    sourceLabel: sourceSummary,
    feedUrl: section.feeds[0]?.url || '',
    feedUrls: section.feeds.map((feed) => ({ label: feed.label, url: feed.url })),
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
    note: 'Direkta källflöden först: BBC, Guardian, DW, Politico Europe och Al Jazeera. Summary-lagret skrivs på svenska; originalartiklarna ligger kvar bakom varje sektion.'
  },
  generatedAt: new Date().toISOString(),
  summaryMeta,
  brief: finalBrief,
  sections: finalSections,
  sources: finalSections.map(({ id, name, sourceLabel, feedUrls }) => ({ id, name, sourceLabel, feedUrls }))
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${finalSections.reduce((sum, section) => sum + section.items.length, 0)} items across ${finalSections.length} sections to ${outputPath} using ${summaryMeta.provider}${summaryMeta.model ? ` (${summaryMeta.model})` : ''}`);
