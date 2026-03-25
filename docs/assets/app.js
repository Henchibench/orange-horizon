const lastUpdated = document.querySelector('#last-updated');
const storyCount = document.querySelector('#story-count');
const sourceCount = document.querySelector('#source-count');
const siteNote = document.querySelector('#site-note');
const briefTitle = document.querySelector('#brief-title');
const briefIntro = document.querySelector('#brief-intro');
const briefBullets = document.querySelector('#brief-bullets');
const sourcesList = document.querySelector('#sources-list');
const sectionsList = document.querySelector('#sections-list');
const sectionTemplate = document.querySelector('#section-template');
const storyTemplate = document.querySelector('#story-template');

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Tid oklar';
  return new Intl.DateTimeFormat('sv-SE', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
};

const pluralizeArticles = (count) => `${count} ${count === 1 ? 'artikel' : 'artiklar'}`;

const render = async () => {
  const response = await fetch('./data/news.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Kunde inte läsa morgonbriefen: ${response.status}`);

  const data = await response.json();
  const totalStories = data.sections.reduce((sum, section) => sum + section.items.length, 0);

  document.title = data.site.title;
  lastUpdated.textContent = `Uppdaterad ${formatDate(data.generatedAt)}`;
  storyCount.textContent = `${totalStories} rubriker`;
  const totalFeeds = data.sources.reduce((sum, source) => sum + ((source.feedUrls && source.feedUrls.length) || 0), 0);
  sourceCount.textContent = `${totalFeeds || data.sources.length} källflöden`;
  siteNote.textContent = data.site.note;
  briefTitle.textContent = data.brief.title;
  briefIntro.textContent = data.brief.intro;

  briefBullets.replaceChildren();
  for (const bullet of data.brief.bullets) {
    const li = document.createElement('li');
    li.textContent = bullet;
    briefBullets.appendChild(li);
  }

  sourcesList.replaceChildren();
  for (const source of data.sources) {
    const a = document.createElement('a');
    a.href = `#section-${source.id}`;
    a.className = 'source-pill';
    a.textContent = source.name;
    sourcesList.appendChild(a);
  }

  sectionsList.replaceChildren();
  for (const section of data.sections) {
    const fragment = sectionTemplate.content.cloneNode(true);
    const article = fragment.querySelector('.section-card');
    article.id = `section-${section.id}`;
    fragment.querySelector('.section-kicker').textContent = section.label;
    fragment.querySelector('h2').textContent = section.name;
    fragment.querySelector('.section-description').textContent = section.description;
    fragment.querySelector('.section-summary').textContent = section.summary;

    const sectionFeed = fragment.querySelector('.section-feed');
    sectionFeed.href = section.feedUrl;
    sectionFeed.textContent = section.feedUrls?.length > 1 ? `Öppna huvudflöde (+${section.feedUrls.length - 1})` : 'Öppna RSS';

    const storiesWrap = fragment.querySelector('.stories-wrap');
    const storiesToggle = fragment.querySelector('.stories-toggle');
    storiesToggle.textContent = `Visa källartiklar (${pluralizeArticles(section.items.length)})`;

    storiesWrap.addEventListener('toggle', () => {
      storiesToggle.textContent = storiesWrap.open
        ? `Dölj källartiklar (${pluralizeArticles(section.items.length)})`
        : `Visa källartiklar (${pluralizeArticles(section.items.length)})`;
    });

    const stories = fragment.querySelector('.stories');
    for (const item of section.items) {
      const storyFragment = storyTemplate.content.cloneNode(true);
      storyFragment.querySelector('.source').textContent = item.source;
      storyFragment.querySelector('time').textContent = formatDate(item.pubDate);
      storyFragment.querySelector('h3').textContent = item.headline;
      const description = storyFragment.querySelector('.description');
      if (item.description) {
        description.textContent = item.description;
      } else {
        description.textContent = 'Ingen svensk sammanfattning värd namnet den här gången. Rubrik och originallänk får räcka.';
        description.classList.add('description-muted');
      }
      const resolvedUrl = item.actualUrl || item.link;
      const link = storyFragment.querySelector('.read-more');
      link.href = resolvedUrl;
      const directLink = storyFragment.querySelector('.direct-link');
      directLink.href = resolvedUrl;
      stories.appendChild(storyFragment);
    }

    sectionsList.appendChild(fragment);
  }
};

render().catch((error) => {
  lastUpdated.textContent = 'Lägesbilden gick i baklås.';
  const message = document.createElement('p');
  message.className = 'description';
  message.textContent = error.message;
  sectionsList.replaceChildren(message);
  console.error(error);
});
