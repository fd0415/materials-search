import Link from "next/link";

export default function ImportsPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-10">
      <Link className="text-sm text-blue-200 hover:text-blue-100" href="/admin">
        返回后台
      </Link>
      <section className="mt-10 rounded-3xl border border-white/10 bg-white/10 p-8">
        <p className="text-sm uppercase tracking-[0.28em] text-blue-200">Imports</p>
        <h1 className="mt-3 text-4xl font-bold text-white">字幕导入</h1>
        <p className="mt-4 leading-8 text-slate-300">
          后续在这里展示字幕源文件、导入批次、解析结果和失败原因。当前步骤先完成页面结构。
        </p>
      </section>
    </main>
  );
}
