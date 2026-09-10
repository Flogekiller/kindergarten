import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { isPublicKey } from './posts.js';

export function createSiteClient(admin = false) {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return null;
  const url = new URL(SUPABASE_URL);
  if (url.protocol !== 'https:' || url.username || url.password || !isPublicKey(SUPABASE_PUBLISHABLE_KEY)) {
    throw new Error('Die Verbindung ist noch nicht korrekt eingerichtet.');
  }
  if (!globalThis.supabase?.createClient) throw new Error('Die Verbindung konnte nicht geladen werden. Bitte die Seite neu laden.');
  return globalThis.supabase.createClient(url.origin, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: admin,
      autoRefreshToken: admin,
      detectSessionInUrl: false,
      ...(admin ? { storage: sessionStorage, storageKey: 'mettmach-admin-session' } : {}),
    },
  });
}
