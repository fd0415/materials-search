/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";

type MemeResult = {
  segmentId: string;
  timecode: string;
  textEn?: string;
  textZh?: string;
  coverUrl: string;
  caption: string;
};

const EXAMPLES = ["今天被老板 PUA 了，想阴阳一下", "又被催婚了", "室友还是不洗碗", "周一根本不想上班"];
const REFINES = ["更狠一点", "温柔一点", "换个角度", "换一批"];

const EXAMPLE_GALLERY: MemeResult[] = [
  { segmentId: "segment-0011", coverUrl: "/covers/segment-0011.webp", timecode: "", caption: "周一早晨，连楼梯都不想爬。" },
  { segmentId: "segment-0016", coverUrl: "/covers/segment-0016.webp", timecode: "", caption: "催婚现场：嗯嗯哦哦好。" },
  { segmentId: "segment-0026", coverUrl: "/covers/segment-0026.webp", timecode: "", caption: "甩锅当自己家，谢谢不用谢！" }
];

export function MemeExperience() {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<MemeResult[]>([]);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [started, setStarted] = useState(false);

  const showExamples = !started && !loading;
  const cards = showExamples ? EXAMPLE_GALLERY : results;

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: q })
      });
      const data = (await res.json()) as { results?: MemeResult[]; reply?: string; error?: string };
      if (!res.ok || data.error) {
        setReply(data.reply ?? "");
        throw new Error(data.error ?? "生成失败");
      }
      setResults(data.results ?? []);
      setReply(data.reply ?? "");
      setStarted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }

  async function copyCaption(caption: string, id: string) {
    await navigator.clipboard.writeText(caption);
    setCopied(id);
    setTimeout(() => setCopied(""), 1500);
  }

  async function downloadImage(url: string, id: string) {
    const res = await fetch(url);
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `meme-${id}.webp`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-12 text-slate-100">
      <div className="mx-auto w-full max-w-5xl">
        <header className="text-center">
          <h1 className="text-3xl font-bold sm:text-4xl">嘴替梗图助手</h1>
          <p className="mt-3 text-slate-400">说说你的处境，帮你从《生活大爆炸》里挑梗、配文</p>
        </header>

        <div className="mx-auto mt-8 flex max-w-2xl flex-col gap-3 sm:flex-row">
          <input
            className="flex-1 rounded-2xl border border-slate-700 bg-slate-900 px-5 py-4 text-base outline-none placeholder:text-slate-500 focus:border-slate-500"
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(message)}
            placeholder={started ? "接着说：更狠一点 / 换个角度 / 要谢尔顿的…" : "说说你的处境，例：今天被老板 PUA 了"}
            value={message}
          />
          <button
            className="rounded-2xl bg-white px-6 py-4 font-semibold text-slate-950 disabled:opacity-50"
            disabled={loading}
            onClick={() => send(message)}
          >
            {loading ? "生成中…" : started ? "发送" : "生成梗图"}
          </button>
        </div>

        <div className="mx-auto mt-4 flex max-w-2xl flex-wrap justify-center gap-2">
          {(started ? REFINES : EXAMPLES).map((ex) => (
            <button
              className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:border-slate-500 disabled:opacity-40"
              disabled={loading}
              key={ex}
              onClick={() => {
                if (!started) {
                  setMessage(ex);
                }
                send(ex);
              }}
            >
              {ex}
            </button>
          ))}
        </div>

        {error && <p className="mt-8 text-center text-red-400">{error}</p>}

        <p className="mt-12 min-h-[1.25rem] text-center text-sm font-medium tracking-wide text-slate-400">
          {loading ? "思考中…" : showExamples ? "示例效果 · 输入处境即可生成你的专属梗图" : reply}
        </p>

        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((r) => (
            <figure className="flex flex-col overflow-hidden rounded-3xl bg-slate-900 ring-1 ring-slate-800" key={r.segmentId}>
              <img alt="" className="aspect-video w-full object-cover" src={r.coverUrl} />
              <div className="flex flex-1 flex-col gap-3 border-t border-slate-800 p-4">
                <div className="rounded-2xl bg-slate-800/50 px-4 py-3">
                  <span className="text-xs font-medium tracking-wide text-slate-400">配文</span>
                  <p className="mt-1 text-base font-medium leading-relaxed text-slate-50">{r.caption}</p>
                </div>
                <div className="mt-auto flex gap-2">
                  <button
                    className="flex-1 rounded-xl border border-slate-700 py-2 text-sm hover:border-slate-500"
                    onClick={() => copyCaption(r.caption, r.segmentId)}
                  >
                    {copied === r.segmentId ? "已复制配文" : "复制配文"}
                  </button>
                  <button
                    className="flex-1 rounded-xl bg-white py-2 text-sm font-medium text-slate-950 hover:bg-slate-200"
                    onClick={() => downloadImage(r.coverUrl, r.segmentId)}
                  >
                    下载图片
                  </button>
                </div>
              </div>
            </figure>
          ))}
        </div>
      </div>
    </main>
  );
}
