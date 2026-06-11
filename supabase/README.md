# Supabase Setup

## 1. Create Project

1. Open https://supabase.com/dashboard/projects.
2. Create a new project, choose the nearest region, and save the generated database password securely.
3. Wait until the project status is healthy.

## 2. Run SQL

In the Supabase dashboard, open SQL Editor and execute these files in order:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/seeds/001_seed_bbt_s01e01.sql`

The migration creates the core tables, `pg_trgm` search support, full-text indexes, and the `search_subtitle_lines` RPC. RLS is intentionally left disabled for the first import/search validation pass.

## 3. Create Storage Buckets

Create these buckets in Storage:

- `subtitle-sources`: private, for original subtitle files.
- `public-assets`: public, for posters, placeholder images, covers, and OG images.
- `authorized-video`: private, reserved for future authorized video assets.

## 4. Copy Environment Variables

Copy `.env.example` to `.env.local`, then fill values from Project Settings:

- `NEXT_PUBLIC_SUPABASE_URL`: Project Settings > API > Project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Project Settings > API > anon public key.
- `SUPABASE_SERVICE_ROLE_KEY`: Project Settings > API > service_role key. Keep this server-side only.
- `DATABASE_URL`: Project Settings > Database > Connection string. Use the pooler URL for app/runtime access unless a direct connection is needed for migrations.
