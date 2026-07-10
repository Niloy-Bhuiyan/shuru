/**
 * PARSE RESUME — upload a PDF/DOCX, get back structured ResumeContent.
 *  1. Extract raw text server-side: pdf-parse (PDF) / mammoth (DOCX). Free.
 *  2. If a Gemini key is set: structure the raw text into the resume schema.
 *  3. No key (or AI failure): graceful fallback — raw text lands in Summary
 *     so the flow still works end-to-end, just less structured.
 * Response: { content: ResumeContent, structured: boolean }
 */

import { NextRequest, NextResponse } from "next/server";
// pdf-parse's index.js runs a self-test on bare import — import the lib file.
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import mammoth from "mammoth";
import { agentEnabled, askAgent } from "@/lib/agent/adapter";
import { emptyResumeContent } from "@/lib/types";
import type { ResumeContent, ResumeSectionKey } from "@/lib/types";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// ── strict sanitizer: whatever the model returns, only valid shape survives ──
const s = (v: unknown): string => (typeof v === "string" ? v.slice(0, 2000) : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v.slice(0, 20) : []);
const strArr = (v: unknown): string[] =>
  arr(v).map(s).map((x) => x.trim()).filter(Boolean);

function sanitizeContent(raw: unknown): ResumeContent {
  const base = emptyResumeContent();
  if (typeof raw !== "object" || raw === null) return base;
  const r = raw as Record<string, unknown>;
  const contact = (r.contact ?? {}) as Record<string, unknown>;

  const valid: ResumeSectionKey[] = ["contact", "summary", "education", "experience", "projects", "skills"];
  const order = strArr(r.order).filter((k): k is ResumeSectionKey =>
    (valid as string[]).includes(k)
  );

  return {
    order: order.length === valid.length ? order : base.order,
    contact: {
      name: s(contact.name),
      email: s(contact.email),
      phone: s(contact.phone),
      location: s(contact.location),
      links: strArr(contact.links),
    },
    summary: s(r.summary),
    education: arr(r.education).map((e) => {
      const x = (e ?? {}) as Record<string, unknown>;
      return {
        institution: s(x.institution),
        degree: s(x.degree),
        start: s(x.start),
        end: s(x.end),
        notes: s(x.notes),
      };
    }),
    experience: arr(r.experience).map((e) => {
      const x = (e ?? {}) as Record<string, unknown>;
      return {
        company: s(x.company),
        role: s(x.role),
        start: s(x.start),
        end: s(x.end),
        bullets: strArr(x.bullets),
      };
    }),
    projects: arr(r.projects).map((e) => {
      const x = (e ?? {}) as Record<string, unknown>;
      return {
        name: s(x.name),
        link: s(x.link),
        tech: s(x.tech),
        bullets: strArr(x.bullets),
      };
    }),
    skills: strArr(r.skills).slice(0, 40),
  };
}

function rawFallback(text: string): ResumeContent {
  return { ...emptyResumeContent(), summary: text.slice(0, 4000) };
}

async function structureWithAi(text: string): Promise<ResumeContent | null> {
  const prompt = [
    `Convert this raw resume text into JSON with EXACTLY this shape:`,
    `{"contact":{"name":"","email":"","phone":"","location":"","links":[""]},"summary":"","education":[{"institution":"","degree":"","start":"","end":"","notes":""}],"experience":[{"company":"","role":"","start":"","end":"","bullets":[""]}],"projects":[{"name":"","link":"","tech":"","bullets":[""]}],"skills":[""]}`,
    `Rules: copy content faithfully, never invent facts; put achievement lines into "bullets" (one bullet per line, no leading dashes); "tech" is a comma-separated string; academic results like CGPA go in education "notes"; skills is a flat list of individual skills; if a field is unknown use "" or []. Return ONLY the JSON object — no markdown fences, no commentary.`,
    `Resume text:\n${text.slice(0, 12000)}`,
  ].join("\n\n");

  try {
    const { finalText } = await askAgent([{ role: "user", content: prompt }], [], {
      temperature: 0.1,
      maxTokens: 4000,
    });
    const cleaned = finalText.replace(/```json\n?|```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    return sanitizeContent(JSON.parse(cleaned.slice(start, end + 1)));
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    /* falls through to bad_request */
  }
  if (!file) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const name = (file.name ?? "").toLowerCase();

  // Prefer magic bytes (file content) over the client-supplied name/type,
  // which mobile pickers often get wrong. Only fall back to name/type when the
  // magic bytes are inconclusive (neither a PDF header nor a ZIP/DOCX header),
  // so a mislabeled file is never routed to the wrong parser.
  const magicPdf = buf.subarray(0, 5).toString("latin1") === "%PDF-";
  const magicZip = buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  const inconclusive = !magicPdf && !magicZip;
  const isPdf =
    magicPdf || (inconclusive && (name.endsWith(".pdf") || file.type === "application/pdf"));
  const isDocx =
    !magicPdf &&
    (magicZip ||
      (inconclusive &&
        (name.endsWith(".docx") ||
          file.type ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document")));

  let text = "";
  try {
    if (isPdf) {
      const parsed = await pdfParse(buf);
      text = parsed.text ?? "";
    } else if (isDocx) {
      const parsed = await mammoth.extractRawText({ buffer: buf });
      text = parsed.value ?? "";
    } else {
      return NextResponse.json({ error: "unsupported_type" }, { status: 415 });
    }
  } catch {
    return NextResponse.json({ error: "extract_failed" }, { status: 422 });
  }

  text = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) {
    return NextResponse.json({ error: "no_text" }, { status: 422 });
  }

  if (agentEnabled()) {
    const structured = await structureWithAi(text);
    if (structured) {
      return NextResponse.json({ content: structured, structured: true });
    }
  }
  // honest fallback — the feature works end-to-end without AI
  return NextResponse.json({ content: rawFallback(text), structured: false });
}
