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
alter table public.mom enable row level security;
alter table public.attendance enable row level security;
revoke all on public.mom, public.attendance from anon;
grant select, insert, update, delete on public.mom, public.attendance to authenticated;

do $$
begin
  if to_regclass('public.mom_id_seq') is not null then
    execute 'grant usage, select on sequence public.mom_id_seq to authenticated';
  end if;
  if to_regclass('public.attendance_id_seq') is not null then
    execute 'grant usage, select on sequence public.attendance_id_seq to authenticated';
  end if;
end
$$;
