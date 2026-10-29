drop policy if exists "attendance_update_own" on public.attendance;
create policy "attendance_update_own"
  on public.attendance for update to authenticated
  using (user_email = auth.jwt() ->> 'email')
  with check (user_email = auth.jwt() ->> 'email');