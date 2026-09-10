-- First create and confirm the user in Authentication > Users > Add user.
-- Run this separately AFTER setup.sql. Fails instead of silently creating no admin.
do $$
declare admin_id uuid;
begin
  select id into admin_id from auth.users
    where lower(email) = 'test@test.at' and email_confirmed_at is not null;
  if admin_id is null then
    raise exception 'Create and confirm test@test.at in Authentication > Users first.';
  end if;
  insert into private.site_admins(user_id) values (admin_id) on conflict do nothing;
end;
$$;
