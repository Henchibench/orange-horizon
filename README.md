# Vad i helvete händer?!

En statisk svensk morgonbrief för folk som tittar på omvärlden och misstänker att den fortfarande står i brand.

## Vad sajten gör

- Bygger en flersektions-brief från publika Google News RSS-sökningar.
- Täcker just nu minst fyra spår:
  - Trump / USA
  - Putin / Ukraina
  - Iran
  - Orbán / EU
- Skriver normaliserad data till `docs/data/news.json`.
- GitHub Actions kör uppdateringen varje timme.
- GitHub Pages serverar sajten från `docs/` på `main`.

## Arkitektur i korthet

- `scripts/update-news.mjs` hämtar flera RSS-flöden, städar HTML ur beskrivningar och bygger en strukturerad payload med:
  - `site`
  - `brief`
  - `sections`
  - `sources`
- `docs/assets/app.js` renderar en enkel morgonbrief med sektionskort och käll-länkar.
- `docs/index.html` + `docs/assets/styles.css` står för det statiska gränssnittet.

## Lokal körning

```bash
npm run update-news
python3 -m http.server 8000 -d docs
```

Öppna sedan `http://localhost:8000`.

## Källor

Använder publika RSS-flöden via Google News. Ingen betald API-nyckel behövs.

## Begränsningar

- Google News RSS är praktiskt men inte alltid elegant; relevansen kan variera.
- Sammanfattningslagret är medvetet enkelt och regelbaserat just nu, så det går att bygga vidare utan att dra in tunga AI-anrop eller kostnader.
