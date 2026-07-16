// 会话记忆（进程内存版，够 demo 用；重启即清空，将来可换 Redis/DB）。
// 记住：当前候选池、当前展示的 3 张、已交付、语气偏好、对话历史。

export type Turn = { role: "user" | "assistant"; content: string };

export type SessionState = {
  pool: string[]; // 当前处境检索出的候选片段 id（按相似度排序）
  current: string[]; // 当前正展示的 3 张
  delivered: string[]; // 本轮处境里已给过的
  tone: string; // 配文语气偏好，会随「更狠一点」累积
  history: Turn[]; // 对话历史，供大脑理解追问
};

const store = new Map<string, SessionState>();

export function getSession(id: string): SessionState {
  return (
    store.get(id) ?? {
      pool: [],
      current: [],
      delivered: [],
      tone: "阴阳吐槽",
      history: []
    }
  );
}

export function saveSession(id: string, state: SessionState): void {
  state.history = state.history.slice(-8); // 只留最近几轮，控制上下文长度
  store.set(id, state);
}
