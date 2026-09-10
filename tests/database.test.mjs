import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const modulePath = process.env.PGLITE_MODULE;
test('PostgreSQL enforces admin-only writes and validates photo ownership', { skip: !modulePath }, async () => {
  const { PGlite } = await import(modulePath);
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema storage;
      create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, public, storage to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id bigint generated always as identity, bucket_id text, name text);
      alter table storage.objects enable row level security;
      grant all on storage.objects to anon, authenticated;
      grant usage on all sequences in schema storage to anon, authenticated;
      create function storage.foldername(name text) returns text[] language sql immutable as
        $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1)-1] $$;
      insert into auth.users values
        ('11111111-1111-4111-8111-111111111111', 'test@test.at', now()),
        ('22222222-2222-4222-8222-222222222222', 'other@example.test', now());
    `);
    await db.exec(await readFile(new URL('../supabase/setup.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../supabase/grant-admin.sql', import.meta.url), 'utf8'));
    const admin = '11111111-1111-4111-8111-111111111111';
    const other = '22222222-2222-4222-8222-222222222222';
    const post = '33333333-3333-4333-8333-333333333333';
    const photo = `${admin}/${post}/44444444-4444-4444-8444-444444444444.webp`;
    const switchRole = async (role, id = '') => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
      await db.exec(`set role ${role}`);
    };
    await switchRole('anon');
    await assert.rejects(() => db.exec(`insert into public.posts(id,title,body) values ('${post}','A','B')`));
    await assert.rejects(() => db.query('select * from private.site_admins'));
    await assert.rejects(() => db.query('insert into storage.objects(bucket_id,name) values ($1,$2)', ['post-photos', photo]));

    await switchRole('authenticated', other);
    assert.equal((await db.query('select public.is_site_admin() as allowed')).rows[0].allowed, false);
    await assert.rejects(() => db.exec(`insert into public.posts(id,author_id,title,body) values ('${post}','${other}','A','B')`));
    await assert.rejects(() => db.query('insert into storage.objects(bucket_id,name) values ($1,$2)', ['post-photos', photo]));
    await assert.rejects(() => db.query('insert into private.site_admins values ($1)', [other]));

    await switchRole('authenticated', admin);
    assert.equal((await db.query('select public.is_site_admin() as allowed')).rows[0].allowed, true);
    await assert.rejects(() => db.query('insert into public.posts(id,author_id,title,body,photos) values ($1,$2,$3,$4,$5)', [post, other, 'A', 'B', []]));
    await assert.rejects(() => db.query('insert into public.posts(id,author_id,title,body,photos) values ($1,$2,$3,$4,$5)', [post, admin, 'A', 'B', ['../../secret']]));
    await assert.rejects(() => db.query('insert into public.posts(id,author_id,title,body,photos) values ($1,$2,$3,$4,$5)', [post, admin, 'A', 'B', Array(6).fill(photo)]));
    await db.query('insert into storage.objects(bucket_id,name) values ($1,$2)', ['post-photos', photo]);
    await assert.rejects(() => db.query('insert into storage.objects(bucket_id,name) values ($1,$2)', ['post-photos', photo.replace(admin, other)]));
    await db.query('insert into public.posts(id,author_id,title,body,photos) values ($1,$2,$3,$4,$5) on conflict(id) do nothing', [post, admin, 'Ausflug', 'Unser Text', [photo]]);
    await db.query('insert into public.posts(id,author_id,title,body,photos) values ($1,$2,$3,$4,$5) on conflict(id) do nothing', [post, admin, 'Ausflug', 'Unser Text', [photo]]);
    assert.equal((await db.query('select id from public.posts')).rows.length, 1);
    await assert.rejects(() => db.exec(`update public.posts set body='changed' where id='${post}'`));
    await switchRole('anon');
    assert.equal((await db.query('select title,body,photos from public.posts')).rows[0].title, 'Ausflug');
    await assert.rejects(() => db.query('select author_id from public.posts'));
    await assert.rejects(() => db.query('delete from public.posts'));
  } finally { await db.close(); }
});
