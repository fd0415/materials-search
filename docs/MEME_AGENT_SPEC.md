# 嘴替梗图助手 · Vibe Coding 需求文档

> 版本：v1 · 面向 AI Coding 执行
> 定位：在现有 `bbt-search` 项目基础上，增量加一层「情绪 → 梗图（图 + 配文）」的 AI Agent 能力。
> 一句话：用户说一句处境/心情，Agent 自主从台词库挑素材、配文、出图，交付可直接发的表情包，并支持「换一张 / 更狠一点」的多轮交互。

---

## 0. 边界与原则（先读）

- **复用优先**：站在现有项目上加三块（标签 / Agent / 出图），不推翻现有搜索、数据层、R2 导入管道。
- **第一版形态**：主交付「静态图 + GIF」；静态图先行（现有素材更好处理），GIF 紧随。文字卡作为帧不可用时的兜底。
- **模型可配置**：每一处用哪个模型都从配置读取，不写死（见 §7）。
- **分期落地**：先跑通「工作流闭环」，再套「Agent 外壳（记忆 + 自主循环）」。两版共用底层工具，套壳不重做。

---

## 1. 产品定义

### 1.1 核心价值
把一个「台词搜索站」升级成「你说句心里话、它自动给你做好梗图」的助手。搜索沉到水下变成工具，用户面对的是对话式入口。

### 1.2 主交付物
- **一张做好的图**：静态图 + GIF（第一版）；文字卡作为帧不可用时的兜底。
- **一段配文**：图外的文案，发帖时配着用。
- 平台适配：默认「朋友圈版」= 1 图 + 1 短配文；后续「小红书版」= 标题 + 正文 + 多图。

### 1.3 三种「字」的定义（避免混淆）
- **画面**：从片段时间窗取的一帧（或文字卡底）。
- **台词**：印在图上的字 = 表情包灵魂。帧干净时由我们叠字；帧脏（带烧录字幕/水印）时走文字卡。
- **配文**：图外的字，发帖时配着发。

---

## 2. 现状盘点（复用 vs 待建）

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| 字幕解析 / 切片段 | ✅ 已有 | `scripts/subtitles/*`，产出 `subtitle_lines` / `subtitle_segments` |
| 检索（全文 + trigram） | ✅ 已有 | `search_subtitle_lines` RPC + `lib/segments.ts` |
| 数据库表结构 | ✅ 已有 | `supabase/migrations/001_initial_schema.sql` |
| R2 上传 + 入库 | ✅ 已有 | `import-subtitles.mjs`（已验证可连通 R2） |
| 分享 shares | ✅ 已有 | `/api/shares` + `shares` 表 |
| 封面（带字幕/水印的帧） | ⚠️ 已有待处理 | 30 张 webp，带烧录字幕 + 平台水印，出图前需裁剪 |
| **情绪/场景/角色标签** | ❌ 待建 | 新增 `segment_tags`，离线 LLM 打标 |
| **从视频抽帧生成封面/GIF** | ❌ 待建 | ffmpeg 已装（`node_modules/ffmpeg-static`），无脚本 |
| **生成字幕（无 SRT 时）** | ❌ 待建 | Whisper 转录 / OCR，视新片源是否带字幕而定 |
| **出图模块（叠字 / 文字卡）** | ❌ 待建 | 静态图叠字、文字卡排版、GIF 合成 |
| **Agent 编排器** | ❌ 待建 | 工具调用 + 自主循环 + 记忆 |

---

## 3. 数据模型改动

### 3.1 新增：`segment_tags`
```sql
create table segment_tags (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references subtitle_segments(id) on delete cascade,
  emotion text[],        -- 情绪：憋屈 / 得意 / 无语 / 毒舌 ...
  scene text[],          -- 场景：职场 / 相亲 / 社交 / 学习 ...
  character text,        -- 说话角色（若可判断）
  vibe_score int,        -- 0-100 综合「适合做梗」的评分
  model text,            -- 打标签用的模型（可溯源）
  created_at timestamptz not null default now(),
  unique(segment_id)
);
create index segment_tags_emotion_idx on segment_tags using gin (emotion);
create index segment_tags_scene_idx on segment_tags using gin (scene);
```

### 3.2 复用：`segment_covers`
静态图 / GIF 的对象地址写入这里（扩展 `source_type`：`static_extract` / `gif_extract` / `text_card`）。

