drop policy if exists "attendance_read_by_role" on public.attendance;
create policy "attendance_read_by_role"
  on public.attendance for select to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'super-admin'
    or lower(user_email) = lower(auth.jwt() ->> 'email')
  );

drop policy if exists "presence_read_by_role" on public.user_presence;
create policy "presence_read_by_role"
  on public.user_presence for select to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'super-admin'
    or lower(user_email) = lower(auth.jwt() ->> 'email')
  );

drop policy if exists "presence_delete_own_or_admin" on public.user_presence;
create policy "presence_delete_own_or_super_admin"
  on public.user_presence for delete to authenticated
  using (
    lower(user_email) = lower(auth.jwt() ->> 'email')
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'super-admin'
  );