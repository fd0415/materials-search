import Link from "next/link";

export default function SearchDebugPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-10">
      <Link className="text-sm text-blue-200 hover:text-blue-100" href="/admin">
        返回后台
      </Link>
      <section className="mt-10 rounded-3xl border border-white/10 bg-white/10 p-8">
        <p className="text-sm uppercase tracking-[0.28em] text-blue-200">Search debug</p>
        <h1 className="mt-3 text-4xl font-bold text-white">搜索调试</h1>
        <p className="mt-4 leading-8 text-slate-300">
          后续在这里展示 SQL/RPC 返回结果、相关性分数、命中字段和排序原因。当前步骤先完成页面结构。
        </p>
      </section>
    </main>
  );
}
