import Link from "next/link";

export default function QaPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-10">
      <Link className="text-sm text-blue-200 hover:text-blue-100" href="/admin">
        返回后台
      </Link>
      <section className="mt-10 rounded-3xl border border-white/10 bg-white/10 p-8">
        <p className="text-sm uppercase tracking-[0.28em] text-blue-200">QA</p>
        <h1 className="mt-3 text-4xl font-bold text-white">数据质检</h1>
        <p className="mt-4 leading-8 text-slate-300">
          后续在这里检查字幕缺失、时间码重叠、行数异常和封面授权状态。当前步骤先完成页面结构。
        </p>
      </section>
    </main>
  );
}
