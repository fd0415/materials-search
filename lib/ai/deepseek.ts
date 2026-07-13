import { AI, type AiTask, modelFor } from "./models";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type ChatOptions = {
  task: AiTask;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  // 控制推理开销：low 明显更快（推理 token 减半），high 更细。默认不传。
  reasoningEffort?: "low" | "medium" | "high";
};

// DeepSeek v4 是推理模型：返回里先有 reasoning_content，再有 content。
// 这里只取最终 content，并给足 max_tokens 避免预算被推理吃光。
export async function chat({
  task,
  messages,
  maxTokens = 2000,
  temperature = 0.8,
  reasoningEffort
}: ChatOptions): Promise<string> {
  if (!AI.apiKey) {
    throw new Error("Missing DEEPSEEK_API_KEY");
  }

  const body: Record<string, unknown> = {
    model: modelFor(task),
    messages,
    max_tokens: maxTokens,
    temperature
  };
  if (reasoningEffort) {
    body.reasoning_effort = reasoningEffort;
  }

  const response = await fetch(`${AI.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AI.apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`DeepSeek ${task} failed: ${response.status} ${detail.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error(`DeepSeek ${task} returned empty content`);
  }
  return content;
}

// 从模型输出里稳健地抽出 JSON（容忍 ```json 代码块包裹和前后杂文本）。
export function parseJson<T>(raw: string): T {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    text = fence[1].trim();
  }
  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf("]"), text.lastIndexOf("}"));
  if (start !== -1 && end !== -1 && end > start) {
    text = text.slice(start, end + 1);
  }
  return JSON.parse(text) as T;
}
