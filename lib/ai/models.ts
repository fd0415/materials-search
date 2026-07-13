// 集中管理 AI 模型配置。供应商：DeepSeek（OpenAI 兼容接口）。
// 密钥与模型 ID 全部走环境变量，不写死，方便随时替换或换供应商。

export const AI = {
  baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY ?? "",
  models: {
    // 高推理 → DeepSeek V4 Pro
    brain: process.env.DEEPSEEK_MODEL_PRO ?? "deepseek-v4-pro", // Agent 大脑：规划 / 判断 / 工具调用
    copywriter: process.env.DEEPSEEK_MODEL_PRO ?? "deepseek-v4-pro", // 写配文（高质量）
    // 低推理 → DeepSeek V4 Flash
    meme: process.env.DEEPSEEK_MODEL_FLASH ?? "deepseek-v4-flash", // v1 工作流：挑片段 + 配文（快）
    judge: process.env.DEEPSEEK_MODEL_FLASH ?? "deepseek-v4-flash", // 打分挑选
    tagger: process.env.DEEPSEEK_MODEL_FLASH ?? "deepseek-v4-flash" // 离线打标签
  }
} as const;

export type AiTask = keyof typeof AI.models;

export function modelFor(task: AiTask): string {
  return AI.models[task];
}
