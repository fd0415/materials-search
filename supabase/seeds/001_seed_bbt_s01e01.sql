insert into shows (id, title, original_title, slug)
values (
  '11111111-1111-4111-8111-111111111111',
  'The Big Bang Theory',
  '生活大爆炸',
  'the-big-bang-theory'
)
on conflict (slug) do update
set
  title = excluded.title,
  original_title = excluded.original_title;

insert into episodes (
  id,
  show_id,
  season_no,
  episode_no,
  code,
  title,
  original_title,
  air_date,
  poster_object_key
)
values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  1,
  1,
  'S01E01',
  'Pilot',
  '试播集',
  '2007-09-24',
  'posters/bbt/s01/e01.webp'
)
on conflict (show_id, season_no, episode_no) do update
set
  code = excluded.code,
  title = excluded.title,
  original_title = excluded.original_title,
  air_date = excluded.air_date,
  poster_object_key = excluded.poster_object_key;

insert into subtitle_lines (
  id,
  episode_id,
  line_index,
  start_ms,
  end_ms,
  text_en,
  text_zh
)
values
  (
    '33333333-3333-4333-8333-333333333331',
    '22222222-2222-4222-8222-222222222222',
    1,
    300,
    2700,
    'However, if it is observed after it has left the plane',
    '但如果它是在离开平面后被观测到'
  ),
  (
    '33333333-3333-4333-8333-333333333332',
    '22222222-2222-4222-8222-222222222222',
    2,
    2800,
    3999,
    'But before it hits its target',
    '在击中目标物之前'
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    '22222222-2222-4222-8222-222222222222',
    3,
    4000,
    5200,
    'it will not have gone through both slits.',
    '那它不会同时通过两个狭缝'
  )
on conflict (episode_id, line_index) do update
set
  start_ms = excluded.start_ms,
  end_ms = excluded.end_ms,
  text_en = excluded.text_en,
  text_zh = excluded.text_zh;

insert into subtitle_segments (
  id,
  episode_id,
  start_line_id,
  end_line_id,
  start_ms,
  end_ms,
  line_count,
  summary
)
values (
  '44444444-4444-4444-8444-444444444444',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333331',
  '33333333-3333-4333-8333-333333333333',
  300,
  5200,
  3,
  'Opening physics dialogue sample.'
)
on conflict (id) do update
set
  start_ms = excluded.start_ms,
  end_ms = excluded.end_ms,
  line_count = excluded.line_count,
  summary = excluded.summary;

insert into segment_covers (
  segment_id,
  storage_bucket,
  object_key,
  captured_at_ms,
  source_type,
  license_status
)
values (
  '44444444-4444-4444-8444-444444444444',
  'public-assets',
  'covers/placeholders/bbt-s01e01-segment-0001.webp',
  2750,
  'placeholder',
  'placeholder'
)
on conflict (segment_id) do update
set
  storage_bucket = excluded.storage_bucket,
  object_key = excluded.object_key,
  captured_at_ms = excluded.captured_at_ms,
  source_type = excluded.source_type,
  license_status = excluded.license_status;

insert into shares (slug, segment_id, theme, title)
values (
  'bbt-s01e01-opening-physics',
  '44444444-4444-4444-8444-444444444444',
  'default',
  'The Big Bang Theory S01E01 Opening Physics'
)
on conflict (slug) do update
set
  segment_id = excluded.segment_id,
  theme = excluded.theme,
  title = excluded.title;
