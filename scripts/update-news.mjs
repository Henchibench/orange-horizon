import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(__dirname);
const outputPath = `${projectRoot}/docs/data/news.json`;
const feedUrl = 'https://news.google.com/rss/search?q=%22Donald+Trump%22+when:7d&hl=en-US&gl=US&ceid=US:en';

const xml = await fetch(feedUrl, {
  headers: {
    'user-agent': 'orange-horizon-bot/1.0 (+https://github.com/Henchibench/orange-horizon)'
  }
}).then((response) => {
  if (!response.ok) {
    throw new Error(`Failed to fetch RSS: ${response.status} ${response.statusText}`);
  }
  return response.text();
});

const decode = (text = '') => text
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&#x27;/gi, "'")
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

const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 12).map((match, index) => {
  const itemXml = match[1];
  const pick = (tag) => itemXml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1] ?? '';
  const rawTitle = decode(pick('title'));
  const [headline, source = 'Unknown source'] = rawTitle.split(/\s+-\s+(?=[^-]+$)/);
  const link = decode(pick('link'));
  const pubDate = decode(pick('pubDate'));
  const description = stripTags(pick('description'));

  return {
    id: `item-${index + 1}`,
    headline: headline || rawTitle,
    source,
    link,
    pubDate,
    description: description || 'Fresh headlines, warm light, and yet somehow the same weather system.'
  };
});

const payload = {
  site: {
    title: 'Orange Horizon',
    subtitle: 'A sunrise-toned watch on the latest Donald Trump headlines.',
    note: 'Freshly poured from public RSS. Coffee not included.'
  },
  generatedAt: new Date().toISOString(),
  source: feedUrl,
  items
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${items.length} items to ${outputPath}`);
