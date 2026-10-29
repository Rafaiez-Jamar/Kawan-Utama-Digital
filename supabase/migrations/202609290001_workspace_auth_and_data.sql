create table if not exists public.mom (
  id bigserial primary key,
  created_by_email text not null,
  created_by_name text not null,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED')),
  client_name text not null,
  meeting_date date not null,
  meeting_time time,
  summary text,
  notes text,
  action_items text,
  pic_name text,
  deadline date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.attendance (
  id bigserial primary key,
  user_name text not null,
  user_email text not null,
  location_label text,
  latitude double precision,
  longitude double precision,
  attendance_type text,
  reason text,
  photo_data text,
  created_at timestamptz not null default now()
);

alter table public.attendance add column if not exists photo_data text;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  name text not null,
  role text not null check (role in ('sales', 'product', 'delivery', 'tech', 'admin', 'super-admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_data (
  module text not null check (module in ('funnel', 'rab', 'sph', 'delivery', 'sales-targets', 'product-requests')),
  record_id text not null,
  owner_email text,
  target_team text,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (module, record_id)
);

create index if not exists workspace_data_owner_idx on public.workspace_data (owner_email);
create index if not exists workspace_data_target_team_idx on public.workspace_data (target_team);

create table if not exists public.activity_records (
  id text primary key,
  event text not null check (event in ('login', 'photo')),
  user_name text not null,
  user_email text not null,
  role text not null check (role in ('sales', 'product', 'delivery', 'tech', 'admin', 'super-admin')),
  photo text not null default '',
  location_label text not null default '',
  latitude double precision,
  longitude double precision,
  attendance_type text,
  reason text not null default '',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.workspace_data enable row level security;
alter table public.activity_records enable row level security;
alter table public.mom enable row level security;
alter table public.attendance enable row level security;

revoke all on public.profiles, public.workspace_data, public.activity_records, public.mom, public.attendance from anon;
grant select, insert, update, delete on public.profiles, public.workspace_data, public.activity_records, public.mom, public.attendance to authenticated;

do $$
declare
  existing_policy record;
  has_attendance_columns boolean;
begin
  for existing_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'workspace_data', 'activity_records', 'mom', 'attendance', 'users')
  loop
    execute format('drop policy %I on %I.%I', existing_policy.policyname, existing_policy.schemaname, existing_policy.tablename);
  end loop;

  select count(*) = 9 into has_attendance_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'attendance'
    and column_name in ('id', 'user_name', 'user_email', 'location_label', 'latitude', 'longitude', 'attendance_type', 'reason', 'created_at');

  if has_attendance_columns then
    execute $copy$
      insert into public.activity_records (
        id, event, user_name, user_email, role, location_label,
        latitude, longitude, attendance_type, reason, created_at
      )
      select
        'legacy-attendance-' || a.id::text,
        'photo',
        a.user_name,
        a.user_email,
        coalesce(p.role, 'sales'),
        coalesce(a.location_label, ''),
        a.latitude,
        a.longitude,
        a.attendance_type,
        coalesce(a.reason, ''),
        a.created_at
      from public.attendance a
      left join public.profiles p on lower(p.email) = lower(a.user_email)
      on conflict (id) do nothing
    $copy$;
  end if;
end
$$;

drop policy if exists "profiles_read_self_or_admin" on public.profiles;
create policy "profiles_read_self_or_admin"
  on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'super-admin')
  );

drop policy if exists "workspace_data_read_by_role" on public.workspace_data;
create policy "workspace_data_read_by_role"
  on public.workspace_data for select to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'super-admin')
    or (
      module in ('funnel', 'rab', 'sph')
      and (
        (auth.jwt() -> 'app_metadata' ->> 'role') <> 'sales'
        or owner_email = auth.jwt() ->> 'email'
      )
    )
    or (
      module = 'sales-targets'
      and owner_email = auth.jwt() ->> 'email'
    )
    or (
      module = 'product-requests'
      and (
        owner_email = auth.jwt() ->> 'email'
        or target_team = auth.jwt() -> 'app_metadata' ->> 'role'
      )
    )
    or (
      module = 'delivery'
      and (auth.jwt() -> 'app_metadata' ->> 'role') = 'delivery'
    )
  );