### 3.3 可选：`renders`（出图记录，便于「换一张」审计）
```sql
create table renders (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references subtitle_segments(id),
  format text not null,        -- static / card / gif
  caption text,                -- 生成的配文
  object_key text,             -- 成品图地址
  session_id text,             -- 关联一次对话会话
  created_at timestamptz not null default now()
);
```

---

## 4. 预处理管道（离线，导入素材时跑一次）

顺序：**导入视频+字幕 → 切片段 → 抽帧（静态图/GIF）→ LLM 打标签 → 入库**

1. **导入 & 字幕**
   - 有配套双语 SRT：直接用。
   - 无字幕：先跑「生成字幕」（Whisper 转录英文 → 翻译中文；烧录字幕则 OCR）。产出 `en.srt` / `zh.srt`。
2. **切片段**：复用现有分段策略（≤6 句 / ≤16s / 停顿>4.5s 断开）。
3. **抽帧生成素材**（新脚本 `scripts/media/generate-covers.mjs`）
   - 静态图：取片段中点 1 帧 → 640×360 WebP。
   - GIF（第二版）：片段内均匀取 10–15 帧 → 低帧率 GIF。
   - **水印/字幕处理**：现有帧带烧录字幕 + 水印，出图前用 `--crop` 裁掉水印角、避开或利用底部字幕区。
4. **LLM 打标签**（新脚本 `scripts/tagging/tag-segments.mjs`）
   - 输入：每个片段的台词文本（读文字，不看画面）。
   - 输出：`emotion[] / scene[] / character / vibe_score`，写入 `segment_tags`。
   - 用**便宜档模型**批量跑，支持 `--limit` / `--overwrite` / dry-run。
5. **入库**：复用 `import-subtitles.mjs`，扩展写入 `segment_tags` / 新素材。

---

## 5. 实时 Agent 方案（核心）

### 5.1 Agent 工具清单
Agent 大脑（LLM）通过 tool-use 循环自主调用下列工具。程序负责执行，大脑负责决策。

| 工具 | 输入 | 输出 | 实现 |
| --- | --- | --- | --- |
| `search_segments` | `query`, `filters{emotion?,scene?,character?,season?}`, `limit` | `[{segmentId,textEn,textZh,tags,coverUrl,score}]` | Supabase RPC（全文 + trigram + 标签过滤） |
| `get_segment` | `segmentId` | 片段完整详情 + 上下文台词 | 复用 `getSegmentDetail` |
| `render_meme` | `segmentId`, `caption`, `format('static'\|'card'\|'gif')`, `style?` | `{imageUrl}` | 出图模块（§6） |
| `create_share` | `segmentId`, `caption` | `{shareUrl}` | 复用 `/api/shares` |

> 「打分挑选」和「写配文」由大脑在推理中直接完成，不单独做成工具（也可拆成子调用，见 §7）。

### 5.2 自主循环逻辑（这是「Agent 味」所在）
```
收到用户意图
└─ 大脑：解析意图 → 规划检索词
   loop（最多 K=3 轮）:
     调 search_segments
     大脑：看结果，判断「数量够吗 / 够贴题够狠吗」
       不够 → 换检索词 / 调整 filters，continue
       够   → break
   大脑：从候选挑 top3 + 为每条写配文
   对每条调 render_meme
   返回 3 张成品（图 + 配文）给用户
```
关键：**「判断够不够好 → 不够就重搜」由大脑自主决定，不是写死的固定步数。**

### 5.3 记忆（多轮交互的基础）
会话级 `session_state`：
```ts
{
  sessionId: string,
  intent: { emotion, scene, tone },   // 当前意图
  platform: '朋友圈' | '小红书',
  candidatePool: SegmentCandidate[],  // 本轮检索到的候选池
  delivered: string[],                // 已交付的 segmentId
  rejected: string[],                 // 用户否掉的
  preferredTone?: string              // 累积偏好，如「爱毒舌」
}
```

### 5.4 多轮交互处理
- **「换一张」**：大脑从 `candidatePool` 里挑一张**没交付过、没被 rejected** 的，直接 `render_meme`——**不重新检索**（省一次）。
- **「更狠 / 太软了」**：大脑把 `tone` 调「狠」，先在候选池重排；池里没有更狠的 → 触发一次新检索（回到自主循环）。
- **「发小红书」**：切 `platform`，出图/配文格式随之调整（标题 + 正文 + 多图）。

---

## 6. 出图模块

