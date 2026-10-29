with owner_matches as (
  select
    delivery.record_id,
    min(profile.email) as owner_email
  from public.workspace_data as delivery
  join public.profiles as profile
    on lower(btrim(profile.name)) = lower(coalesce(
      nullif(btrim(delivery.payload ->> 'sales'), ''),
      nullif(btrim(delivery.payload ->> 'owner'), '')
    ))
  where delivery.module = 'delivery'
    and nullif(btrim(delivery.owner_email), '') is null
    and coalesce(
      nullif(btrim(delivery.payload ->> 'sales'), ''),
      nullif(btrim(delivery.payload ->> 'owner'), '')
    ) is not null
  group by delivery.record_id
  having count(distinct lower(profile.email)) = 1
)
update public.workspace_data as delivery
set owner_email = owner_matches.owner_email,
    payload = jsonb_set(coalesce(delivery.payload, '{}'::jsonb), '{ownerEmail}', to_jsonb(owner_matches.owner_email), true)
from owner_matches
where delivery.module = 'delivery'
  and delivery.record_id = owner_matches.record_id
  and nullif(btrim(delivery.owner_email), '') is null;

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
      (auth.jwt() -> 'app_metadata' ->> 'role') in ('product', 'delivery', 'admin', 'super-admin')
      or (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales'
        and (
          lower(coalesce(owner_email, '')) = lower(auth.jwt() ->> 'email')
          or lower(coalesce(payload ->> 'ownerEmail', '')) = lower(auth.jwt() ->> 'email')
        )
      )
    )
  );

drop policy if exists "workspace_delivery_update_by_team" on public.workspace_data;
create policy "workspace_delivery_update_by_team"
  on public.workspace_data for update to authenticated
  using (
    module = 'delivery'
    and (
      (auth.jwt() -> 'app_metadata' ->> 'role') in ('product', 'delivery', 'admin', 'super-admin')
      or (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales'
        and (
          lower(coalesce(owner_email, '')) = lower(auth.jwt() ->> 'email')
          or lower(coalesce(payload ->> 'ownerEmail', '')) = lower(auth.jwt() ->> 'email')
        )
      )
    )
  )
  with check (
    module = 'delivery'
    and (
      (auth.jwt() -> 'app_metadata' ->> 'role') in ('product', 'delivery', 'admin', 'super-admin')
      or (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales'
        and (
          lower(coalesce(owner_email, '')) = lower(auth.jwt() ->> 'email')
          or lower(coalesce(payload ->> 'ownerEmail', '')) = lower(auth.jwt() ->> 'email')
        )
      )
    )
  );