drop policy if exists "workspace_data_insert_by_role" on public.workspace_data;
create policy "workspace_data_insert_by_role"
  on public.workspace_data for insert to authenticated
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'super-admin')
    or (
      module = 'funnel'
      and (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales'
      and owner_email = auth.jwt() ->> 'email'
    )
    or (
      module in ('rab', 'sph')
      and (
        (
          (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales'
          and owner_email = auth.jwt() ->> 'email'
        )
        or (auth.jwt() -> 'app_metadata' ->> 'role') = 'product'
      )
    )
    or (
      module = 'product-requests'
      and (
        (
          (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales'
          and owner_email = auth.jwt() ->> 'email'
        )
        or target_team = auth.jwt() -> 'app_metadata' ->> 'role'
      )
    )
    or (
      module = 'delivery'
      and (auth.jwt() -> 'app_metadata' ->> 'role') = 'delivery'
    )
  );

drop policy if exists "activity_records_read_by_role" on public.activity_records;
create policy "activity_records_read_by_role"
  on public.activity_records for select to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'super-admin')
    or user_email = auth.jwt() ->> 'email'
  );

drop policy if exists "activity_records_insert_own" on public.activity_records;
create policy "activity_records_insert_own"
  on public.activity_records for insert to authenticated
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'super-admin'
    or (
      user_email = auth.jwt() ->> 'email'
      and role = auth.jwt() -> 'app_metadata' ->> 'role'
    )
  );

drop policy if exists "workspace_data_update_by_role" on public.workspace_data;
create policy "workspace_data_update_by_role"
  on public.workspace_data for update to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'super-admin')
    or (
      module in ('funnel', 'rab', 'sph')
      and (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales'
      and owner_email = auth.jwt() ->> 'email'
    )
    or (
      module in ('rab', 'sph')
      and (auth.jwt() -> 'app_metadata' ->> 'role') = 'product'
    )
    or (
      module = 'product-requests'
      and (
        owner_email = auth.jwt() ->> 'email'
        or target_team = auth.jwt() -> 'app_metadata' ->> 'role'
      )
    )
    or (
      module = 'delivery'
      and (auth.jwt() -> 'app_metadata' ->> 'role') = 'delivery'
    )
  )
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'super-admin')
    or (
      module = 'funnel'
      and (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales'
      and owner_email = auth.jwt() ->> 'email'
    )
    or (
      module in ('rab', 'sph')
      and (auth.jwt() -> 'app_metadata' ->> 'role') in ('sales', 'product')
      and (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'product'
        or owner_email = auth.jwt() ->> 'email'
      )
    )
    or (
      module = 'product-requests'
      and (
        owner_email = auth.jwt() ->> 'email'
        or target_team = auth.jwt() -> 'app_metadata' ->> 'role'
      )
    )
    or (
      module = 'delivery'
      and (auth.jwt() -> 'app_metadata' ->> 'role') = 'delivery'
    )
  );

drop policy if exists "workspace_data_delete_by_role" on public.workspace_data;
create policy "workspace_data_delete_by_role"
  on public.workspace_data for delete to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'super-admin')
    or (
      module in ('funnel', 'rab', 'sph', 'product-requests')
      and owner_email = auth.jwt() ->> 'email'
      or (
        module in ('rab', 'sph')
        and (auth.jwt() -> 'app_metadata' ->> 'role') = 'product'
      )
      or (
        module = 'product-requests'
        and target_team = auth.jwt() -> 'app_metadata' ->> 'role'
      )
    )
    or (
      module = 'delivery'
      and (auth.jwt() -> 'app_metadata' ->> 'role') = 'delivery'
    )
  );

drop policy if exists "mom_read_by_role" on public.mom;
create policy "mom_read_by_role"
  on public.mom for select to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'super-admin'
    or (
      (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'product')
      and status = 'PUBLISHED'
    )
    or created_by_email = auth.jwt() ->> 'email'
  );

drop policy if exists "mom_insert_own" on public.mom;
create policy "mom_insert_own"
  on public.mom for insert to authenticated
  with check (
    created_by_email = auth.jwt() ->> 'email'
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('sales', 'super-admin')
  );

drop policy if exists "mom_update_own_or_super_admin" on public.mom;
create policy "mom_update_own_or_super_admin"
  on public.mom for update to authenticated
  using (
    created_by_email = auth.jwt() ->> 'email'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales'
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'super-admin'
  )
  with check (
    created_by_email = auth.jwt() ->> 'email'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales'
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'super-admin'
  );

drop policy if exists "mom_delete_super_admin" on public.mom;
create policy "mom_delete_super_admin"
  on public.mom for delete to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super-admin');

drop policy if exists "attendance_read_by_role" on public.attendance;
create policy "attendance_read_by_role"
  on public.attendance for select to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'super-admin')
    or user_email = auth.jwt() ->> 'email'
  );

drop policy if exists "attendance_insert_own" on public.attendance;
create policy "attendance_insert_own"
  on public.attendance for insert to authenticated
  with check (user_email = auth.jwt() ->> 'email');
