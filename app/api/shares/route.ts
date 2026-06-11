import { createShare } from "@/lib/segments";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      segmentId?: string;
      title?: string;
    };

    if (!body.segmentId) {
      return NextResponse.json({ error: "segmentId is required." }, { status: 400 });
    }

    const slug = await createShare(body.segmentId, body.title);
    return NextResponse.json({
      slug,
      url: `/share/${slug}`
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create share." }, { status: 500 });
  }
}
