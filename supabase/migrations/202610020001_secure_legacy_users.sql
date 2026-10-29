do $$
declare
  existing_policy record;
begin
  if to_regclass('public.users') is not null then
    alter table public.users enable row level security;
    revoke all on public.users from anon, authenticated;

    for existing_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = 'users'
    loop
      execute format('drop policy %I on public.users', existing_policy.policyname);
    end loop;
  end if;
end
$$;

grant select on public.profiles to authenticated;
