import { NextResponse } from "next/server";

import { isValidSlug } from "@/lib/post-index";
import { incrementLike } from "@/lib/db";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: "unknown post" }, { status: 404 });
  }
  return NextResponse.json(await incrementLike(slug));
}
