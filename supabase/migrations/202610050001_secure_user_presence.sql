create table if not exists public.user_presence (
  session_id text primary key,
  user_name text not null,
  user_email text not null,
  role text not null,
  login_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  is_online boolean not null default true
);

create index if not exists user_presence_last_seen_idx on public.user_presence (last_seen desc);
alter table public.user_presence enable row level security;
revoke all on public.user_presence from anon, authenticated;
grant select, insert, update, delete on public.user_presence to authenticated;

do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_presence'
  loop
    execute format('drop policy %I on public.user_presence', existing_policy.policyname);
  end loop;
end
$$;

create policy "presence_read_by_role"
on public.user_presence
for select to authenticated
using (
  (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'super-admin')
  or lower(user_email) = lower(auth.jwt() ->> 'email')
);

create policy "presence_insert_own"
on public.user_presence
for insert to authenticated
with check (
  lower(user_email) = lower(auth.jwt() ->> 'email')
  and role = auth.jwt() -> 'app_metadata' ->> 'role'
);

create policy "presence_update_own"
on public.user_presence
for update to authenticated
using (
  lower(user_email) = lower(auth.jwt() ->> 'email')
  and role = auth.jwt() -> 'app_metadata' ->> 'role'
)
with check (
  lower(user_email) = lower(auth.jwt() ->> 'email')
  and role = auth.jwt() -> 'app_metadata' ->> 'role'
);

create policy "presence_delete_own_or_admin"
on public.user_presence
for delete to authenticated
using (
  lower(user_email) = lower(auth.jwt() ->> 'email')
  or (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'super-admin')
);
