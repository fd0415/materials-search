import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createR2Client, ensureR2Bucket, uploadR2File } from "../storage/r2.mjs";
import { buildMaterialPayload, sha256File } from "./pipeline.mjs";

const args = parseArgs(process.argv.slice(2));
const apply = Boolean(args.apply);
const dryRun = !apply;
const storageProvider = args.storage ?? "supabase";

loadDotEnv(".env.local");
loadDotEnv(".env");

const payload = buildMaterialPayload({
  enPath: args.en ?? "material/en.srt",
  zhPath: args.zh ?? "material/zh.srt",
  videoPath: args.video ?? null,
  showTitle: args.showTitle ?? "The Big Bang Theory",
  showOriginalTitle: args.showOriginalTitle ?? "生活大爆炸",
  showSlug: args.showSlug ?? "the-big-bang-theory",
  seasonNo: Number(args.season ?? 1),
  episodeNo: Number(args.episode ?? 1),
  episodeCode: args.episodeCode ?? "S01E01",
  episodeTitle: args.episodeTitle ?? "Pilot",
  episodeOriginalTitle: args.episodeOriginalTitle ?? "试播集",
  airDate: args.airDate ?? "2007-09-24"
});

const storagePlan = buildStoragePlan({
  storageProvider,
  showSlug: payload.dbImport.show.slug,
  episodeCode: payload.dbImport.episode.code,
  enPath: args.en ?? "material/en.srt",
  zhPath: args.zh ?? "material/zh.srt",
  videoPath: args.video,
  uploadVideo: Boolean(args.uploadVideo),
  coversDir: args.coversDir
});

printPlan(payload, storagePlan, dryRun);

if (dryRun) {
  process.exit(0);
}

const supabase = createSupabaseAdminClient();
const objectStorage = await prepareObjectStorage(storageProvider, supabase, storagePlan);
await uploadStoragePlan(objectStorage, storagePlan);
const show = await upsertShow(supabase, payload.dbImport.show);
const episode = await upsertEpisode(supabase, show.id, payload.dbImport.episode);
await registerSubtitleSources(supabase, episode.id, storagePlan.subtitleSources);
const lineIdByIndex = await upsertSubtitleLines(supabase, episode.id, payload.dbImport.subtitleLines);
const segmentIds = await importSegments(supabase, episode.id, payload.dbImport.subtitleSegments, lineIdByIndex, {
  replaceSegments: Boolean(args.replaceSegments)
});

if (storagePlan.covers.length > 0 && segmentIds.length > 0) {
  await importCovers(supabase, payload.dbImport.subtitleSegments, segmentIds, storagePlan.covers);
}

if (storagePlan.video && segmentIds.length > 0) {
  await importVideoAssets(supabase, segmentIds, storagePlan.video);
}

console.log("Supabase import completed.");

function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key || key === "your-service-role-key") {
    throw new Error("Missing real NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false
    }
  });
}

async function prepareObjectStorage(provider, supabase, plan) {
  if (provider === "supabase") {
    await ensureSupabaseBucket(supabase, plan.buckets.subtitleSources, { public: false });
    await ensureSupabaseBucket(supabase, plan.buckets.publicAssets, { public: true });

    if (plan.video) {
      await ensureSupabaseBucket(supabase, plan.buckets.authorizedVideo, { public: false });
    }

    return { provider, supabase };
  }

  if (provider === "r2") {
    const r2 = createR2Client();
    await ensureR2Bucket(r2, plan.buckets.subtitleSources);
    await ensureR2Bucket(r2, plan.buckets.publicAssets);

    if (plan.video) {
      await ensureR2Bucket(r2, plan.buckets.authorizedVideo);
    }

    return { provider, r2 };
  }

  throw new Error(`Unsupported storage provider: ${provider}`);
}

function buildStoragePlan(options) {
  if (!["supabase", "r2"].includes(options.storageProvider)) {
    throw new Error("--storage must be either supabase or r2.");
  }

  const buckets =
    options.storageProvider === "r2"
      ? {
          subtitleSources: process.env.R2_BUCKET_SUBTITLE_SOURCES ?? "bbt-subtitle-sources",
          publicAssets: process.env.R2_BUCKET_PUBLIC_ASSETS ?? "bbt-public-assets",
          authorizedVideo: process.env.R2_BUCKET_AUTHORIZED_VIDEO ?? "bbt-authorized-video"
        }
      : {
          subtitleSources: "subtitle-sources",
          publicAssets: "public-assets",
          authorizedVideo: "authorized-video"
        };
  const prefix = `${options.showSlug}/${options.episodeCode}`;
  const enSha = sha256File(options.enPath);
  const zhSha = sha256File(options.zhPath);
  const subtitleSources = [
    {
      language: "en",
      format: "srt",
      localPath: options.enPath,
      bucket: buckets.subtitleSources,
      objectKey: `subtitles/${prefix}/en-${enSha.slice(0, 12)}.srt`,
      sha256: enSha
    },
    {
      language: "zh",
      format: "srt",
      localPath: options.zhPath,
      bucket: buckets.subtitleSources,
      objectKey: `subtitles/${prefix}/zh-${zhSha.slice(0, 12)}.srt`,
      sha256: zhSha
    }
  ];

  const covers = [];
  if (options.coversDir && existsSync(options.coversDir)) {
    for (const fileName of readdirSync(options.coversDir).filter((name) => name.endsWith(".webp")).sort()) {
      covers.push({
        localPath: path.join(options.coversDir, fileName),
        bucket: buckets.publicAssets,
        objectKey: `covers/${prefix}/${fileName}`
      });
    }
  }

  return {
    provider: options.storageProvider,
    buckets,
    subtitleSources,
    covers,
    video:
      options.uploadVideo && options.videoPath
        ? {
            localPath: options.videoPath,
            bucket: buckets.authorizedVideo,
            objectKey: `videos/${prefix}/${path.basename(options.videoPath)}`
          }
        : null
  };
}

