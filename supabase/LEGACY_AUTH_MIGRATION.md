# Migrating legacy users to Supabase Auth

The web app no longer reads passwords from `public.users`. Migrate the existing accounts once before signing in with the app.

1. Apply the database migrations:

   ```sh
   supabase db push
   ```

2. Create a long, random one-time secret and configure it for the Edge Function. Never put this secret or the Supabase service-role key in `VITE_*` variables.

   ```sh
   supabase secrets set LEGACY_MIGRATION_SECRET='<one-time-random-secret>'
   ```

   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied to deployed Supabase Edge Functions by the platform.

3. Link the Supabase CLI to the project and deploy the privileged function. `supabase/config.toml` disables the platform JWT check for this function because legacy migration uses a one-time secret; normal user-management actions verify the caller's Supabase access token and admin role inside the function.

   ```sh
   supabase link --project-ref <project-ref>
   supabase functions deploy user-admin
   ```

   The `user-admin` function must be deployed before the app can create, update, or delete accounts. Verify that its status is active in Supabase Dashboard → Edge Functions.

4. Call its migration action once, replacing the placeholders with the project URL, publishable key, and one-time secret. The publishable key is not a service-role key.

   ```sh
   curl --fail-with-body --request POST \
     --url 'https://<project-ref>.supabase.co/functions/v1/user-admin' \
     --header 'Content-Type: application/json' \
     --header 'apikey: <publishable-key>' \
     --header 'x-legacy-migration-secret: <one-time-random-secret>' \
     --data '{"action":"migrate-legacy"}'
   ```

   Confirm that `failed` is empty and `migrated` contains every legacy account. Existing Auth accounts are linked by email; their current Auth passwords are preserved. Newly created Auth accounts use the legacy password and should reset it after first sign-in.

5. Remove the one-time migration secret with `supabase secrets unset LEGACY_MIGRATION_SECRET`, then drop the old plaintext password column by running `supabase/finalize-legacy-users.sql` in the Supabase SQL Editor. Do this only after all accounts have migrated successfully.

The app uses Supabase Auth for sign-in. Admin user management uses the `user-admin` Edge Function; only authenticated admins can create, update, or delete accounts. The service-role key must remain server-side.
