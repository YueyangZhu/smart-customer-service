# Smart Customer Service

React + Express after-sales customer service demo.

## Local development

```bash
pnpm install
pnpm dev
```

Without `DATABASE_URL`, the API uses an in-memory demo store. With `DATABASE_URL`, it uses Supabase/Postgres.

## Environment

Backend:

- `DATABASE_URL`
- `COZE_API_TOKEN`
- `COZE_BOT_ID=7653375037604380691`
- `FRONTEND_ORIGIN`

Frontend:

- `VITE_API_BASE`

## Supabase

Run `supabase/migrations/202606280001_initial_schema.sql` in Supabase SQL editor or through the Supabase CLI.

## Render

Use `render.yaml` as a Blueprint after pushing this repo to GitHub.
