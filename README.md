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
  - `summaryMeta`
  - `brief`
  - `sections`
  - `sources`
- Sammanfattningslagret försöker först använda Anthropic (`ANTHROPIC_API_KEY` i GitHub Actions) med en billig Haiku-modell, men faller strikt tillbaka till de befintliga regelbaserade sammanfattningarna om nyckeln saknas eller API-anropet misslyckas.
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
- Anthropic-lagret skriver bara brief/sektionstexter och rör inte den strukturerade artikeldata som sajten bygger på.
- Om `ANTHROPIC_API_KEY` saknas eller Anthropic svarar dåligt används de regelbaserade sammanfattningarna direkt, så bygget fortsätter ändå.
