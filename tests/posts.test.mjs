import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePost, validatePhotos, isPublicKey, photoUrl, publishPost } from '../assets/posts.js';

test('rejects invalid content and unsupported or oversized uploads', () => {
  assert.throws(() => validatePost('  ', 'Text', []));
  assert.throws(() => validatePost('Titel', 'x'.repeat(10001), []));
  assert.throws(() => validatePhotos([{ type: 'image/svg+xml', size: 20 }]));
  assert.throws(() => validatePhotos([{ type: 'image/jpeg', size: 5242881 }]));
  assert.throws(() => validatePhotos(Array(6).fill({ type: 'image/png', size: 10 })));
  assert.doesNotThrow(() => validatePost('Ausflug', 'Heute waren wir im Wald.', [{ type: 'image/jpeg', size: 500 }]));
});

test('only public keys are accepted, never service-role JWTs or secret keys', () => {
  const jwt = role => `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.sig`;
  assert.equal(isPublicKey(jwt('anon')), true);
  assert.equal(isPublicKey(jwt('service_role')), false);
  assert.equal(isPublicKey('sb_secret_example'), false);
  assert.equal(isPublicKey('sb_publishable_example'), true);
  assert.equal(isPublicKey('garbage'), false);
});

test('photo paths cannot inject external URLs or traverse storage paths', () => {
  const client = { storage: { from: () => ({ getPublicUrl: path => ({ data: { publicUrl: `https://example.supabase.co/${path}` } }) }) } };
  assert.equal(photoUrl(client, 'javascript:alert(1)'), null);
  assert.equal(photoUrl(client, '../../private/photo.jpg'), null);
  assert.equal(photoUrl(client, 'https://other.test/a.webp'), null);
  const id = '11111111-1111-4111-8111-111111111111';
  assert.equal(photoUrl(client, `${id}/${id}/${id}.webp`), `https://example.supabase.co/${id}/${id}/${id}.webp`);
});

test('an uncertain database response can be retried without duplicate posts', async () => {
  const records = new Map();
  let calls = 0;
  const client = { from: () => ({
    upsert: async (payload, options) => {
      assert.equal(options.ignoreDuplicates, true);
      if (!records.has(payload.id)) records.set(payload.id, payload);
      calls++;
      return { error: calls === 1 ? new Error('Response lost after commit') : null };
    },
    select: () => ({ eq: (_, id) => ({ single: async () => ({ data: records.get(id), error: null }) }) }),
  }) };
  const pending = { id: 'stable-id', author_id: 'admin', title: 'Test', body: 'Text', files: [], photos: [] };
  await assert.rejects(() => publishPost(client, pending));
  assert.equal(records.size, 1);
  await publishPost(client, pending);
  assert.equal(records.size, 1);
});

test('already uploaded photos are reused when publishing is retried', async () => {
  const client = { from: () => ({
    upsert: async payload => { assert.deepEqual(payload.photos, ['already-uploaded']); return { error: null }; },
    select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'id' }, error: null }) }) }),
  }) };
  await publishPost(client, { id: 'id', author_id: 'admin', title: 'T', body: 'B', files: [{}], photos: ['already-uploaded'] });
});

test('publication is not reported successful until the stored record can be read', async () => {
  const client = { from: () => ({
    upsert: async () => ({ error: null }),
    select: () => ({ eq: () => ({ single: async () => ({ data: null, error: new Error('Network unavailable') }) }) }),
  }) };
  await assert.rejects(() => publishPost(client, { id: 'id', files: [], photos: [] }));
});
