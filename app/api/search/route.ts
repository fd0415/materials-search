import { getRandomSegments, searchSegments } from "@/lib/segments";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const limit = Number(searchParams.get("limit") ?? (query ? 50 : 9));

  try {
    const results = query ? await searchSegments(query, limit) : await getRandomSegments(Math.min(limit, 9));
    return NextResponse.json({
      query,
      results
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Search failed." }, { status: 500 });
  }
}
