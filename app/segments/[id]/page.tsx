/* eslint-disable @next/next/no-img-element */

import { getSegmentDetail } from "@/lib/segments";
import Link from "next/link";
import { notFound } from "next/navigation";

type SegmentPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function SegmentPage({ params }: SegmentPageProps) {
  const { id } = await params;
  const segment = await getSegmentDetail(id);

  if (!segment) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-950">
      <div className="mx-auto w-full max-w-5xl">
        <Link className="text-sm font-medium text-slate-500 hover:text-slate-950" href="/">
          返回搜索
        </Link>

        <article className="mt-8 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
          {segment.coverImageUrl ? (
            <img alt="" className="aspect-video w-full object-cover" src={segment.coverImageUrl} />
          ) : (
            <div className="flex aspect-video items-center justify-center bg-slate-200 text-slate-500">No cover</div>
          )}
          <div className="space-y-6 p-6 md:p-8">
            <div>
              <p className="text-sm uppercase tracking-[0.28em] text-slate-400">
                {segment.episodeCode} · {segment.timecodeLabel}
              </p>
              <h1 className="mt-3 text-3xl font-bold text-slate-950">{segment.showTitle}</h1>
              <p className="mt-2 text-sm text-slate-500">Segment ID: {id}</p>
            </div>

            <div className="rounded-3xl bg-slate-50 p-5">
              <p className="text-xl font-semibold leading-8 text-slate-950">{segment.textEn}</p>
              <p className="mt-3 leading-8 text-slate-700">{segment.textZh}</p>
            </div>

            <div className="grid gap-3">
              {segment.lines.map((line) => (
                <div className="rounded-2xl border border-slate-200 p-4" key={line.id}>
                  <p className="text-sm text-slate-400">
                    {line.lineIndex} · {line.startMs}ms - {line.endMs}ms
                  </p>
                  <p className="mt-2 font-medium text-slate-950">{line.textEn}</p>
                  <p className="mt-1 text-slate-600">{line.textZh}</p>
                </div>
              ))}
            </div>
          </div>
        </article>
      </div>
    </main>
  );
}
