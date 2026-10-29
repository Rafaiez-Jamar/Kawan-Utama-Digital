-- Run only after the user-admin Edge Function reports every legacy account migrated.
alter table public.users drop column if exists password;
