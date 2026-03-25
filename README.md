# Vad i helvete händer?!

En statisk svensk morgonbrief för folk som tittar på omvärlden och misstänker att den fortfarande står i brand.

## Vad sajten gör

- Bygger en flersektions-brief från direkta redaktionella RSS-flöden.
- Täcker fyra spår:
  - Trump / USA
  - Putin / Ukraina
  - Iran
  - Orbán / EU
- Skriver normaliserad data till `docs/data/news.json`.
- GitHub Actions kör uppdateringen varje timme.
- GitHub Pages serverar sajten från `docs/` på `main`.

## Källstrategi

Google News är inte längre huvudmotorn.

I stället blandar generatorn flera direkta feeds per sektion, i första hand från:

- BBC News
- The Guardian
- DW
- Politico Europe
- Al Jazeera

Varje sektion har egna feedlistor och ämnesfilter. Det gör urvalet mindre generiskt än en enda bred aggregator-sökning och ger oftare riktiga artikel-URL:er direkt från källan.

## Sammanfattningsregler

Generatorn är nu striktare:

- Om riktig artikeltext går att extrahera används den som grund för en kort sammanfattning.
- Om artikeltexten är tunn men feedens egen beskrivning faktiskt säger något används den.
- Om varken artikeltext eller feedbeskrivning håller måttet hittas ingen blurb på — då blir det bara rubrik, källa, tid och länk i gränssnittet.

Kort sagt: hellre tyst än påhittat fluff.

## Arkitektur i korthet

- `scripts/update-news.mjs` hämtar flera direkta RSS-flöden per sektion, filtrerar ämnesrelevans, extraherar artikeltext och bygger en strukturerad payload med:
  - `site`
  - `summaryMeta`
  - `brief`
  - `sections`
  - `sources`
- Sammanfattningslagret försöker först använda Anthropic (`ANTHROPIC_API_KEY` i GitHub Actions) om nyckeln finns, men faller tillbaka till de regelbaserade sammanfattningarna utan att stoppa bygget.
- `docs/assets/app.js` renderar morgonbriefen och döljer tomma blurbs i stället för att visa generiskt utfyllnadstext.
- `docs/index.html` + `docs/assets/styles.css` står för det statiska gränssnittet.

## Lokal körning

```bash
npm run update-news
python3 -m http.server 8000 -d docs
```

Öppna sedan `http://localhost:8000`.

## Begränsningar

- Vissa sajter ger tunn eller stökig HTML även utan betalvägg; då blir sammanfattningarna medvetet sparsamma.
- Ett fåtal sektioner kan fortfarande få in gränsfall när en artikel ligger i skärningen mellan bevakningarna, särskilt kring Ukraina/EU och Iran/Trump.
- Anthropic-lagret förbättrar ton och sektionstexter, men kvaliteten i artikelraderna avgörs fortfarande främst av råkällorna och extraktionen.
