import { chat, parseJson } from "@/lib/ai/deepseek";
import { embedOne } from "@/lib/ai/embeddings";
import { getSegment } from "@/lib/meme/library";
import { semanticTopK } from "@/lib/meme/retrieve";
import { getSession, saveSession, type SessionState } from "@/lib/meme/session";

type Action = "research" | "next" | "recaption";
type Plan = { reply: string; action: Action; search: string; tone: string };

export type AgentResult = {
  segmentId: string;
  timecode: string;
  coverUrl: string;
  textZh: string;
  caption: string;
};

// 大脑：读对话历史 + 当前消息，判断这一轮该干什么（这是「Agent 味」所在）
async function planTurn(state: SessionState, message: string): Promise<Plan> {
  const historyText = state.history.map((t) => `${t.role === "user" ? "用户" : "助手"}：${t.content}`).join("\n") || "（无）";

  const system =
    "你是《生活大爆炸》梗图助手的大脑。根据对话历史和用户最新的话，规划这一轮怎么做。\n" +
    "action 三选一：\n" +
    "- research：用户提出新处境，或想换个角度/换主题/要某个角色 → 需要重新检索台词\n" +
    "- next：用户只是想换几张不一样的（如“换一张/换一批/还有吗”）→ 复用已检索的池子给新的\n" +
    "- recaption：用户想让同样的图配文更狠/更温和/换个说法（如“更狠一点/太软了/换种语气”）→ 保持当前的图，只改配文\n" +
    "tone：配文语气（如 阴阳/毒舌/更狠/自嘲/温和），结合用户要求，可在历史语气上叠加。\n" +
    "search：仅当 action=research 时，写一句用于检索台词的处境描述（融合历史与当前）。\n" +
    "reply：一句给用户看的话，说明你这轮做了什么。\n" +
    '只返回 JSON：{"reply":"..","action":"research|next|recaption","search":"..","tone":".."}';

  const user = `对话历史：\n${historyText}\n\n用户最新消息：${message}`;

  try {
    const raw = await chat({
      task: "meme",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      maxTokens: 600,
      reasoningEffort: "low"
    });
    const p = parseJson<Partial<Plan>>(raw);
    const action = (["research", "next", "recaption"] as Action[]).includes(p.action as Action)
      ? (p.action as Action)
      : "research";
    return {
      reply: p.reply?.trim() || "好嘞，给你安排。",
      action,
      search: p.search?.trim() || message,
      tone: p.tone?.trim() || state.tone || "阴阳吐槽"
    };
  } catch {
    return {
      reply: "帮你换一批。",
      action: state.pool.length ? "next" : "research",
      search: message,
      tone: state.tone || "阴阳吐槽"
    };
  }
}

// 为选中的片段按指定语气写配文
async function captionize(message: string, tone: string, ids: string[]): Promise<AgentResult[]> {
  const segments = ids.map(getSegment).filter((s): s is NonNullable<typeof s> => Boolean(s));
  if (segments.length === 0) {
    return [];
  }
  const catalog = segments.map((s) => `- ${s.id}: ${s.textZh}`).join("\n");
  const system =
    `你是《生活大爆炸》梗图助手。为每条台词写一句贴合用户处境、语气【${tone}】、20 字以内、能直接发朋友圈的中文配文。` +
    '只返回 JSON 数组 [{"id":"台词id","caption":"配文"}]，保留原 id，不要多余文字。';
  const user = `用户处境：${message}\n语气要求：${tone}\n台词：\n${catalog}\n为每条写配文，返回 JSON。`;

  const raw = await chat({
    task: "meme",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    maxTokens: 900,
    temperature: 0.9,
    reasoningEffort: "low"
  });
  const picks = parseJson<Array<{ id: string; caption: string }>>(raw);
  const capById = new Map(picks.map((p) => [p.id, (p.caption ?? "").trim()]));

  return segments.map((s) => ({
    segmentId: s.id,
    timecode: s.timecodeLabel,
    coverUrl: s.coverUrl,
    textZh: s.textZh,
    caption: capById.get(s.id) || "就这么个心情。"
  }));
}

export async function runAgent(sessionId: string, message: string) {
  const state = getSession(sessionId);
  const plan = await planTurn(state, message);

  let ids: string[];
  if (plan.action === "recaption" && state.current.length > 0) {
    ids = state.current; // 同样的图，只换配文
  } else if (plan.action === "next" && state.pool.length > 0) {
    ids = state.pool.filter((id) => !state.delivered.includes(id)).slice(0, 3);
    if (ids.length === 0) {
      state.delivered = [];
      ids = state.pool.slice(0, 3);
    }
  } else {
    // research：按新处境重建候选池
    const vec = await embedOne(plan.search);
    state.pool = semanticTopK(vec, [], 30).map((s) => s.id);
    state.delivered = [];
    ids = state.pool.slice(0, 3);
  }

  const results = await captionize(message, plan.tone, ids);

  state.current = ids;
  for (const id of ids) {
    if (!state.delivered.includes(id)) {
      state.delivered.push(id);
    }
  }
  state.tone = plan.tone;
  state.history.push({ role: "user", content: message }, { role: "assistant", content: plan.reply });
  saveSession(sessionId, state);

  return { reply: plan.reply, action: plan.action, results };
}
