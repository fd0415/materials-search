import { createSupabaseAdminClient } from "@/lib/supabase";

const DEFAULT_LIMIT = 50;
const RANDOM_LIMIT = 9;

export type SegmentLine = {
  id: string;
  lineIndex: number;
  startMs: number;
  endMs: number;
  textEn: string | null;
  textZh: string | null;
};

export type SegmentResult = {
  id: string;
  episodeId: string;
  episodeCode: string;
  seasonNo: number;
  episodeNo: number;
  showTitle: string;
  showOriginalTitle: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  timecodeLabel: string;
  textEn: string;
  textZh: string;
  coverImageUrl: string | null;
  videoUrl: string | null;
  licenseStatus: string | null;
  lines: SegmentLine[];
  previousSegmentId: string | null;
  nextSegmentId: string | null;
};

type SubtitleLineRow = {
  id: string;
  episode_id: string;
  line_index: number;
  start_ms: number;
  end_ms: number;
  text_en: string | null;
  text_zh: string | null;
};

type SegmentRow = {
  id: string;
  episode_id: string;
  start_ms: number;
  end_ms: number;
  line_count: number;
  summary: string | null;
};

type EpisodeRow = {
  id: string;
  show_id: string;
  season_no: number;
  episode_no: number;
  code: string;
  title: string | null;
};

type ShowRow = {
  id: string;
  title: string;
  original_title: string;
  slug: string;
};

type CoverRow = {
  segment_id: string;
  storage_bucket: string;
  object_key: string;
  license_status: string;
};

type AssetRow = {
  segment_id: string;
  storage_bucket: string | null;
  object_key: string | null;
  external_url: string | null;
  license_status: string;
};

type SearchLineHit = {
  line_id: string;
  episode_id: string;
  start_ms: number;
  end_ms: number;
};

export async function searchSegments(query: string, limit = DEFAULT_LIMIT) {
  const normalized = query.trim();
  if (!normalized) {
    return getRandomSegments(RANDOM_LIMIT);
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("search_subtitle_lines", {
    search_query: normalized,
    max_results: Math.max(1, Math.min(limit, DEFAULT_LIMIT))
  });

  if (error) {
    throw new Error(`Search failed: ${error.message}`);
  }

  const hits = (data ?? []) as SearchLineHit[];
  if (hits.length === 0) {
    return [];
  }

  const episodeIds = [...new Set(hits.map((hit) => hit.episode_id))];
  const segments = await fetchSegmentsForEpisodes(episodeIds);
  const selectedSegmentIds: string[] = [];
  const seenSegmentIds = new Set<string>();

  for (const hit of hits) {
    const segment = segments.find(
      (candidate) =>
        candidate.episode_id === hit.episode_id &&
        candidate.start_ms <= hit.start_ms &&
        candidate.end_ms >= hit.end_ms
    );

    if (segment && !seenSegmentIds.has(segment.id)) {
      seenSegmentIds.add(segment.id);
      selectedSegmentIds.push(segment.id);
    }
  }

  return hydrateSegments(selectedSegmentIds.slice(0, limit));
}

export async function getRandomSegments(limit = RANDOM_LIMIT) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("subtitle_segments")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`Failed to fetch random segments: ${error.message}`);
  }

  const shuffled = [...(data ?? [])].sort(() => Math.random() - 0.5);
  return hydrateSegments(shuffled.slice(0, limit).map((segment) => segment.id));
}

export async function getSegmentDetail(id: string) {
  const [segment] = await hydrateSegments([id]);
  return segment ?? null;
}

export async function createShare(segmentId: string, title?: string) {
  const supabase = createSupabaseAdminClient();
  const slug = `seg-${segmentId.slice(0, 8)}-${Date.now().toString(36)}`;
  const { data, error } = await supabase
    .from("shares")
    .insert({
      slug,
      segment_id: segmentId,
      theme: "default",
      title: title ?? null
    })
    .select("slug")
    .single();

  if (error) {
    throw new Error(`Failed to create share: ${error.message}`);
  }

  return data.slug as string;
}

export async function getShare(slug: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("shares").select("segment_id").eq("slug", slug).maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch share: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return getSegmentDetail(data.segment_id as string);
}

