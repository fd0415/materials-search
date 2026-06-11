# Material MVP Notes

## Source

- Local video source: `private/source.mp4`
- Duration: 425 seconds
- Resolution: 960x448
- Streams detected by ffprobe:
  - Video: H.264
  - Audio: AAC
  - Subtitle streams: none

## Current Output

- Probe metadata: `material/source.ffprobe.json`
- Subtitle line index: `material/subtitle-lines.json`
- Subtitle segment index: `material/subtitle-segments.json`
- Database import payload: `material/db-import.json`
- Cover images: `material/covers/segment-0001.webp` to `segment-0030.webp`

The current segment strategy groups adjacent subtitle lines into short dialogue windows. It replaces the earlier fixed 30-second MVP windows.

## Subtitle Status

Although the video visually contains bilingual subtitles, the MP4 does not expose a separate subtitle stream. That means `ffmpeg` cannot directly extract `.srt` files from this video.

The subtitles are likely burned into the video frames. To convert them into searchable text, use one of these options:

1. Provide the matching `.srt` subtitle file.
2. Run OCR on the subtitle area of video frames.
3. Run Whisper on audio to generate English subtitles, then translate or align Chinese separately.

For deployment/import, keep video files out of `material`; only subtitle metadata, timecodes, generated covers, and import JSON should be treated as app data.

## Validation Status

The prepared `material/en.srt` and `material/zh.srt` are usable for the MVP subtitle pipeline:

- Both files parse as valid SRT with no bad blocks.
- English has 161 entries; Chinese has 158 entries.
- The current validation report shows about 95.7% time-overlap alignment.
- Known issues remain: a few OCR/noise fragments in English (`#`, short uppercase fragments, malformed words) and several likely OCR artifacts in Chinese (`**`, stray punctuation, mistranscribed words).

This is good enough to test parsing, search, Supabase import, and segment generation. Before public-facing use, do a manual QA pass on high-traffic lines and confirm subtitle/video licensing.

## Scripts

Generate fresh local material payloads:

```bash
npm run material:prepare
```

Dry-run the Supabase Storage upload/import plan:

```bash
npm run material:import
```

Dry-run the Cloudflare R2 upload plus Supabase database import plan:

```bash
npm run material:import -- --storage r2
```

Create/check the configured R2 buckets:

```bash
npm run r2:ensure-buckets
```

Apply the R2 file upload and Supabase database import after setting real server-side credentials:

```bash
npm run material:import -- --storage r2 --apply --replace-segments
```

The import command uploads raw SRT files to object storage, records bucket names and object keys in `subtitle_sources`, upserts `shows`, `episodes`, and `subtitle_lines`, then builds `subtitle_segments`. If legal/private cover WebP files exist, pass `--covers-dir material/covers` to upload them and write `segment_covers`.

Use Supabase Postgres as the database of record. Use Cloudflare R2 only for file objects such as raw subtitles, cover images, and future authorized video assets.
