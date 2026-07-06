import { NextResponse } from "next/server";

import { getPoll, isValidVote } from "@/lib/polls";
import { getPollVotes, incrementPollVote } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ pollId: string }> },
) {
  const { pollId } = await params;
  if (!getPoll(pollId)) {
    return NextResponse.json({ error: "unknown poll" }, { status: 404 });
  }
  return NextResponse.json({ votes: await getPollVotes(pollId) });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ pollId: string }> },
) {
  const { pollId } = await params;
  const body = (await req.json().catch(() => null)) as {
    option?: string;
  } | null;
  const option = body?.option;
  if (typeof option !== "string" || !isValidVote(pollId, option)) {
    return NextResponse.json({ error: "unknown poll option" }, { status: 404 });
  }
  return NextResponse.json({ votes: await incrementPollVote(pollId, option) });
}
