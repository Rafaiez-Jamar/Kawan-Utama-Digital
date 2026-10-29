drop policy if exists "workspace_delivery_read_all" on public.workspace_data;
create policy "workspace_delivery_read_all"
  on public.workspace_data for select to authenticated
  using (module = 'delivery');

drop policy if exists "workspace_delivery_insert_by_team" on public.workspace_data;
create policy "workspace_delivery_insert_by_team"
  on public.workspace_data for insert to authenticated
  with check (
    module = 'delivery'
    and (
      (auth.jwt() -> 'app_metadata' ->> 'role') in ('product', 'delivery')
      or (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales'
        and owner_email = auth.jwt() ->> 'email'
      )
    )
  );

drop policy if exists "workspace_delivery_update_by_team" on public.workspace_data;
create policy "workspace_delivery_update_by_team"
  on public.workspace_data for update to authenticated
  using (
    module = 'delivery'
    and (
      (auth.jwt() -> 'app_metadata' ->> 'role') in ('product', 'delivery')
      or (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales'
        and owner_email = auth.jwt() ->> 'email'
      )
    )
  )
  with check (
    module = 'delivery'
    and (
      (auth.jwt() -> 'app_metadata' ->> 'role') in ('product', 'delivery')
      or (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales'
        and owner_email = auth.jwt() ->> 'email'
      )
    )
  );