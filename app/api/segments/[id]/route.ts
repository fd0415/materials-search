import { getSegmentDetail } from "@/lib/segments";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type SegmentRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, { params }: SegmentRouteProps) {
  const { id } = await params;

  try {
    const segment = await getSegmentDetail(id);
    if (!segment) {
      return NextResponse.json({ error: "Segment not found." }, { status: 404 });
    }

    return NextResponse.json({ segment });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to load segment." }, { status: 500 });
  }
}
