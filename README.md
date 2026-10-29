# Kawan Utama Digital

## Local PostgreSQL development

The application now uses a local Node API (`127.0.0.1:3001`) that connects to PostgreSQL; browser code does not connect directly to PostgreSQL or Supabase. Run this only on a trusted development computer.

```bash
npm run dev
```

If `.env.local` does not exist, copy `.env.example` to create it. If it already exists, preserve it and add only the needed `PG*` settings. Configure `PGUSER` to match the local PostgreSQL role; the default database name is `kawan_local_dev`. Set `PGPASSWORD` only if that role requires one. The local API binds to loopback and should not be exposed to a public network.

On first start, the API copies supported account records and existing password hashes from the restored `auth.users` snapshot into local-only `local_accounts`. It creates local sessions and does not change or contact the Supabase project. New local accounts and changes made while using this setup are stored only in PostgreSQL on this computer.

This is a temporary development backend, not a production replacement for Supabase Auth, Storage, Realtime, or Edge Functions. Keep the Supabase project and original dump as untouched backups. `storage.objects` was empty in the imported backup; the app's local API does not provide Supabase Storage or Realtime services.

### Temporary Vercel + ngrok publishing

This setup publishes the frontend on Vercel and forwards its same-origin `/api/*` requests through a Vercel server function to the API running on this laptop. PostgreSQL remains on the laptop. The API listens only on `127.0.0.1`; in production mode it rejects requests without a shared proxy secret, including requests made directly to the public ngrok URL.

This is a temporary bridge, not a production hosting setup. The laptop, PostgreSQL, API process, and ngrok tunnel must stay online and awake for the app to work. Anyone with the Vercel URL can reach the login screen, so only share it with intended users and use strong account passwords. Vercel Functions limit requests to about 4 MB here; larger attendance-photo uploads may fail. Keep separate database backups.

1. Push this project to a private GitHub repository and import it into Vercel. Use the repository root as the project root and select Node.js 22 for the build/runtime.
2. Install and authenticate ngrok from its official download page. Reserve a stable HTTPS domain in the ngrok dashboard; a changing temporary URL would require updating Vercel after each tunnel restart.
3. Generate a long random shared secret in Terminal with `openssl rand -hex 32`. Add it as `API_PROXY_SECRET` in the ignored local `.env.local` file and as a **Production** environment variable named `API_PROXY_SECRET` in Vercel. Never put this value in frontend variables such as `VITE_*`, source code, or Git.
4. In Vercel Production environment variables, set `LOCAL_API_URL` to the reserved HTTPS ngrok origin, for example `https://your-reserved-domain.ngrok-free.app` (no `/api` suffix). Redeploy after setting these variables.
5. Stop the regular `npm run dev` process. Start the API in protected mode with `npm run tunnel:api`, then in a second Terminal window run `ngrok http --domain=your-reserved-domain.ngrok-free.app 3001`.
6. Open the Vercel deployment URL and sign in. Check that `https://your-vercel-domain/api/health` responds with `{"status":"ok","database":"connected"}`. A direct request to `https://your-reserved-domain.ngrok-free.app/api/health` should return HTTP 403; do not disable this protection.
7. Leave the laptop plugged in, prevent it from sleeping, and keep PostgreSQL, `npm run tunnel:api`, and ngrok running while clients use the site. To return to local development, stop the tunnel API and restart `npm run dev`.

The Vercel function in `api/[...path].js` keeps the tunnel URL and proxy secret server-side and streams responses back to the browser. The SPA fallback deliberately excludes `/api/*` so API requests reach that function instead of returning the frontend HTML. The public frontend does not receive either value.

### Supabase reference

Supabase migration scripts and setup notes remain in this repository for reference. Do not run deployment or migration commands against the live Supabase project as part of local development.

### Local data

Login, user profiles, attendance, MOM, online presence, Product requests/RAB, SPH, and Delivery are routed through the local API. Existing browser-side Product/RAB, SPH, and Delivery records are retained and may be synchronized into the local `workspace_data` table as those modules load. Delivery keeps the existing `kawan-delivery-items` key; WIN SPH orders seed the delivery queue when no corresponding delivery record exists. No Supabase source data is deleted or overwritten.

### SPH statuses and results

SPH has three statuses: **Pending**, **WIN**, and **LOSE**. A new SPH starts as Pending. Sales can mark each SPH as WIN or LOSE; WIN records the result date and its net offer value contributes to that owner's current-month sales target. Admin and Super Admin can also correct the result. Legacy SPH statuses are normalized when loaded: WIN remains WIN, LOSS becomes LOSE, and unfinished workflow statuses become Pending.

### Exporting RAB and SPH

RAB records are grouped by owner in the RAB table; each owner with RAB entries has an export action for a formatted document containing all of that owner's RAB items, customer details, quantities, pricing, tax totals, and available stock. SPH records can be printed or saved as PDF from their detail panel. In the browser's print dialog, choose “Save as PDF” to download either document.

### Monthly Sales targets

Admin and Super Admin can set each Sales account's monthly target from the **Target Sales** menu. A Sales user's Dashboard shows the total value of their SPH records marked **WIN** during the current calendar month, compared with that target. The progress bar is red below 50%, yellow from 50% up to the target, and green at or above 100%.

New WIN status changes record their `wonAt` timestamp. For older SPH records already marked WIN without a `wonAt`, the dashboard uses `createdAt` as a best-effort month fallback because the original win date was not recorded.

## Other development commands

```bash
npm install
npm run dev:api
npm run dev:web
```

`npm run dev` starts the API and Vite together. For debugging, run `dev:api` and `dev:web` separately.

## Template reference

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
