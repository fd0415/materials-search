import { readFileSync } from "node:fs";
import path from "node:path";

export type Segment = {
  id: string;
  timecodeLabel: string;
  textEn: string;
  textZh: string;
  coverUrl: string; // 前端可访问的封面地址
};

type RawSegment = {
  id: string;
  timecodeLabel: string;
  textEn: string | null;
  textZh: string | null;
  coverImage: string | null;
};

// 封面被平台广告/播放器 UI 烧录进画面、无法干净去除的片段，直接排除，永不返回给用户。
// 后续若从干净的源视频重新截帧，可移除对应 id。
export const BLOCKED_SEGMENT_IDS = new Set(["segment-0001", "segment-0021", "segment-0024", "segment-0025"]);

let cache: Segment[] | null = null;

// 第一版数据源：本地 material/subtitle-segments.json（30 个片段，自带中英台词 + 封面）。
// 不依赖 Supabase / 视频，保证本地可跑通。后续可切换为 Supabase 检索。
export function loadSegments(): Segment[] {
  if (cache) {
    return cache;
  }

  const file = path.join(process.cwd(), "material", "subtitle-segments.json");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { segments: RawSegment[] };

  cache = parsed.segments
    .filter((s) => !BLOCKED_SEGMENT_IDS.has(s.id))
    .map((s) => {
      const fileName = s.coverImage ? path.basename(s.coverImage) : `${s.id}.webp`;
      return {
        id: s.id,
        timecodeLabel: s.timecodeLabel,
        textEn: (s.textEn ?? "").trim(),
        textZh: (s.textZh ?? "").trim(),
        coverUrl: `/covers/${fileName}`
      } satisfies Segment;
    });

  return cache;
}

export function getSegment(id: string): Segment | undefined {
  return loadSegments().find((s) => s.id === id);
}
