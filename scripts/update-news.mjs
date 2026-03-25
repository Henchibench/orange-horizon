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

const fetchText = async (url) => {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'vad-i-helvete-hander-bot/1.0 (+https://github.com/Henchibench/orange-horizon)'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch RSS ${url}: ${response.status} ${response.statusText}`);
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
  .trim();

const stripTags = (text = '') => decode(
  decode(text)
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1')
    .replace(/<font\b[^>]*>([\s\S]*?)<\/font>/gi, ' $1 ')
    .replace(/<[^>]+>/g, ' ')
)
  .replace(/\s+/g, ' ')
  .trim();

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

const toTimestamp = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const summarizeSectionRuleBased = (section) => {
  const lead = section.items[0];
  const second = section.items[1];
  const sourceSet = [...new Set(section.items.map((item) => item.source))];

  const lines = [];
  if (lead) lines.push(`Ledande rubrik: ${lead.headline}.`);
  if (second) lines.push(`Därefter: ${second.headline}.`);
  lines.push(`${section.items.length} nedslag från ${sourceSet.length} källor.`);
  return lines.join(' ');
};

const buildBriefRuleBased = (sectionData) => {
  const allItems = sectionData.flatMap((section) => section.items).sort((a, b) => toTimestamp(b.pubDate) - toTimestamp(a.pubDate));
  const freshest = allItems[0];
  const busiest = [...sectionData].sort((a, b) => b.items.length - a.items.length)[0];

  const bullets = [
    freshest ? `Senast in: ${freshest.headline} (${freshest.sectionName}).` : 'Inget färskt just nu, vilket vore misstänkt.',
    busiest ? `Mest brus i flödet: ${busiest.name} med ${busiest.items.length} artiklar.` : 'Alla sektioner verkar märkligt lugna.',
    'Det här är en strukturerad morgonbrief, inte en AI-ledare. Den kan enkelt byggas ut med mer sammanfattning senare.'
  ];

  return {
    title: 'Morgonbrief för folk som redan anar att läget inte direkt stabiliserats över natten.',
    intro: 'Fyra spår av global oreda, serverade utan confetti men med länkar tillbaka till originalrapporteringen.',
    bullets
  };
};

const buildAnthropicPrompt = (sectionData, fallbackBrief) => JSON.stringify({
  task: 'Skriv en kort svensk morgonbrief i torrt ironisk ton. Håll dig strikt till tillgängliga rubriker och metadata. Hitta inte på fakta. Om underlaget är tunt: var återhållsam snarare än kreativ.',
  rules: {
    language: 'svenska',
    tone: 'torr, lätt ironisk, nykter, inte flåshurtig',
    introMaxChars: 220,
    briefBulletsCount: 3,
    bulletMaxChars: 160,
    sectionSummaryMaxChars: 220,
    preserveFacts: true,
    noFabrication: true,
    mentionUncertaintyIfNeeded: true
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
    ]
  },
  fallbackReference: fallbackBrief,
  sections: sectionData.map((section) => ({
    id: section.id,
    name: section.name,
    label: section.label,
    description: section.description,
    itemCount: section.items.length,
    items: section.items.slice(0, 5).map((item) => ({
      headline: item.headline,
      source: item.source,
      pubDate: item.pubDate,
      description: item.description
    }))
  }))
}, null, 2);

const readErrorBody = async (response) => {
  const text = (await response.text()).trim();
  return text ? text.slice(0, 500) : 'empty response body';
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

  if (!model) {
    throw new Error('Anthropic models API returned no usable models');
  }

  const response = await fetch(`${anthropicEndpoint}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 900,
      temperature: 0.2,
      system: 'Du skriver för sajten "Vad i helvete händer?!". Returnera enbart giltig JSON utan markdown eller kommentarer.',
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
  if (!text) {
    throw new Error('Anthropic returned no text content');
  }

  const parsed = JSON.parse(text);
  return { ok: true, data: parsed, model, availableModels };
};

const mergeSummaries = (sectionData, fallbackBrief, aiPayload) => {
  const aiSections = new Map((aiPayload?.sections || []).map((section) => [section.id, section.summary]));

  const brief = {
    title: typeof aiPayload?.brief?.title === 'string' && aiPayload.brief.title.trim()
      ? aiPayload.brief.title.trim()
      : fallbackBrief.title,
    intro: typeof aiPayload?.brief?.intro === 'string' && aiPayload.brief.intro.trim()
      ? aiPayload.brief.intro.trim()
      : fallbackBrief.intro,
    bullets: Array.isArray(aiPayload?.brief?.bullets)
      ? aiPayload.brief.bullets.map((bullet) => `${bullet}`.trim()).filter(Boolean).slice(0, 3)
      : fallbackBrief.bullets
  };

  if (brief.bullets.length !== 3) {
    brief.bullets = fallbackBrief.bullets;
  }

  const sectionsWithSummaries = sectionData.map((section) => ({
    ...section,
    summary: typeof aiSections.get(section.id) === 'string' && aiSections.get(section.id).trim()
      ? aiSections.get(section.id).trim()
      : section.summary
  }));

  return { brief, sections: sectionsWithSummaries };
};

const rawSectionData = await Promise.all(sections.map(async (section) => {
  const xml = await fetchText(section.feedUrl);
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .slice(0, 8)
    .map((match, index) => {
      const itemXml = match[1];
      const pick = (tag) => itemXml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\/${tag}>`, 'i'))?.[1] ?? '';
      const rawTitle = decode(pick('title'));
      const { headline, source } = splitHeadlineAndSource(rawTitle);
      const description = tidyDescription(pick('description'), headline, source);
      return {
        id: `${section.id}-${index + 1}`,
        sectionId: section.id,
        sectionName: section.name,
        headline,
        source,
        link: decode(pick('link')),
        pubDate: decode(pick('pubDate')),
        description
      };
    })
    .filter((item) => item.headline && item.link);

  return {
    ...section,
    items,
    summary: summarizeSectionRuleBased({ ...section, items })
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
    note: 'Byggd på publika RSS-flöden. Inga betalväggs-API:er, bara disciplin, lätt misstro och en billig AI-genväg när den beter sig.'
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
