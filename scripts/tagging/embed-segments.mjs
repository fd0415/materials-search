// 离线：把每个片段的中文台词算成向量，存到 material/segment-embeddings.json。
// 运行一次即可（新增素材后重跑）。用法：node scripts/tagging/embed-segments.mjs

import { readFileSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.SILICONFLOW_BASE_URL ?? "https://api.siliconflow.cn/v1";
const API_KEY = process.env.SILICONFLOW_API_KEY;
const MODEL = process.env.SILICONFLOW_EMBED_MODEL ?? "BAAI/bge-m3";

if (!API_KEY) {
  console.error("缺少 SILICONFLOW_API_KEY，请先在 .env.local 配置后用 `node --env-file=.env.local` 运行。");
  process.exit(1);
}

async function embedBatch(texts) {
  const res = await fetch(`${BASE_URL}/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: MODEL, input: texts })
  });
  if (!res.ok) {
    throw new Error(`Embedding failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}

const parsed = JSON.parse(readFileSync("material/subtitle-segments.json", "utf8"));
const segments = parsed.segments.filter((s) => (s.textZh ?? "").trim());

const out = [];
const CHUNK = 16;
for (let i = 0; i < segments.length; i += CHUNK) {
  const chunk = segments.slice(i, i + CHUNK);
  const vectors = await embedBatch(chunk.map((s) => s.textZh));
  chunk.forEach((s, j) => out.push({ id: s.id, embedding: vectors[j] }));
  console.log(`embedded ${Math.min(i + CHUNK, segments.length)}/${segments.length}`);
}

writeFileSync("material/segment-embeddings.json", JSON.stringify({ model: MODEL, dim: out[0]?.embedding.length ?? 0, items: out }));
console.log(`已写入 material/segment-embeddings.json：${out.length} 条，维度 ${out[0]?.embedding.length}`);
