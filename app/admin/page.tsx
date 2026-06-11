import Link from "next/link";

const adminLinks = [
  {
    href: "/admin/imports",
    title: "字幕导入",
    description: "登记字幕源、查看导入状态和数据批次。"
  },
  {
    href: "/admin/qa",
    title: "数据质检",
    description: "检查字幕对齐、时间码异常和缺失封面。"
  },
  {
    href: "/admin/search-debug",
    title: "搜索调试",
    description: "观察搜索结果、相关性分数和排序原因。"
  }
];

export default function AdminPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10">
      <Link className="text-sm text-blue-200 hover:text-blue-100" href="/">
        返回首页
      </Link>
      <section className="mt-10">
        <p className="text-sm uppercase tracking-[0.28em] text-blue-200">Admin</p>
        <h1 className="mt-3 text-4xl font-bold text-white">后台工作台</h1>
        <p className="mt-4 max-w-2xl text-slate-300">
          MVP 阶段先放置导入、质检和搜索调试入口，等 Supabase 表结构和脚本稳定后再接入真实数据。
        </p>
      </section>

      <section className="mt-10 grid gap-5 md:grid-cols-3">
        {adminLinks.map((link) => (
          <Link className="rounded-3xl border border-white/10 bg-white/10 p-6 hover:bg-white/15" href={link.href} key={link.href}>
            <h2 className="text-xl font-semibold text-white">{link.title}</h2>
            <p className="mt-3 leading-7 text-slate-300">{link.description}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
