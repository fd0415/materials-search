"use client";

/* eslint-disable @next/next/no-img-element */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type SegmentLine = {
  id: string;
  lineIndex: number;
  startMs: number;
  endMs: number;
  textEn: string | null;
  textZh: string | null;
};

type SegmentResult = {
  id: string;
  episodeCode: string;
  showTitle: string;
  showOriginalTitle: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  timecodeLabel: string;
  textEn: string;
  textZh: string;
  coverImageUrl: string | null;
  videoUrl: string | null;
  licenseStatus: string | null;
  lines: SegmentLine[];
  previousSegmentId: string | null;
  nextSegmentId: string | null;
};

type SearchResponse = {
  query: string;
  results: SegmentResult[];
  error?: string;
};

const examples = ["bazinga", "quantum", "Penny", "Sheldon", "t-shirt", "谢尔顿", "量子", "Leonard"];

export function SearchExperience({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? initialQuery;
  const [draftState, setDraftState] = useState({
    sourceQuery: urlQuery,
    value: urlQuery
  });
  const [results, setResults] = useState<SegmentResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [selectedSegment, setSelectedSegment] = useState<SegmentResult | null>(null);
  const draft = draftState.sourceQuery === urlQuery ? draftState.value : urlQuery;

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setStatus("loading");
      setError("");

      try {
        const params = new URLSearchParams();
        if (urlQuery.trim()) {
          params.set("q", urlQuery.trim());
          params.set("limit", "50");
        } else {
          params.set("limit", "9");
        }

        const response = await fetch(`/api/search?${params.toString()}`, {
          signal: controller.signal
        });
        const payload = (await response.json()) as SearchResponse;
        if (!response.ok) {
          throw new Error(payload.error ?? "Search failed.");
        }

        setResults(payload.results);
        setStatus("success");
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "Search failed.");
        setStatus("error");
      }
    }

    load();
    return () => controller.abort();
  }, [urlQuery]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = draft.trim();
    const params = new URLSearchParams(searchParams.toString());

    if (nextQuery) {
      params.set("q", nextQuery);
    } else {
      params.delete("q");
    }

    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }

  function chooseExample(example: string) {
    setDraftState({
      sourceQuery: example,
      value: example
    });
    router.replace(`${pathname}?q=${encodeURIComponent(example)}`, { scroll: false });
  }

  function handleDraftChange(nextValue: string) {
    setDraftState({
      sourceQuery: urlQuery,
      value: nextValue
    });

    if (!nextValue && urlQuery.trim()) {
      setDraftState({
        sourceQuery: "",
        value: ""
      });
      router.replace(pathname, { scroll: false });
    }
  }

  async function shareCurrentSearch() {
    await navigator.clipboard.writeText(window.location.href);
  }

  const heading = urlQuery.trim() ? `搜索 “${urlQuery.trim()}”` : "今日随机片段";

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="sticky top-0 z-20 border-b border-slate-200/70 bg-slate-50/95 px-5 py-6 shadow-sm backdrop-blur">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <p className="font-serif text-sm uppercase tracking-[0.5em] text-slate-500">The Big Bang Theory</p>
            <h1 className="mt-3 font-serif text-5xl italic tracking-tight text-slate-950 md:text-7xl">
              The Big Bang Theory
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-base text-slate-500 md:text-lg">
              “I&apos;m not crazy. My mother had me tested.”
            </p>
          </div>

          <form
            className="mx-auto mt-7 flex max-w-3xl flex-col gap-3 rounded-[2rem] border border-slate-200 bg-white p-2 shadow-xl shadow-slate-200/70 md:flex-row"
            onSubmit={handleSearch}
          >
            <input
              className="min-h-14 flex-1 rounded-[1.5rem] border border-transparent bg-slate-50 px-5 text-base text-slate-950 outline-none placeholder:text-slate-400 focus:border-slate-300 focus:bg-white"
              onChange={(event) => handleDraftChange(event.target.value)}
              placeholder="Search bazinga, quantum, Sheldon, 谢尔顿..."
              type="search"
              value={draft}
            />
            <button
              className="min-h-14 rounded-[1.5rem] bg-slate-950 px-8 font-semibold text-white transition hover:bg-slate-800"
              type="submit"
            >
              搜索
            </button>
          </form>

          <div className="mx-auto mt-4 flex max-w-3xl flex-wrap justify-center gap-2">
            {examples.map((example) => (
              <button
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
                key={example}
                onClick={() => chooseExample(example)}
                type="button"
              >
                {example}
              </button>
            ))}
            {urlQuery.trim() ? (
              <button
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
                onClick={shareCurrentSearch}
                type="button"
              >
                复制当前搜索
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-8">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">subtitle segments</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">{heading}</h2>
          </div>
          <p className="text-sm text-slate-500">{status === "success" ? `${results.length} 段素材` : "加载中"}</p>
        </div>

        {status === "loading" ? <LoadingGrid /> : null}
        {status === "error" ? <StateMessage title="加载失败" description={error || "请稍后再试。"} /> : null}
        {status === "success" && results.length === 0 ? (
          <StateMessage title="没有找到结果" description="换一个关键词试试，例如 bazinga、quantum 或 谢尔顿。" />
        ) : null}
        {status === "success" && results.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {results.map((segment) => (
              <SegmentCard key={segment.id} onOpen={() => setSelectedSegment(segment)} segment={segment} />
            ))}
          </div>
        ) : null}
      </section>

      <SegmentModal
        onClose={() => setSelectedSegment(null)}
        onSegmentChange={setSelectedSegment}
        segment={selectedSegment}
      />
    </main>
  );
}

