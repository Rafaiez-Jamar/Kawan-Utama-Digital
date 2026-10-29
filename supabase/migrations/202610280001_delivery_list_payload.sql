create or replace function public.get_delivery_workspace_rows(p_modules text[])
returns table (
  module text,
  record_id text,
  owner_email text,
  target_team text,
  payload jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    workspace.module,
    workspace.record_id,
    workspace.owner_email,
    workspace.target_team,
    case
      when workspace.module = 'delivery'
        then workspace.payload - 'proofPhoto' - 'locationHistory'
      else workspace.payload
    end
  from public.workspace_data as workspace
  where workspace.module = any(p_modules);
$$;

revoke all on function public.get_delivery_workspace_rows(text[]) from public, anon;
grant execute on function public.get_delivery_workspace_rows(text[]) to authenticated;
