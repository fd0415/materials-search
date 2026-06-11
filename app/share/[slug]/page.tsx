/* eslint-disable @next/next/no-img-element */

import { getShare } from "@/lib/segments";
import { notFound } from "next/navigation";

type SharePageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function SharePage({ params }: SharePageProps) {
  const { slug } = await params;
  const segment = await getShare(slug);

  if (!segment) {
    notFound();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-10 text-slate-950">
      <article className="w-full max-w-3xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white text-center shadow-2xl shadow-slate-200/70">
        {segment.coverImageUrl ? (
          <img alt="" className="aspect-video w-full object-cover" src={segment.coverImageUrl} />
        ) : null}
        <div className="p-8">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Shared subtitle card</p>
          <h1 className="mt-5 font-serif text-4xl italic text-slate-950">
            {segment.showTitle} · {segment.episodeCode}
          </h1>
          <p className="mt-2 text-slate-500">{segment.timecodeLabel}</p>
          <div className="mt-8 rounded-3xl bg-slate-50 p-8">
            <p className="text-2xl font-semibold leading-10 text-slate-950">{segment.textEn}</p>
            <p className="mt-4 text-xl leading-9 text-slate-700">{segment.textZh}</p>
          </div>
          <p className="mt-6 text-sm text-slate-400">Share slug: {slug}</p>
        </div>
      </article>
    </main>
  );
}
