create or replace function public.next_rab_number(p_business_type text, p_date date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_value integer;
begin
  if p_business_type not in ('B2B', 'B2G') then
    raise exception 'Jenis dokumen RAB tidak valid.';
  end if;

  if (auth.jwt() -> 'app_metadata' ->> 'role') not in ('product', 'admin', 'super-admin') then
    raise exception 'Role ini tidak dapat membuat nomor RAB.';
  end if;

  insert into public.rab_number_counters (business_type, number_date, last_value)
  values (p_business_type, p_date, 1)
  on conflict (business_type, number_date)
  do update set last_value = rab_number_counters.last_value + 1
  returning last_value into next_value;

  return format('%s/%s-%s', p_business_type, lpad(next_value::text, 3, '0'), to_char(p_date, 'DD-MM-YY'));
end;
$$;

revoke all on function public.next_rab_number(text, date) from public, anon;
grant execute on function public.next_rab_number(text, date) to authenticated;