export const PHOTO_BUCKET = 'post-photos';
export const MAX_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PAGE_SIZE = 10;

export function validatePost(title, body, files) {
  if (!title.trim() || title.trim().length > 160) throw new Error('Bitte einen Titel mit höchstens 160 Zeichen eingeben.');
  if (!body.trim() || body.trim().length > 10000) throw new Error('Bitte einen Text mit höchstens 10.000 Zeichen eingeben.');
  validatePhotos(files);
}

export function validatePhotos(files) {
  if (files.length > MAX_PHOTOS) throw new Error('Bitte höchstens 5 Fotos auswählen.');
  for (const file of files) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Bitte nur JPG-, PNG- oder WebP-Fotos auswählen.');
    if (!file.size || file.size > MAX_PHOTO_BYTES) throw new Error('Jedes Foto darf höchstens 5 MB groß sein.');
  }
}

export function isPublicKey(key) {
  if (key.startsWith('sb_publishable_')) return true;
  try {
    const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role === 'anon';
  } catch { return false; }
}

export function photoUrl(client, path) {
  if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.webp$/.test(path)) return null;
  return client.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

export function renderPost(post, client) {
  const article = document.createElement('article');
  article.className = 'post-card';
  const time = document.createElement('time');
  const date = new Date(post.created_at);
  time.dateTime = date.toISOString();
  time.textContent = new Intl.DateTimeFormat('de-AT', { dateStyle: 'long' }).format(date);
  const title = document.createElement('h3');
  title.textContent = post.title;
  const body = document.createElement('p');
  body.className = 'post-body';
  body.textContent = post.body;
  article.append(time, title, body);
  if (post.photos?.length) {
    const photos = document.createElement('div');
    photos.className = 'post-photos';
    post.photos.forEach((path, index) => {
      const url = photoUrl(client, path);
      if (!url) return;
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', `Foto ${index + 1} zu „${post.title}“ in voller Größe öffnen`);
      const image = document.createElement('img');
      image.src = url;
      image.alt = `${post.title} – Foto ${index + 1}`;
      image.loading = 'lazy';
      image.decoding = 'async';
      link.append(image);
      photos.append(link);
    });
    article.append(photos);
  }
  return article;
}

// Decode and re-encode photos, stripping camera metadata and limiting image dimensions.
export async function preparePhoto(file) {
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('Ein Foto konnte nicht gelesen werden. Bitte eine andere Datei auswählen.'); }
  try {
    if (bitmap.width * bitmap.height > 50000000) throw new Error('Ein Foto ist zu hoch aufgelöst. Bitte vor dem Hochladen verkleinern.');
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.86));
    if (!blob || blob.type !== 'image/webp' || blob.size > MAX_PHOTO_BYTES) throw new Error('Das Foto konnte nicht vorbereitet werden. Bitte ein kleineres Foto wählen.');
    return blob;
  } finally { bitmap.close(); }
}

// Keep the pending ID and uploaded paths on failure. Retrying never creates a duplicate post.
export async function publishPost(client, pending, onProgress = () => {}) {
  for (let i = 0; i < pending.files.length; i++) {
    if (pending.photos[i]) continue;
    onProgress(`Foto ${i + 1} von ${pending.files.length} wird hochgeladen …`);
    const blob = await preparePhoto(pending.files[i]);
    const path = `${pending.author_id}/${pending.id}/${crypto.randomUUID()}.webp`;
    const { error } = await client.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/webp', upsert: false });
    if (error) throw error;
    pending.photos[i] = path;
  }
  onProgress('Beitrag wird veröffentlicht …');
  const payload = { id: pending.id, author_id: pending.author_id, title: pending.title, body: pending.body, photos: pending.photos };
  const { error } = await client.from('posts').upsert(payload, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw error;
  // Confirm the record actually exists before telling the admin that it was published.
  const { data, error: readError } = await client.from('posts').select('id').eq('id', pending.id).single();
  if (readError || !data) throw readError || new Error('Die Veröffentlichung konnte noch nicht bestätigt werden.');
  return data;
}
