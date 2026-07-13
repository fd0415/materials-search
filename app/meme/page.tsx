/* eslint-disable @next/next/no-img-element */
"use client";

import { useRef, useState } from "react";

type MemeResult = {
  segmentId: string;
  timecode: string;
  textEn: string;
  textZh: string;
  coverUrl: string;
  caption: string;
};

const EXAMPLES = ["今天被老板 PUA 了，想阴阳一下", "又被催婚了", "室友还是不洗碗", "周一根本不想上班"];

export default function MemePage() {
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<MemeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  // 已展示过的片段 id（用于「换一批」去重）
  const deliveredRef = useRef<string[]>([]);
  // 后台预取的下一批：{ key: 当前处境, promise }
  const prefetchRef = useRef<{ key: string; promise: Promise<MemeResult[]> } | null>(null);

  async function fetchBatch(text: string, excludeIds: string[]): Promise<MemeResult[]> {
    const res = await fetch("/api/meme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, excludeIds })
    });
    const data = (await res.json()) as { results?: MemeResult[]; error?: string };
    if (!res.ok || data.error) {
      throw new Error(data.error ?? "生成失败");
    }
    return data.results ?? [];
  }

  // 出完一批后，后台预生成下一批，让「换一批」秒出
  function prefetchNext(text: string) {
    prefetchRef.current = {
      key: text,
      promise: fetchBatch(text, [...deliveredRef.current]).catch(() => [])
    };
  }

  async function generate(text: string) {
    const q = text.trim();
    if (!q) {
      return;
    }
    setLoading(true);
    setError("");
    deliveredRef.current = [];
    prefetchRef.current = null;
    try {
      const batch = await fetchBatch(q, []);
      setResults(batch);
      deliveredRef.current = batch.map((r) => r.segmentId);
      prefetchNext(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }

  async function reroll() {
    const q = message.trim();
    if (!q) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      let batch: MemeResult[] | null = null;
      if (prefetchRef.current?.key === q) {
        batch = await prefetchRef.current.promise; // 多半已就绪 → 秒出
      }
      if (!batch || batch.length === 0) {
        batch = await fetchBatch(q, deliveredRef.current);
      }
      if (batch.length === 0) {
        // 素材换完了，重置去重从头再来
        deliveredRef.current = [];
        batch = await fetchBatch(q, []);
      }
      setResults(batch);
      deliveredRef.current = [...deliveredRef.current, ...batch.map((r) => r.segmentId)];
      prefetchNext(q);
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
            onKeyDown={(e) => e.key === "Enter" && generate(message)}
            placeholder="说说你的处境，例：今天被老板 PUA 了"
            value={message}
          />
          <button
            className="rounded-2xl bg-white px-6 py-4 font-semibold text-slate-950 disabled:opacity-50"
            disabled={loading}
            onClick={() => generate(message)}
          >
            {loading ? "生成中…" : "生成梗图"}
          </button>
        </div>

        <div className="mx-auto mt-4 flex max-w-2xl flex-wrap justify-center gap-2">
          {EXAMPLES.map((ex) => (
            <button
              className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:border-slate-500"
              key={ex}
              onClick={() => {
                setMessage(ex);
                generate(ex);
              }}
            >
              {ex}
            </button>
          ))}
        </div>

        {error && <p className="mt-8 text-center text-red-400">{error}</p>}

        {results.length > 0 && (
          <>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((r) => (
                <figure className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900" key={r.segmentId}>
                  <div className="relative aspect-video bg-black">
                    <img alt="" className="h-full w-full object-cover" src={r.coverUrl} />
                    <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2 py-1 text-xs">{r.timecode}</span>
                  </div>
                  <figcaption className="space-y-3 p-4">
                    <p className="text-base font-medium leading-relaxed">{r.caption}</p>
                    <div className="flex gap-2">
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
                  </figcaption>
                </figure>
              ))}
            </div>

            <div className="mt-8 text-center">
              <button
                className="rounded-2xl border border-slate-600 px-6 py-3 font-medium hover:border-slate-400 disabled:opacity-50"
                disabled={loading}
                onClick={reroll}
              >
                {loading ? "换一批中…" : "换一批"}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
