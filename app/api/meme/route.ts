import { NextResponse } from "next/server";
import { chat, parseJson } from "@/lib/ai/deepseek";
import { embedOne } from "@/lib/ai/embeddings";
import { getSegment } from "@/lib/meme/library";
import { semanticTopK } from "@/lib/meme/retrieve";

export const runtime = "nodejs";

const TOP_K = 3; // 语义检索直接定 top3，LLM 只负责写配文（更快更稳）

type Pick = { id: string; caption: string };

type MemeResult = {
  segmentId: string;
  timecode: string;
  textEn: string;
  textZh: string;
  coverUrl: string;
  caption: string;
};

export async function POST(request: Request) {
  let body: { message?: string; excludeIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = (body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "请先说说你的处境或心情。" }, { status: 400 });
  }

  // 1) 本地语义检索：把处境转向量，秒选出最相关的 top3 片段（不调大模型）
  let candidates;
  try {
    const queryVec = await embedOne(message);
    candidates = semanticTopK(queryVec, body.excludeIds ?? [], TOP_K);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown";
    return NextResponse.json({ error: `检索失败：${detail}` }, { status: 502 });
  }

  if (candidates.length === 0) {
    return NextResponse.json({ error: "素材用完了，换个说法再试试。" }, { status: 200 });
  }

  // 2) LLM 只负责为这 3 条各写一句配文（不再挑选，最快）
  const catalog = candidates.map((s) => `- ${s.id}: ${s.textZh}`).join("\n");

  const system =
    "你是《生活大爆炸》梗图助手。用户会说一段处境或心情，" +
    "给定 3 条台词，请为每条写一句贴合该处境、够味、能直接发朋友圈阴阳/吐槽的中文配文（20 字以内）。" +
    '只返回 JSON 数组，格式：[{"id":"台词id","caption":"配文"}]，保留原 id，不要任何多余文字。';

  const user = `用户处境：${message}\n\n台词：\n${catalog}\n\n为每条写配文，返回 JSON。`;

  let picks: Pick[];
  try {
    const raw = await chat({
      task: "meme",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      maxTokens: 1500,
      temperature: 0.85,
      reasoningEffort: "low"
    });
    picks = parseJson<Pick[]>(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown";
    return NextResponse.json({ error: `生成失败：${detail}` }, { status: 502 });
  }

  const results: MemeResult[] = [];
  for (const pick of picks.slice(0, 3)) {
    const segment = getSegment(pick.id);
    if (!segment) {
      continue;
    }
    results.push({
      segmentId: segment.id,
      timecode: segment.timecodeLabel,
      textEn: segment.textEn,
      textZh: segment.textZh,
      coverUrl: segment.coverUrl,
      caption: (pick.caption ?? "").trim() || "这就是我此刻的心情。"
    });
  }

  if (results.length === 0) {
    return NextResponse.json({ error: "没挑到合适的，换个说法试试。" }, { status: 200 });
  }

  return NextResponse.json({ results });
}
