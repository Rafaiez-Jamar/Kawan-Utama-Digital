CREATE TABLE IF NOT EXISTS public.user_presence (
  session_id text PRIMARY KEY,
  user_name text NOT NULL,
  user_email text NOT NULL,
  role text NOT NULL,
  login_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  is_online boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS user_presence_last_seen_idx ON public.user_presence (last_seen DESC);
ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.user_presence FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_presence TO authenticated;

DO $$
DECLARE
  existing_policy record;
BEGIN
  FOR existing_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_presence'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.user_presence', existing_policy.policyname);
  END LOOP;
END
$$;

CREATE POLICY "presence_read_by_role"
ON public.user_presence
FOR SELECT TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super-admin'
  OR lower(user_email) = lower(auth.jwt() ->> 'email')
);

CREATE POLICY "presence_insert_own"
ON public.user_presence
FOR INSERT TO authenticated
WITH CHECK (
  lower(user_email) = lower(auth.jwt() ->> 'email')
  AND role = auth.jwt() -> 'app_metadata' ->> 'role'
);

CREATE POLICY "presence_update_own"
ON public.user_presence
FOR UPDATE TO authenticated
USING (
  lower(user_email) = lower(auth.jwt() ->> 'email')
  AND role = auth.jwt() -> 'app_metadata' ->> 'role'
)
WITH CHECK (
  lower(user_email) = lower(auth.jwt() ->> 'email')
  AND role = auth.jwt() -> 'app_metadata' ->> 'role'
);

CREATE POLICY "presence_delete_own_or_super_admin"
ON public.user_presence
FOR DELETE TO authenticated
USING (
  lower(user_email) = lower(auth.jwt() ->> 'email')
  OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super-admin'
);
