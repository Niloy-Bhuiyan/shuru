/**
 * EXPLAIN THIS — sends the computed odds + gaps to the LLM (via the agent
 * adapter — this file knows nothing about providers) and returns 2–3
 * plain-language sentences. No key configured → GET reports
 * {enabled:false} and the button hides; the entire app works without it.
 */

import { NextRequest, NextResponse } from "next/server";
import { agentEnabled, askAgent } from "@/lib/agent/adapter";

export async function GET() {
  return NextResponse.json({ enabled: agentEnabled() });
}

type ExplainBody = {
  company: string;
  role: string;
  percent: number;
  confidence: "HIGH" | "MED";
  n: number;
  oneThing: string | null;
  inYourFavour: string | null;
  lang: "en" | "bn";
};

export async function POST(req: NextRequest) {
  if (!agentEnabled()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  let body: ExplainBody;
  try {
    body = (await req.json()) as ExplainBody;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const prompt = [
    `You explain internship shortlist odds to a Bangladeshi university student, plainly and honestly.`,
    `Listing: ${body.role} at ${body.company}.`,
    `Computed from real past outcomes: ~${body.percent}% shortlist rate among ${body.n} similar past applicants (confidence: ${body.confidence}).`,
    body.oneThing
      ? `The single biggest thing they are missing versus shortlisted applicants: ${body.oneThing}.`
      : `No single missing factor stands out.`,
    body.inYourFavour ? `Already in their favour: ${body.inYourFavour}.` : ``,
    `Write 2-3 short sentences: what the number means, and the one concrete blocker (if any) to fix first.`,
    `No hype, no promises, no bullet points. Do not invent numbers.`,
    body.lang === "bn" ? `Reply in Bangla.` : `Reply in English.`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const { finalText } = await askAgent([{ role: "user", content: prompt }], [], {
      maxTokens: 200,
      temperature: 0.4,
    });
    if (!finalText) {
      return NextResponse.json({ error: "empty" }, { status: 502 });
    }
    return NextResponse.json({ text: finalText });
  } catch {
    return NextResponse.json({ error: "network" }, { status: 502 });
  }
}
