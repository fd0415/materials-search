import { NextResponse } from "next/server";
import { runAgent } from "@/lib/meme/agent";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { sessionId?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = (body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "说点什么吧。" }, { status: 400 });
  }
  const sessionId = body.sessionId?.trim() || "anon";

  try {
    const out = await runAgent(sessionId, message);
    if (out.results.length === 0) {
      return NextResponse.json({ error: "没挑到合适的，换个说法试试。", reply: out.reply }, { status: 200 });
    }
    return NextResponse.json(out);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown";
    return NextResponse.json({ error: `出错了：${detail}` }, { status: 502 });
  }
}
