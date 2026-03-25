import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(__dirname);
const outputPath = `${projectRoot}/docs/data/news.json`;

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

const summarizeSection = (section) => {
  const lead = section.items[0];
  const second = section.items[1];
  const sourceSet = [...new Set(section.items.map((item) => item.source))];

  const lines = [];
  if (lead) lines.push(`Ledande rubrik: ${lead.headline}.`);
  if (second) lines.push(`Därefter: ${second.headline}.`);
  lines.push(`${section.items.length} nedslag från ${sourceSet.length} källor.`);
  return lines.join(' ');
};

const buildBrief = (sectionData) => {
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

const sectionData = await Promise.all(sections.map(async (section) => {
  const xml = await fetchText(section.feedUrl);
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .slice(0, 8)
    .map((match, index) => {
      const itemXml = match[1];
      const pick = (tag) => itemXml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1] ?? '';
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
    summary: summarizeSection({ ...section, items })
  };
}));

const payload = {
  site: {
    title: 'Vad i helvete händer?!',
    subtitle: 'En torrt ironisk morgonbrief om världsläget, uppdaterad ungefär varje timme.',
    note: 'Byggd på publika RSS-flöden. Inga betalväggs-API:er, bara disciplin och lätt misstro.'
  },
  generatedAt: new Date().toISOString(),
  brief: buildBrief(sectionData),
  sections: sectionData,
  sources: sectionData.map(({ id, name, sourceLabel, feedUrl }) => ({ id, name, sourceLabel, feedUrl }))
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${sectionData.reduce((sum, section) => sum + section.items.length, 0)} items across ${sectionData.length} sections to ${outputPath}`);
