create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists shows (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  original_title text not null,
  slug text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists episodes (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references shows(id),
  season_no int not null check (season_no > 0),
  episode_no int not null check (episode_no > 0),
  code text not null,
  title text,
  original_title text,
  air_date date,
  poster_object_key text,
  created_at timestamptz not null default now(),
  unique(show_id, season_no, episode_no)
);

create table if not exists subtitle_sources (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references episodes(id),
  language text not null,
  format text not null,
  source_name text,
  source_url text,
  storage_bucket text not null,
  object_key text not null,
  file_sha256 text not null,
  imported_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists subtitle_lines (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references episodes(id),
  line_index int not null check (line_index > 0),
  start_ms int not null check (start_ms >= 0),
  end_ms int not null check (end_ms >= 0),
  text_en text,
  text_zh text,
  speaker text,
  scene text,
  search_text text generated always as (
    coalesce(text_en, '') || ' ' || coalesce(text_zh, '') || ' ' || coalesce(speaker, '')
  ) stored,
  created_at timestamptz not null default now(),
  check (end_ms >= start_ms),
  unique(episode_id, line_index)
);

create table if not exists subtitle_segments (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references episodes(id),
  start_line_id uuid not null references subtitle_lines(id),
  end_line_id uuid not null references subtitle_lines(id),
  start_ms int not null check (start_ms >= 0),
  end_ms int not null check (end_ms >= 0),
  line_count int not null check (line_count > 0),
  summary text,
  created_at timestamptz not null default now(),
  check (end_ms >= start_ms)
);

create table if not exists segment_covers (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references subtitle_segments(id),
  storage_bucket text not null,
  object_key text not null,
  width int not null default 640 check (width > 0),
  height int not null default 360 check (height > 0),
  captured_at_ms int not null check (captured_at_ms >= 0),
  source_type text not null default 'private_extract',
  license_status text not null default 'private_only',
  blur_data_url text,
  created_at timestamptz not null default now(),
  unique(segment_id)
);

create table if not exists segment_assets (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references subtitle_segments(id),
  asset_type text not null,
  storage_bucket text,
  object_key text,
  external_url text,
  license_status text not null default 'unknown',
  created_at timestamptz not null default now()
);

create table if not exists shares (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  segment_id uuid not null references subtitle_segments(id),
  theme text not null default 'default',
  title text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists search_logs (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  result_count int not null check (result_count >= 0),
  anonymous_id text,
  created_at timestamptz not null default now()
);

create index if not exists episodes_show_code_idx
  on episodes(show_id, code);

create index if not exists subtitle_sources_episode_idx
  on subtitle_sources(episode_id);

create index if not exists subtitle_lines_episode_idx
  on subtitle_lines(episode_id, line_index);

create index if not exists subtitle_lines_time_idx
  on subtitle_lines(episode_id, start_ms, end_ms);

create index if not exists subtitle_lines_search_trgm_idx
  on subtitle_lines using gin (search_text gin_trgm_ops);

create index if not exists subtitle_lines_text_en_fts_idx
  on subtitle_lines using gin (to_tsvector('english', coalesce(text_en, '')));

create index if not exists subtitle_segments_episode_time_idx
  on subtitle_segments(episode_id, start_ms, end_ms);

create index if not exists segment_covers_segment_idx
  on segment_covers(segment_id);

create index if not exists shares_segment_idx
  on shares(segment_id);

create index if not exists search_logs_created_at_idx
  on search_logs(created_at desc);

create or replace function search_subtitle_lines(search_query text, max_results int default 30)
returns table (
  line_id uuid,
  episode_id uuid,
  show_title text,
  episode_code text,
  season_no int,
  episode_no int,
  line_index int,
  start_ms int,
  end_ms int,
  text_en text,
  text_zh text,
  rank_score real
)
language sql
stable
as $$
  with normalized as (
    select nullif(trim(search_query), '') as query_text
  )
  select
    subtitle_lines.id as line_id,
    subtitle_lines.episode_id,
    shows.title as show_title,
    episodes.code as episode_code,
    episodes.season_no,
    episodes.episode_no,
    subtitle_lines.line_index,
    subtitle_lines.start_ms,
    subtitle_lines.end_ms,
    subtitle_lines.text_en,
    subtitle_lines.text_zh,
    (
      ts_rank(
        to_tsvector('english', coalesce(subtitle_lines.text_en, '')),
        plainto_tsquery('english', normalized.query_text)
      ) + similarity(subtitle_lines.search_text, normalized.query_text)
    )::real as rank_score
  from normalized
  join subtitle_lines on normalized.query_text is not null
  join episodes on episodes.id = subtitle_lines.episode_id
  join shows on shows.id = episodes.show_id
  where
    to_tsvector('english', coalesce(subtitle_lines.text_en, '')) @@ plainto_tsquery('english', normalized.query_text)
    or subtitle_lines.search_text ilike '%' || normalized.query_text || '%'
    or subtitle_lines.search_text % normalized.query_text
  order by rank_score desc, subtitle_lines.start_ms asc
  limit greatest(1, least(max_results, 100));
$$;