| 形态 | 何时用 | 实现 | 台词处理 |
| --- | --- | --- | --- |
| **静态图** | 第一版主力 | 按台词时间抽帧 + 裁水印角 | 用帧上现成的烧录字幕，**不叠字**（方案 A，见下） |
| **GIF** | 第一版，紧随静态图 | ffmpeg 多帧合成 + 固定台词层（或无字反应动图） | 多帧字幕在变，现有素材建议走无字反应动图 |
| **文字卡** | 兜底：帧不可用时 | Node（`sharp`/canvas）纯排版：背景 + 台词 + 署名 | 台词即主体，不依赖帧 |

### 6.1 静态图两种方案

- **方案 A（第一版默认，适配现有带字幕素材）**：帧上本就烧录了中英台词，**不再叠字/拼接台词**。
  1. **按台词时间抽帧**：以想要那句台词的 `start_ms` 为时间点抽帧，保证帧上显示的字幕正好是那句（而非片段中点的随机一句）。
  2. **裁掉水印角**：`--crop` 去掉右上角平台水印，保留底部字幕区。
  3. 输出即成品，省掉叠字排版。
  - 取舍：省事、快；但字幕是平台原始样式，不可控。
- **方案 B（后续升级，需干净无字幕帧）**：取干净帧 + 自己叠漂亮可控的台词层。现有脏帧会造成双重字幕，故第一版不走 B。

- 输出统一为 URL（存 R2 `public-assets`）。
- 配文（图外）随成品一起返回，不烧进图。

---

## 7. 模型配置（可换、分档）

集中在 `lib/ai/models.ts`（或环境变量），**不写死**：
```ts
export const MODEL_CONFIG = {
  brain:      'strong',   // Agent 大脑：理解/规划/判断/决定调工具 —— 一条龙同一模型
  copywriter: 'strong',   // 写配文：要文笔梗感
  judge:      'mid',      // 打分挑选（若拆成子调用）
  tagger:     'cheap'     // 离线打标签：量大，用便宜档批量刷
};
// 'strong' -> Claude 强档（如 Sonnet/Opus 级）
// 'mid'    -> 中档
// 'cheap'  -> Claude 便宜档（如 Haiku 级）
```
规则：
- **大脑推理循环用同一个强模型**从头跑到尾（保持上下文连贯，中途别换）。
- **配文、打标签是独立子调用**，可单独换模型、甚至换供应商。
- 供应商保持可插拔（默认 Claude，最新 Claude 5 / Opus 4.8 / Haiku 4.5 系）。

---

## 8. API 契约（新增）

- `POST /api/agent`（**流式**）
  - 入参：`{ sessionId, message, platform? }`
  - 出参（SSE 流）：`thinking`（可选，展示"思考中"）→ `results: [{imageUrl, caption, segmentId, episodeCode, timecode}]`
  - 内部驱动 §5 的 Agent 循环，读写 `session_state`。
- 复用：`GET /api/segments/:id`、`POST /api/shares`。
- 后台（可选）：`POST /api/admin/tag-segments`（触发离线打标签）。

---

## 9. 前端交互

- **入口**：对话式输入框（取代裸搜索框），placeholder：「说说你的处境，例：今天被老板 PUA 了」。
- **结果**：3 张成品卡（图 + 配文），每张有「下载 / 复制配文 / 生成分享 / 换一张」。
- **追问栏**：常驻输入，支持「换一张」「更狠一点」「发小红书」。
- **状态**：思考中 skeleton；空结果引导换说法。

---

## 10. 里程碑与验收

| 里程碑 | 目标 | 验收 |
| --- | --- | --- |
| **M1 标签地基** | 离线打标签跑通 | 现有片段 90%+ 有 `segment_tags`，可按情绪/场景过滤检索 |
| **M2 工作流闭环** | 单轮：说处境 → 出 3 张静态图 + 配文 | 输入一句，稳定返回 3 张可下载成品 |
| **M3 Agent 外壳 + GIF** | 加记忆 + 自主循环；补 GIF 出图 | 「换一张 / 更狠」多轮生效；结果差时自动重搜；能出 GIF |
| **M4 扩量** | 接入更多素材 / 集数 | 多片源导入跑通，标签 + 出图规模化 |

---

## 11. 第一版非目标（先不做）
- 视频播放器、在线剪辑。
- 多剧集扩展。
- AI 人脸/表情识别（标签只读台词文本）。
- 小红书/抖音全格式适配（M2 后再加）。