async function uploadStoragePlan(storage, plan) {
  for (const source of plan.subtitleSources) {
    await uploadFile(storage, source.bucket, source.objectKey, source.localPath, "application/x-subrip");
  }

  for (const cover of plan.covers) {
    await uploadFile(storage, cover.bucket, cover.objectKey, cover.localPath, "image/webp");
  }

  if (plan.video) {
    await uploadFile(storage, plan.video.bucket, plan.video.objectKey, plan.video.localPath, "video/mp4");
    console.log(`Uploaded authorized video source: ${plan.video.bucket}/${plan.video.objectKey}`);
  }
}

async function uploadFile(storage, bucket, objectKey, localPath, contentType) {
  if (storage.provider === "r2") {
    await uploadR2File(storage.r2, bucket, objectKey, localPath, contentType);
    return;
  }

  const { error } = await storage.supabase.storage.from(bucket).upload(objectKey, readFileSync(localPath), {
    contentType,
    upsert: true
  });

  if (error) {
    throw new Error(`Failed to upload ${localPath} to ${bucket}/${objectKey}: ${error.message}`);
  }
}

async function ensureSupabaseBucket(supabase, bucketName, options) {
  const { data, error } = await supabase.storage.listBuckets();
  if (error) {
    throw new Error(`Failed to list buckets: ${error.message}`);
  }

  if (data.some((bucket) => bucket.name === bucketName)) {
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(bucketName, options);
  if (createError) {
    throw new Error(`Failed to create bucket ${bucketName}: ${createError.message}`);
  }
}

async function upsertShow(supabase, show) {
  const { data, error } = await supabase
    .from("shows")
    .upsert(
      {
        title: show.title,
        original_title: show.originalTitle,
        slug: show.slug
      },
      { onConflict: "slug" }
    )
    .select("id, slug")
    .single();

  if (error) {
    throw new Error(`Failed to upsert show: ${error.message}`);
  }
  return data;
}

async function upsertEpisode(supabase, showId, episode) {
  const { data, error } = await supabase
    .from("episodes")
    .upsert(
      {
        show_id: showId,
        season_no: episode.seasonNo,
        episode_no: episode.episodeNo,
        code: episode.code,
        title: episode.title,
        original_title: episode.originalTitle,
        air_date: episode.airDate
      },
      { onConflict: "show_id,season_no,episode_no" }
    )
    .select("id, code")
    .single();

  if (error) {
    throw new Error(`Failed to upsert episode: ${error.message}`);
  }
  return data;
}

async function registerSubtitleSources(supabase, episodeId, sources) {
  for (const source of sources) {
    const { data: existing, error: selectError } = await supabase
      .from("subtitle_sources")
      .select("id")
      .eq("episode_id", episodeId)
      .eq("language", source.language)
      .eq("file_sha256", source.sha256)
      .maybeSingle();

    if (selectError) {
      throw new Error(`Failed to check subtitle source: ${selectError.message}`);
    }

    const row = {
      episode_id: episodeId,
      language: source.language,
      format: source.format,
      source_name: path.basename(source.localPath),
      source_url: null,
      storage_bucket: source.bucket,
      object_key: source.objectKey,
      file_sha256: source.sha256,
      imported_at: new Date().toISOString()
    };

    const query = existing
      ? supabase.from("subtitle_sources").update(row).eq("id", existing.id)
      : supabase.from("subtitle_sources").insert(row);
    const { error } = await query;

    if (error) {
      throw new Error(`Failed to register subtitle source ${source.language}: ${error.message}`);
    }
  }
}

async function upsertSubtitleLines(supabase, episodeId, lines) {
  const rows = lines.map((line) => ({
    episode_id: episodeId,
    line_index: line.lineIndex,
    start_ms: line.startMs,
    end_ms: line.endMs,
    text_en: line.textEn,
    text_zh: line.textZh
  }));

  const { data, error } = await supabase
    .from("subtitle_lines")
    .upsert(rows, { onConflict: "episode_id,line_index" })
    .select("id, line_index");

  if (error) {
    throw new Error(`Failed to upsert subtitle lines: ${error.message}`);
  }

  return new Map(data.map((line) => [line.line_index, line.id]));
}

async function importSegments(supabase, episodeId, segments, lineIdByIndex, options) {
  const { data: existingSegments, error: selectError } = await supabase
    .from("subtitle_segments")
    .select("id")
    .eq("episode_id", episodeId);

  if (selectError) {
    throw new Error(`Failed to check existing segments: ${selectError.message}`);
  }

  if (existingSegments.length > 0 && !options.replaceSegments) {
    console.warn(
      `Skipped segment import because ${existingSegments.length} segments already exist. Re-run with --replace-segments to rebuild them.`
    );
    return existingSegments.map((segment) => segment.id);
  }

  if (existingSegments.length > 0) {
    const ids = existingSegments.map((segment) => segment.id);
    const { error: assetDeleteError } = await supabase.from("segment_assets").delete().in("segment_id", ids);
    if (assetDeleteError) {
      throw new Error(`Failed to delete old segment assets: ${assetDeleteError.message}`);
    }

    const { error: coverDeleteError } = await supabase.from("segment_covers").delete().in("segment_id", ids);
    if (coverDeleteError) {
      throw new Error(`Failed to delete old segment covers: ${coverDeleteError.message}`);
    }

    const { error: segmentDeleteError } = await supabase.from("subtitle_segments").delete().eq("episode_id", episodeId);
    if (segmentDeleteError) {
      throw new Error(`Failed to delete old segments: ${segmentDeleteError.message}`);
    }
  }

  const rows = segments.map((segment) => {
    const startLineId = lineIdByIndex.get(segment.lineIndexes[0]);
    const endLineId = lineIdByIndex.get(segment.lineIndexes[segment.lineIndexes.length - 1]);

    if (!startLineId || !endLineId) {
      throw new Error(`Missing line ids for ${segment.id}`);
    }

    return {
      episode_id: episodeId,
      start_line_id: startLineId,
      end_line_id: endLineId,
      start_ms: segment.startMs,
      end_ms: segment.endMs,
      line_count: segment.lineCount,
      summary: segment.textEn?.slice(0, 180) ?? segment.textZh?.slice(0, 180) ?? null
    };
  });

  const { data, error } = await supabase.from("subtitle_segments").insert(rows).select("id");
  if (error) {
    throw new Error(`Failed to insert subtitle segments: ${error.message}`);
  }

  return data.map((segment) => segment.id);
}

async function importCovers(supabase, segments, segmentIds, covers) {
  const rows = covers.slice(0, segmentIds.length).map((cover, index) => ({
    segment_id: segmentIds[index],
    storage_bucket: cover.bucket,
    object_key: cover.objectKey,
    width: 640,
    height: 360,
    captured_at_ms: segments[index].capturedAtMs,
    source_type: "private_extract",
    license_status: "private_only"
  }));

  if (rows.length === 0) {
    return;
  }

  const { error } = await supabase.from("segment_covers").upsert(rows, { onConflict: "segment_id" });
  if (error) {
    throw new Error(`Failed to upsert segment covers: ${error.message}`);
  }
}

async function importVideoAssets(supabase, segmentIds, video) {
  const { error: deleteError } = await supabase.from("segment_assets").delete().in("segment_id", segmentIds);
  if (deleteError) {
    throw new Error(`Failed to delete old video assets: ${deleteError.message}`);
  }

  const rows = segmentIds.map((segmentId) => ({
    segment_id: segmentId,
    asset_type: "user_private",
    storage_bucket: video.bucket,
    object_key: video.objectKey,
    external_url: null,
    license_status: "private_only"
  }));

  const { error } = await supabase.from("segment_assets").insert(rows);
  if (error) {
    throw new Error(`Failed to insert video assets: ${error.message}`);
  }
}

function printPlan(payload, storagePlan, dryRunMode) {
  console.log(dryRunMode ? "Dry run. Add --apply to upload and import." : "Apply mode. Uploading and importing.");
  console.log(
    JSON.stringify(
      {
        show: payload.dbImport.show.slug,
        episode: payload.dbImport.episode.code,
        lines: payload.dbImport.subtitleLines.length,
        segments: payload.dbImport.subtitleSegments.length,
        validation: {
          droppedEn: payload.validation.cleaning.droppedEnCount,
          droppedZh: payload.validation.cleaning.droppedZhCount,
          matchRate: payload.validation.alignment.matchRate,
          unmatchedEn: payload.validation.alignment.unmatchedEn,
          missingEn: payload.validation.alignment.missingEn
        },
        storage: {
          provider: storagePlan.provider,
          subtitleSources: storagePlan.subtitleSources.map((source) => `${source.bucket}/${source.objectKey}`),
          covers: storagePlan.covers.length,
          video: storagePlan.video ? `${storagePlan.video.bucket}/${storagePlan.video.objectKey}` : null
        }
      },
      null,
      2
    )
  );
}

function loadDotEnv(filePath) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return;
  }

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) {
      continue;
    }

    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = toCamelCase(token.slice(2));
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }

    parsed[key] = next;
    index += 1;
  }

  if (parsed.out) {
    mkdirSync(parsed.out, { recursive: true });
  }

  return parsed;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}