function SegmentCard({ segment, onOpen }: { segment: SegmentResult; onOpen: () => void }) {
  return (
    <article
      className="group cursor-pointer overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200"
      onClick={onOpen}
    >
      <div className="relative aspect-video overflow-hidden bg-slate-200">
        {segment.coverImageUrl ? (
          <img
            alt={`${segment.episodeCode} ${segment.timecodeLabel}`}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            loading="lazy"
            src={segment.coverImageUrl}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300 text-sm text-slate-500">
            No cover
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/10 to-transparent" />
        <div className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-950">
          {segment.episodeCode}
        </div>
        <div className="absolute right-4 top-4 rounded-full bg-slate-950/80 px-3 py-1 text-xs font-semibold text-white">
          {formatDuration(segment.durationMs)}
        </div>
        <div className="absolute bottom-4 left-4 right-4">
          <p className="line-clamp-2 text-lg font-semibold leading-6 text-white">{segment.textEn}</p>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-100">{segment.textZh}</p>
        </div>
      </div>
      <div className="space-y-3 p-5">
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>{segment.timecodeLabel}</span>
          <button className="font-medium text-slate-950" onClick={onOpen} type="button">
            查看片段
          </button>
        </div>
      </div>
    </article>
  );
}

function SegmentModal({
  segment,
  onClose,
  onSegmentChange
}: {
  segment: SegmentResult | null;
  onClose: () => void;
  onSegmentChange: (segment: SegmentResult | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [loadingSegment, setLoadingSegment] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const startSeconds = useMemo(() => (segment ? segment.startMs / 1000 : 0), [segment]);
  const endSeconds = useMemo(() => (segment ? segment.endMs / 1000 : 0), [segment]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !segment?.videoUrl) {
      return;
    }

    const handleLoadedMetadata = () => {
      video.currentTime = startSeconds;
      void video.play().catch(() => undefined);
    };
    const handleTimeUpdate = () => {
      if (video.currentTime >= endSeconds) {
        video.pause();
        video.currentTime = endSeconds;
      }
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.load();

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [endSeconds, segment, startSeconds]);

  if (!segment) {
    return null;
  }

  async function loadNeighbor(segmentId: string | null) {
    if (!segmentId) {
      return;
    }

    setLoadingSegment(true);
    setShareStatus("");
    try {
      const response = await fetch(`/api/segments/${segmentId}`);
      const payload = (await response.json()) as {
        segment?: SegmentResult;
        error?: string;
      };
      if (!response.ok || !payload.segment) {
        throw new Error(payload.error ?? "Failed to load segment.");
      }

      onSegmentChange(payload.segment);
    } finally {
      setLoadingSegment(false);
    }
  }

  async function createSegmentShare() {
    if (!segment) {
      return;
    }

    setShareStatus("生成中...");
    const response = await fetch("/api/shares", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        segmentId: segment.id,
        title: `${segment.episodeCode} ${segment.timecodeLabel}`
      })
    });
    const payload = (await response.json()) as {
      url?: string;
      error?: string;
    };

    if (!response.ok || !payload.url) {
      setShareStatus(payload.error ?? "生成失败");
      return;
    }

    const shareUrl = new URL(payload.url, window.location.origin).toString();
    await navigator.clipboard.writeText(shareUrl);
    setShareStatus("分享链接已复制");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <section className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-sm font-medium text-slate-500">
              {segment.episodeCode} · {segment.timecodeLabel}
            </p>
            <h3 className="text-xl font-semibold text-slate-950">{segment.showTitle}</h3>
          </div>
          <button className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="grid max-h-[calc(92vh-73px)] overflow-y-auto lg:grid-cols-[1.25fr_0.75fr]">
          <div className="bg-slate-950 p-4">
            {segment.videoUrl ? (
              <video
                className="aspect-video w-full rounded-2xl bg-black object-contain"
                controls
                playsInline
                poster={segment.coverImageUrl ?? undefined}
                ref={videoRef}
                src={segment.videoUrl}
              />
            ) : segment.coverImageUrl ? (
              <img alt="" className="aspect-video w-full rounded-2xl object-cover" src={segment.coverImageUrl} />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center rounded-2xl bg-slate-900 text-slate-400">
                No playable media
              </div>
            )}
            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!segment.previousSegmentId || loadingSegment}
                onClick={() => loadNeighbor(segment.previousSegmentId)}
              >
                ← 上一段
              </button>
              <button
                className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!segment.nextSegmentId || loadingSegment}
                onClick={() => loadNeighbor(segment.nextSegmentId)}
              >
                下一段 →
              </button>
            </div>
          </div>

          <aside className="space-y-5 p-6">
            <div className="rounded-3xl bg-slate-50 p-5">
              <p className="text-xl font-semibold leading-8 text-slate-950">{segment.textEn}</p>
              <p className="mt-3 text-lg leading-8 text-slate-700">{segment.textZh}</p>
            </div>

            <div className="space-y-3">
              {segment.lines.map((line) => (
                <div className="rounded-2xl border border-slate-200 p-4" key={line.id}>
                  <p className="text-sm text-slate-400">{formatLineTime(line.startMs, line.endMs)}</p>
                  <p className="mt-2 font-medium text-slate-950">{line.textEn}</p>
                  <p className="mt-1 text-slate-600">{line.textZh}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
                onClick={createSegmentShare}
              >
                生成单条分享
              </button>
              <span className="rounded-full bg-amber-50 px-5 py-3 text-sm text-amber-700">
                {segment.licenseStatus ?? "private_only"}
              </span>
            </div>
            {shareStatus ? <p className="text-sm text-slate-500">{shareStatus}</p> : null}
          </aside>
        </div>
      </section>
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 9 }).map((_, index) => (
        <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white" key={index}>
          <div className="aspect-video animate-pulse bg-slate-200" />
          <div className="space-y-3 p-5">
            <div className="h-4 w-1/3 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

function StateMessage({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center">
      <h3 className="text-xl font-semibold text-slate-950">{title}</h3>
      <p className="mt-2 text-slate-500">{description}</p>
    </div>
  );
}

function formatDuration(ms: number) {
  return `${Math.max(1, Math.round(ms / 1000))}s`;
}

function formatLineTime(startMs: number, endMs: number) {
  return `${formatShortTime(startMs)} - ${formatShortTime(endMs)}`;
}

function formatShortTime(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
