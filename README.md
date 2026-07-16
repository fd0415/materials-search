# Materials Search · 生活大爆炸台词搜索 & 嘴替梗图助手

基于《生活大爆炸》(The Big Bang Theory) 双语字幕的台词搜索站，并在其上加了一层「情绪 → 梗图」的 AI Agent：用户说一句处境或心情，Agent 自主从台词库检索素材、配文、出图，交付可直接发的表情包，并支持「换一张 / 更狠一点」的多轮对话。

线上地址：https://bbt-search-deploy.vercel.app

> 边界：本项目只索引字幕、时间码、剧集元数据和素材封面，不托管、切片或分发未授权剧集视频。视频播放仅支持用户自备源、授权源或私有测试源。

## 功能

- **台词搜索**：关键词检索双语台词，返回素材卡片网格（封面、双语台词、季集、时间码、上下文）。
- **可分享链接**：为选中的台词素材生成分享页 / 分享卡片。
- **嘴替梗图 Agent**：对话式入口。读对话历史 + 当前消息，自主决定这一轮该「重新检索 / 换一批 / 只改配文」，语义检索台词并生成配文。
- **管理后台**：导入、QA、搜索调试等 `/admin` 页面。

## 技术栈

- **框架**：Next.js 16 (App Router, Turbopack) · React 19 · TypeScript
- **样式**：Tailwind CSS v4
- **数据**：Supabase (Postgres) 存字幕、时间码、剧集元数据
- **对象存储**：Cloudflare R2 存字幕源文件与公开素材封面
- **AI**：DeepSeek (对话/规划，OpenAI 兼容) · SiliconFlow `BAAI/bge-m3` (embedding 语义检索)
- **部署**：Vercel

## 目录结构

```
app/
  page.tsx              首页搜索
  search/               搜索页
  meme/                 嘴替梗图对话入口
  segments/[id]/        素材详情
  share/[slug]/         分享页
  admin/                管理后台（导入 / QA / 搜索调试）
  api/
    search/             台词搜索接口
    agent/              梗图 Agent 对话接口
    meme/               出图接口
    segments/[id]/      素材详情接口
    shares/             分享接口
lib/
  segments.ts           台词检索数据层
  supabase.ts           Supabase 客户端
  ai/                   DeepSeek / embedding / 模型配置
  meme/                 Agent 大脑、检索、会话、素材库
scripts/
  subtitles/            字幕准备与导入管道
  storage/              R2 桶初始化
  tagging/              素材 embedding 生成
  media/                封面清洗
docs/                   实现手册与 Agent 需求文档
```

## 本地开发

前置：Node.js 20+、一个 Supabase 项目、Cloudflare R2、DeepSeek 与 SiliconFlow 的 API key。

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，填入真实的 key（.env.local 已被 gitignore，不会提交）

# 3. 启动开发服务器
npm run dev
# 打开 http://localhost:3000
```

## 环境变量

见 [.env.example](.env.example)。分四组：

| 组 | 变量 | 用途 |
| --- | --- | --- |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL` `NEXT_PUBLIC_SUPABASE_ANON_KEY` `SUPABASE_SERVICE_ROLE_KEY` `DATABASE_URL` | 字幕与元数据库 |
| Cloudflare R2 | `R2_ACCOUNT_ID` `R2_ACCESS_KEY_ID` `R2_SECRET_ACCESS_KEY` `R2_BUCKET_*` `R2_PUBLIC_ASSETS_BASE_URL` | 字幕源与素材封面存储 |
| DeepSeek | `DEEPSEEK_BASE_URL` `DEEPSEEK_API_KEY` `DEEPSEEK_MODEL_PRO` `DEEPSEEK_MODEL_FLASH` | Agent 对话与规划 |
| SiliconFlow | `SILICONFLOW_BASE_URL` `SILICONFLOW_API_KEY` `SILICONFLOW_EMBED_MODEL` | 语义检索 embedding |

> **部署到 Vercel 时**，这些变量需要在 Vercel 项目 → Settings → Environment Variables 里单独配置。构建（`next build`）本身不需要它们，但运行时的搜索 / Agent / 出图接口需要，缺失会导致接口报错。

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产构建 |
| `npm run start` | 启动生产服务 |
| `npm run lint` | ESLint 检查 |
| `npm run material:prepare` | 准备字幕素材 |
| `npm run material:import` | 导入字幕到数据库 |
| `npm run r2:ensure-buckets` | 初始化 R2 存储桶 |

## 部署

已连接到 Vercel，向 `main` 分支推送即自动部署。手动部署：

```bash
npx vercel --prod
```

## 文档

- [docs/IMPLEMENTATION_MANUAL.md](docs/IMPLEMENTATION_MANUAL.md) — 搜索站实现手册
- [docs/meme-agent-flow.html](docs/meme-agent-flow.html) — Agent 流程图
