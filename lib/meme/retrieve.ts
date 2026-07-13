import { readFileSync } from "node:fs";
import path from "node:path";
import { cosine } from "@/lib/ai/embeddings";
import { getSegment, type Segment } from "@/lib/meme/library";

type EmbeddingItem = { id: string; embedding: number[] };

let cache: EmbeddingItem[] | null = null;

function loadEmbeddings(): EmbeddingItem[] {
  if (cache) {
    return cache;
  }
  const file = path.join(process.cwd(), "material", "segment-embeddings.json");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { items: EmbeddingItem[] };
  cache = parsed.items;
  return cache;
}

// 本地语义检索：用查询向量对全部片段算余弦相似度，排除已看过的，取相似度最高的 topK。
export function semanticTopK(queryVec: number[], excludeIds: string[], k: number): Segment[] {
  const exclude = new Set(excludeIds);
  return loadEmbeddings()
    .filter((item) => !exclude.has(item.id))
    .map((item) => ({ id: item.id, score: cosine(queryVec, item.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((r) => getSegment(r.id))
    .filter((s): s is Segment => Boolean(s));
}
