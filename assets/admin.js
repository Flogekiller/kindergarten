import { createSiteClient } from './client.js';
import { validatePost, validatePhotos, publishPost, renderPost } from './posts.js';

const $ = id => document.getElementById(id);
const status = $('admin-status');
const loginPanel = $('login-panel');
const editorPanel = $('editor-panel');
const postForm = $('post-form');
const loginForm = $('login-form');
const photoInput = $('post-photos');
const publishStatus = $('publish-status');
let client;
let user;
let pending = null;
let busy = false;
let previewUrls = [];
let authCheck = 0;

function message(element, text, error = false) {
  element.textContent = text;
  element.classList.toggle('error', error);
}
function clearPreviews() {
  previewUrls.forEach(url => URL.revokeObjectURL(url));
  previewUrls = [];
  $('photo-preview').replaceChildren();
}
function lockSavedDraft(locked) {
  ['post-title', 'post-body', 'post-photos'].forEach(id => { $(id).disabled = locked; });
}
async function showSession(session) {
  const check = ++authCheck;
  user = null;
  editorPanel.hidden = true;
  loginPanel.hidden = !!session;
  if (!session) {
    message(status, 'Bitte melde dich mit deinem Admin-Konto an.');
    return;
  }
  message(status, 'Admin-Berechtigung wird geprüft …');
  try {
    // This RPC checks a server-owned allowlist; email and browser state grant no permissions.
    const { data, error } = await client.rpc('is_site_admin');
    if (check !== authCheck) return;
    if (error) throw error;
    if (data !== true) {
      await client.auth.signOut({ scope: 'local' });
      message(status, 'Dieses Konto hat keine Admin-Berechtigung.', true);
      loginPanel.hidden = false;
      return;
    }
    user = session.user;
    $('admin-email').textContent = user.email;
    loginPanel.hidden = true;
    editorPanel.hidden = false;
    message(status, '');
    await loadPosts();
  } catch {
    if (check !== authCheck) return;
    loginPanel.hidden = false;
    message(status, 'Die Berechtigung konnte nicht geprüft werden. Bitte erneut anmelden.', true);
  }
}
async function loadPosts() {
  const target = $('admin-posts-status');
  message(target, 'Beiträge werden geladen …');
  try {
    const { data, error } = await client.from('posts').select('id,title,body,photos,created_at')
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(10);
    if (error) throw error;
    $('admin-posts').replaceChildren(...data.map(post => renderPost(post, client)));
    message(target, data.length ? 'Die neuesten Beiträge.' : 'Noch keine Beiträge veröffentlicht.');
  } catch { message(target, 'Beiträge konnten nicht geladen werden. Bitte die Seite später neu laden.', true); }
}
loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  $('login-fields').disabled = true;
  message(status, 'Anmeldung läuft …');
  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: $('email').value.trim(), password: $('password').value,
    });
    if (error) throw error;
    $('password').value = '';
    await showSession(data.session);
  } catch {
    message(status, 'Anmeldung fehlgeschlagen. Bitte E-Mail-Adresse, Passwort und Verbindung prüfen.', true);
  } finally { $('login-fields').disabled = false; }
});
$('logout').addEventListener('click', async () => {
  if (busy) return;
  if ((pending || $('post-title').value || $('post-body').value || photoInput.files.length) &&
      !confirm('Abmelden und den noch nicht veröffentlichten Beitrag verwerfen?')) return;
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) { message(status, 'Abmelden fehlgeschlagen. Bitte erneut versuchen.', true); return; }
  pending = null;
  postForm.reset();
  clearPreviews();
  lockSavedDraft(false);
  message(publishStatus, '');
  await showSession(null);
});
photoInput.addEventListener('change', () => {
  clearPreviews();
  photoInput.setCustomValidity('');
  try {
    validatePhotos([...photoInput.files]);
    for (const file of photoInput.files) {
      const url = URL.createObjectURL(file);
      previewUrls.push(url);
      const image = document.createElement('img');
      image.src = url;
      image.alt = `Vorschau: ${file.name}`;
      $('photo-preview').append(image);
    }
    message(publishStatus, '');
  } catch (error) {
    photoInput.setCustomValidity(error.message);
    message(publishStatus, error.message, true);
  }
});
postForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !user) return;
  const title = $('post-title').value.trim();
  const body = $('post-body').value.trim();
  const files = [...photoInput.files];
  try {
    if (!pending) {
      validatePost(title, body, files);
      pending = { id: crypto.randomUUID(), author_id: user.id, title, body, files, photos: [] };
    }
  } catch (error) { message(publishStatus, error.message, true); return; }
  if (pending.author_id !== user.id) {
    message(publishStatus, 'Bitte mit dem Konto anmelden, mit dem dieser Beitrag begonnen wurde.', true);
    return;
  }
  busy = true;
  $('post-fields').disabled = true;
  $('logout').disabled = true;
  try {
    await publishPost(client, pending, text => message(publishStatus, text));
    pending = null;
    postForm.reset();
    clearPreviews();
    photoInput.setCustomValidity('');
    message(publishStatus, 'Der Beitrag ist veröffentlicht und auf der Website sichtbar.');
    $('publish').textContent = 'Beitrag veröffentlichen';
    await loadPosts();
  } catch {
    message(publishStatus, 'Die Veröffentlichung konnte nicht abgeschlossen werden. Dein Beitrag bleibt hier erhalten. Bitte Verbindung prüfen und erneut versuchen; es entsteht kein doppelter Beitrag.', true);
    $('publish').textContent = 'Veröffentlichung erneut versuchen';
  } finally {
    busy = false;
    $('post-fields').disabled = false;
    $('logout').disabled = false;
    lockSavedDraft(!!pending);
  }
});
window.addEventListener('beforeunload', event => {
  if (pending || $('post-title').value || $('post-body').value || photoInput.files.length) {
    event.preventDefault(); event.returnValue = '';
  }
});
try {
  client = createSiteClient(true);
  if (!client) {
    message(status, 'Der Adminbereich ist noch nicht freigeschaltet. Die Supabase-Verbindung muss zuerst eingerichtet werden.');
  } else {
    client.auth.onAuthStateChange((event, session) => {
      // Avoid async Supabase calls inside its auth callback (which holds an internal lock).
      if (event === 'SIGNED_OUT') setTimeout(() => showSession(null), 0);
    });
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    await showSession(data.session);
  }
} catch {
  message(status, 'Der Adminbereich konnte nicht gestartet werden. Bitte Verbindung prüfen und die Seite neu laden.', true);
}
