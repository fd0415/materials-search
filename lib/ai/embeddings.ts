// 文本向量化：走硅基流动（OpenAI 兼容）。用于把处境/台词转成向量做本地语义检索。

const BASE_URL = process.env.SILICONFLOW_BASE_URL ?? "https://api.siliconflow.cn/v1";
const API_KEY = process.env.SILICONFLOW_API_KEY ?? "";
const MODEL = process.env.SILICONFLOW_EMBED_MODEL ?? "BAAI/bge-m3";

export async function embed(input: string | string[]): Promise<number[][]> {
  if (!API_KEY) {
    throw new Error("Missing SILICONFLOW_API_KEY");
  }
  const res = await fetch(`${BASE_URL}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`
    },
    body: JSON.stringify({ model: MODEL, input })
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Embedding failed: ${res.status} ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return data.data.map((d) => d.embedding);
}

export async function embedOne(text: string): Promise<number[]> {
  const [vec] = await embed(text);
  return vec;
}

// 余弦相似度（向量可预先归一化以省算力，这里直接算通用版）
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