async function hydrateSegments(segmentIds: string[]) {
  if (segmentIds.length === 0) {
    return [];
  }

  const supabase = createSupabaseAdminClient();
  const { data: segmentsData, error: segmentError } = await supabase
    .from("subtitle_segments")
    .select("id, episode_id, start_ms, end_ms, line_count, summary")
    .in("id", segmentIds);

  if (segmentError) {
    throw new Error(`Failed to hydrate segments: ${segmentError.message}`);
  }

  const segments = (segmentsData ?? []) as SegmentRow[];
  const episodeIds = [...new Set(segments.map((segment) => segment.episode_id))];
  const [episodes, shows, lines, covers, assets, neighbors] = await Promise.all([
    fetchEpisodes(episodeIds),
    fetchShowsForEpisodes(episodeIds),
    fetchLinesForEpisodes(episodeIds),
    fetchCovers(segmentIds),
    fetchAssets(segmentIds),
    fetchSegmentsForEpisodes(episodeIds)
  ]);

  const episodeById = new Map(episodes.map((episode) => [episode.id, episode]));
  const showById = new Map(shows.map((show) => [show.id, show]));
  const coverBySegmentId = new Map(covers.map((cover) => [cover.segment_id, cover]));
  const assetBySegmentId = new Map(assets.map((asset) => [asset.segment_id, asset]));
  const inputOrder = new Map(segmentIds.map((id, index) => [id, index]));

  return segments
    .sort((a, b) => (inputOrder.get(a.id) ?? 0) - (inputOrder.get(b.id) ?? 0))
    .map((segment) => {
      const episode = episodeById.get(segment.episode_id);
      const show = episode ? showById.get(episode.show_id) : undefined;
      const segmentLines = lines
        .filter(
          (line) =>
            line.episode_id === segment.episode_id &&
            line.start_ms >= segment.start_ms &&
            line.end_ms <= segment.end_ms
        )
        .sort((a, b) => a.line_index - b.line_index);
      const episodeSegments = neighbors
        .filter((candidate) => candidate.episode_id === segment.episode_id)
        .sort((a, b) => a.start_ms - b.start_ms);
      const neighborIndex = episodeSegments.findIndex((candidate) => candidate.id === segment.id);
      const cover = coverBySegmentId.get(segment.id);
      const asset = assetBySegmentId.get(segment.id);

      return {
        id: segment.id,
        episodeId: segment.episode_id,
        episodeCode: episode?.code ?? "S??E??",
        seasonNo: episode?.season_no ?? 0,
        episodeNo: episode?.episode_no ?? 0,
        showTitle: show?.title ?? "The Big Bang Theory",
        showOriginalTitle: show?.original_title ?? "生活大爆炸",
        startMs: segment.start_ms,
        endMs: segment.end_ms,
        durationMs: Math.max(0, segment.end_ms - segment.start_ms),
        timecodeLabel: formatTimeRange(segment.start_ms, segment.end_ms),
        textEn: segmentLines.map((line) => line.text_en).filter(Boolean).join(" "),
        textZh: segmentLines.map((line) => line.text_zh).filter(Boolean).join(" "),
        coverImageUrl: cover ? buildObjectUrl(cover.object_key) : null,
        videoUrl: asset?.external_url ?? (asset?.object_key ? buildObjectUrl(asset.object_key) : null),
        licenseStatus: asset?.license_status ?? cover?.license_status ?? null,
        lines: segmentLines.map((line) => ({
          id: line.id,
          lineIndex: line.line_index,
          startMs: line.start_ms,
          endMs: line.end_ms,
          textEn: line.text_en,
          textZh: line.text_zh
        })),
        previousSegmentId: neighborIndex > 0 ? episodeSegments[neighborIndex - 1].id : null,
        nextSegmentId: neighborIndex >= 0 && neighborIndex < episodeSegments.length - 1 ? episodeSegments[neighborIndex + 1].id : null
      } satisfies SegmentResult;
    });
}

async function fetchSegmentsForEpisodes(episodeIds: string[]) {
  if (episodeIds.length === 0) {
    return [];
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("subtitle_segments")
    .select("id, episode_id, start_ms, end_ms, line_count, summary")
    .in("episode_id", episodeIds)
    .order("start_ms", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch episode segments: ${error.message}`);
  }

  return (data ?? []) as SegmentRow[];
}

async function fetchEpisodes(episodeIds: string[]) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("episodes")
    .select("id, show_id, season_no, episode_no, code, title")
    .in("id", episodeIds);

  if (error) {
    throw new Error(`Failed to fetch episodes: ${error.message}`);
  }

  return (data ?? []) as EpisodeRow[];
}

async function fetchShowsForEpisodes(episodeIds: string[]) {
  const episodes = await fetchEpisodes(episodeIds);
  const showIds = [...new Set(episodes.map((episode) => episode.show_id))];
  if (showIds.length === 0) {
    return [];
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("shows").select("id, title, original_title, slug").in("id", showIds);

  if (error) {
    throw new Error(`Failed to fetch shows: ${error.message}`);
  }

  return (data ?? []) as ShowRow[];
}

async function fetchLinesForEpisodes(episodeIds: string[]) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("subtitle_lines")
    .select("id, episode_id, line_index, start_ms, end_ms, text_en, text_zh")
    .in("episode_id", episodeIds)
    .order("line_index", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch subtitle lines: ${error.message}`);
  }

  return (data ?? []) as SubtitleLineRow[];
}

async function fetchCovers(segmentIds: string[]) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("segment_covers")
    .select("segment_id, storage_bucket, object_key, license_status")
    .in("segment_id", segmentIds);

  if (error) {
    throw new Error(`Failed to fetch segment covers: ${error.message}`);
  }

  return (data ?? []) as CoverRow[];
}

async function fetchAssets(segmentIds: string[]) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("segment_assets")
    .select("segment_id, storage_bucket, object_key, external_url, license_status")
    .in("segment_id", segmentIds);

  if (error) {
    throw new Error(`Failed to fetch segment assets: ${error.message}`);
  }

  return (data ?? []) as AssetRow[];
}

function buildObjectUrl(objectKey: string) {
  const baseUrl = process.env.R2_PUBLIC_ASSETS_BASE_URL;
  if (!baseUrl) {
    return null;
  }

  return `${baseUrl.replace(/\/$/, "")}/${objectKey}`;
}

function formatTimeRange(startMs: number, endMs: number) {
  return `${formatTime(startMs)}-${formatTime(endMs)}`;
}

function formatTime(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
