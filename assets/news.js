import { createSiteClient } from './client.js';
import { PAGE_SIZE, renderPost } from './posts.js';

const status = document.getElementById('news-status');
const list = document.getElementById('news-list');
const more = document.getElementById('news-more');
let client;
let offset = 0;
let loading = false;
const seen = new Set();

async function load() {
  if (loading) return;
  loading = true;
  more.disabled = true;
  status.classList.remove('error');
  status.textContent = 'Beiträge werden geladen …';
  try {
    const { data, error } = await client.from('posts')
      .select('id,title,body,photos,created_at').order('created_at', { ascending: false })
      .order('id', { ascending: false }).range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    for (const post of data) {
      if (!seen.has(post.id)) { list.append(renderPost(post, client)); seen.add(post.id); }
    }
    offset += data.length;
    status.textContent = seen.size ? '' : 'Hier findet ihr bald Neuigkeiten aus unserem Kindergarten.';
    more.hidden = data.length < PAGE_SIZE;
    more.textContent = 'Weitere Beiträge laden';
  } catch {
    status.textContent = 'Die Beiträge können gerade nicht geladen werden. Bitte versucht es erneut.';
    status.classList.add('error');
    more.hidden = false;
    more.textContent = 'Erneut versuchen';
  } finally { loading = false; more.disabled = false; }
}
more.addEventListener('click', load);
try {
  client = createSiteClient();
  if (client) load();
  else status.textContent = 'Hier findet ihr bald Neuigkeiten aus unserem Kindergarten.';
} catch {
  status.textContent = 'Die Beiträge sind gerade nicht verfügbar.';
  status.classList.add('error');
}
