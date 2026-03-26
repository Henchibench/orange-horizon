import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(__dirname);
const newsPath = `${projectRoot}/docs/data/news.json`;
const audioDir = `${projectRoot}/docs/data/audio`;
const audioPath = `${audioDir}/podcast.mp3`;
const hashPath = `${audioDir}/hash.txt`;

const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim();

if (!apiKey || !voiceId) {
  console.log('ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID not set, skipping audio generation');
  process.exit(0);
}

// Read news data
let news;
try {
  news = JSON.parse(await readFile(newsPath, 'utf-8'));
} catch {
  console.log('Could not read news.json, skipping audio generation');
  process.exit(0);
}

if (news.state !== 'ready' || !Array.isArray(news.sections) || !news.sections.length) {
  console.log('News data not ready, skipping audio generation');
  process.exit(0);
}

// Build text from section summaries
const summaryTexts = news.sections
  .filter((s) => s.summary?.trim())
  .map((s) => `${s.name}. ${s.summary.trim()}`);

if (!summaryTexts.length) {
  console.log('No section summaries found, skipping audio generation');
  process.exit(0);
}

// Check hash to avoid regenerating unchanged content
const contentForHash = summaryTexts.join('\n\n');
const hash = createHash('sha256').update(contentForHash).digest('hex');

await mkdir(audioDir, { recursive: true });

let previousHash = '';
try {
  previousHash = (await readFile(hashPath, 'utf-8')).trim();
} catch {
  // No previous hash — generate fresh
}

if (hash === previousHash) {
  console.log('Audio unchanged, skipping ElevenLabs call');
  process.exit(0);
}

// Build the TTS script with a date intro
const dateStr = new Date().toLocaleDateString('sv-SE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
});
const intro = `Här är nyheterna för den ${dateStr}.`;
const scriptParts = [intro, ...summaryTexts];
const fullScript = scriptParts.join('\n\n');

console.log(`Generating audio for ${summaryTexts.length} sections (${fullScript.length} chars)...`);

// Call ElevenLabs TTS API
let audioBuffer;
try {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg'
    },
    body: JSON.stringify({
      text: fullScript,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unknown error');
    throw new Error(`ElevenLabs API returned ${response.status}: ${errorText}`);
  }

  audioBuffer = Buffer.from(await response.arrayBuffer());
} catch (error) {
  console.warn(`Audio generation failed: ${error.message}`);
  process.exit(0);
}

if (!audioBuffer.length) {
  console.warn('ElevenLabs returned empty audio, skipping');
  process.exit(0);
}

// Write audio file, hash, and update news.json
await writeFile(audioPath, audioBuffer);
await writeFile(hashPath, hash);

news.audio = {
  url: 'data/audio/podcast.mp3',
  generatedAt: new Date().toISOString()
};
await writeFile(newsPath, `${JSON.stringify(news, null, 2)}\n`);

const sizeMB = (audioBuffer.length / 1024 / 1024).toFixed(2);
console.log(`Wrote ${audioPath} (${sizeMB} MB)`);
