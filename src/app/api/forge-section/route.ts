/**
 * FORGE THIS SECTION — rewrite of ONE resume section, optionally tailored
 * to a pasted JD, through the agent adapter (this file knows nothing about
 * providers). GET reports availability; missing key → the button hides
 * client-side. Not a chatbot: one request in, 1–2 rewrite options out.
 */

import { NextRequest, NextResponse } from "next/server";
import { agentEnabled, askAgent } from "@/lib/agent/adapter";

export async function GET() {
  return NextResponse.json({ enabled: agentEnabled() });
}

type ForgeBody = {
  section: "summary" | "bullets";
  text: string;
  jd?: string;
  lang: "en" | "bn";
};

export async function POST(req: NextRequest) {
  if (!agentEnabled()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  let body: ForgeBody;
  try {
    body = (await req.json()) as ForgeBody;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!body.text?.trim()) {
    return NextResponse.json({ error: "empty_text" }, { status: 400 });
  }

  const isSummary = body.section === "summary";
  const prompt = [
    `You are rewriting one section of a Bangladeshi university student's internship resume.`,
    isSummary
      ? `Section type: professional summary (2–3 sentences).`
      : `Section type: achievement bullet points (keep the same number of bullets, one per line, each starting with a strong action verb).`,
    `Current text:\n${body.text.trim()}`,
    body.jd?.trim()
      ? `Target job description (mirror its genuine keywords where truthful):\n${body.jd.trim().slice(0, 2000)}`
      : ``,
    `Rules: never invent facts, numbers, tools or employers not present in the current text; keep every real number; ATS-friendly plain text only (no markdown, no tables); concise and concrete.`,
    `Return EXACTLY 2 alternative rewrites separated by a line containing only "---". No preamble, no labels, no commentary.`,
    body.lang === "bn" ? `Write both options in Bangla.` : `Write both options in English.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const { finalText } = await askAgent([{ role: "user", content: prompt }], [], {
      maxTokens: 500,
      temperature: 0.5,
    });
    const options = finalText
      .replace(/```[a-z]*\n?|```/g, "")
      .split(/\n\s*---\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 2);
    if (options.length === 0) {
      return NextResponse.json({ error: "empty" }, { status: 502 });
    }
    return NextResponse.json({ options });
  } catch {
    return NextResponse.json({ error: "network" }, { status: 502 });
  }
}
