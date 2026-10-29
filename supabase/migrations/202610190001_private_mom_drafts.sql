drop policy if exists "mom_read_by_role" on public.mom;
create policy "mom_read_by_role"
  on public.mom for select to authenticated
  using (
    status = 'PUBLISHED'
    or (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales'
      and created_by_email = auth.jwt() ->> 'email'
      and status = 'DRAFT'
    )
  );

drop policy if exists "mom_insert_own" on public.mom;
create policy "mom_insert_own"
  on public.mom for insert to authenticated
  with check (
    created_by_email = auth.jwt() ->> 'email'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales'
  );

drop policy if exists "mom_update_own_or_super_admin" on public.mom;
create policy "mom_update_own_or_super_admin"
  on public.mom for update to authenticated
  using (
    (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales'
      and created_by_email = auth.jwt() ->> 'email'
    )
    or (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'super-admin'
      and status = 'PUBLISHED'
    )
  )
  with check (
    (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales'
      and created_by_email = auth.jwt() ->> 'email'
    )
    or (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'super-admin'
      and status = 'PUBLISHED'
    )
  );

drop policy if exists "mom_delete_super_admin" on public.mom;
create policy "mom_delete_super_admin"
  on public.mom for delete to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'super-admin'
    and status = 'PUBLISHED'
  );