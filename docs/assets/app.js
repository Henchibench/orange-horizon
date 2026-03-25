const list = document.querySelector('#news-list');
const template = document.querySelector('#item-template');
const lastUpdated = document.querySelector('#last-updated');
const sourceLink = document.querySelector('#source-link');

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
};

const render = async () => {
  const response = await fetch('./data/news.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load feed: ${response.status}`);
  }

  const data = await response.json();
  lastUpdated.textContent = `Last updated ${formatDate(data.generatedAt)}`;
  sourceLink.href = data.source;

  for (const item of data.items) {
    const fragment = template.content.cloneNode(true);
    fragment.querySelector('.source').textContent = item.source;
    fragment.querySelector('time').textContent = formatDate(item.pubDate);
    fragment.querySelector('h3').textContent = item.headline;
    fragment.querySelector('.description').textContent = item.description;
    const link = fragment.querySelector('.read-more');
    link.href = item.link;
    list.appendChild(fragment);
  }
};

render().catch((error) => {
  lastUpdated.textContent = 'The horizon is cloudy right now.';
  const message = document.createElement('p');
  message.className = 'description';
  message.textContent = error.message;
  list.replaceChildren(message);
  console.error(error);
});
