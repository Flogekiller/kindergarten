-- Run once in the SQL Editor of your Supabase project.
-- Access is tied to a user UUID in a private table, never to editable profile metadata.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.site_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
revoke all on private.site_admins from public, anon, authenticated;

create or replace function public.is_site_admin()
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from private.site_admins where user_id = (select auth.uid()));
$$;
revoke all on function public.is_site_admin() from public, anon;
grant execute on function public.is_site_admin() to authenticated;

create or replace function public.valid_post_photos(photos text[], author_id uuid, post_id uuid)
returns boolean language sql immutable set search_path = ''
as $$
  select cardinality(photos) <= 5 and not exists (
    select 1 from unnest(photos) as photo
    where photo is null or photo !~ (
      '^' || author_id::text || '/' || post_id::text || '/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$'
    )
  );
$$;

create table if not exists public.posts (
  id uuid primary key,
  author_id uuid not null default auth.uid() references auth.users(id),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body text not null check (char_length(btrim(body)) between 1 and 10000),
  photos text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint valid_photos check (public.valid_post_photos(photos, author_id, id))
);
create index if not exists posts_date_idx on public.posts(created_at desc, id desc);
alter table public.posts enable row level security;
revoke all on public.posts from anon, authenticated;
grant select (id, title, body, photos, created_at) on public.posts to anon, authenticated;
grant insert (id, author_id, title, body, photos) on public.posts to authenticated;

drop policy if exists "Anyone can read published posts" on public.posts;
create policy "Anyone can read published posts" on public.posts
for select to anon, authenticated using (true);
drop policy if exists "Admins can publish posts" on public.posts;
create policy "Admins can publish posts" on public.posts
for insert to authenticated with check (
  (select public.is_site_admin()) and author_id = (select auth.uid())
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-photos', 'post-photos', true, 5242880, array['image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins upload post photos" on storage.objects;
create policy "Admins upload post photos" on storage.objects
for insert to authenticated with check (
  bucket_id = 'post-photos' and (select public.is_site_admin())
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}\.webp$'
);
drop policy if exists "Admins inspect post photos" on storage.objects;
create policy "Admins inspect post photos" on storage.objects
for select to authenticated using (
  bucket_id = 'post-photos' and (select public.is_site_admin())
);
commit;
