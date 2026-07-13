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

let cache: Segment[] | null = null;

// 第一版数据源：本地 material/subtitle-segments.json（30 个片段，自带中英台词 + 封面）。
// 不依赖 Supabase / 视频，保证本地可跑通。后续可切换为 Supabase 检索。
export function loadSegments(): Segment[] {
  if (cache) {
    return cache;
  }

  const file = path.join(process.cwd(), "material", "subtitle-segments.json");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { segments: RawSegment[] };

  cache = parsed.segments.map((s) => {
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
