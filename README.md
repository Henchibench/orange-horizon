# orange-horizon

A small static site with a sunrise palette and a rolling feed of recent Donald Trump news.

## How it works

- `scripts/update-news.mjs` fetches Google News RSS results for recent Donald Trump coverage.
- It writes normalized data to `docs/data/news.json`.
- GitHub Actions runs hourly and commits updated data back to the repo.
- GitHub Pages serves the site from the `docs/` folder on the main branch.

## Local usage

```bash
npm run update-news
python3 -m http.server 8000 -d docs
```

Then open `http://localhost:8000`.

## Source

Uses public RSS from Google News:

- `https://news.google.com/rss/search?q=%22Donald+Trump%22+when:7d&hl=en-US&gl=US&ceid=US:en`

No paid API required.
