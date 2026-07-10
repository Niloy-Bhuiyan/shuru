/**
 * TEXT-LAYER PDF EXPORT — draws the resume with jsPDF's text API so the
 * exported file contains real, selectable, ATS-parseable text (the old
 * html2canvas route produced a picture of text, which would fail the very
 * parsing this app teaches). Pure function over (doc, content) so it's
 * unit-testable in node; the page supplies a dynamically-imported jsPDF.
 * Layout mirrors the live preview: serif, centered name, ruled headers.
 */

import type { jsPDF } from "jspdf";
import type { ResumeContent, ResumeSectionKey } from "@/lib/types";

// A4 in points
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const BODY_W = PAGE_W - MARGIN * 2;

const SIZES = {
  name: 20,
  contact: 9,
  header: 11,
  entryTitle: 10.5,
  body: 9.5,
  meta: 9,
};
const LINE = 1.35;

type Cursor = { y: number };

function lineHeight(size: number): number {
  return size * LINE;
}

function ensureRoom(doc: jsPDF, cur: Cursor, needed: number) {
  if (cur.y + needed > PAGE_H - MARGIN) {
    doc.addPage();
    cur.y = MARGIN;
  }
}

function drawWrapped(
  doc: jsPDF,
  cur: Cursor,
  text: string,
  size: number,
  opts: { x?: number; width?: number; style?: string; gapAfter?: number } = {}
) {
  const x = opts.x ?? MARGIN;
  const width = opts.width ?? BODY_W - (x - MARGIN);
  doc.setFont("times", opts.style ?? "normal");
  doc.setFontSize(size);
  const lines = doc.splitTextToSize(text, width) as string[];
  for (const line of lines) {
    ensureRoom(doc, cur, lineHeight(size));
    doc.text(line, x, cur.y);
    cur.y += lineHeight(size);
  }
  cur.y += opts.gapAfter ?? 0;
}

function drawHeader(doc: jsPDF, cur: Cursor, label: string) {
  ensureRoom(doc, cur, lineHeight(SIZES.header) + 14);
  cur.y += 8;
  doc.setFont("times", "bold");
  doc.setFontSize(SIZES.header);
  doc.text(label.toUpperCase(), MARGIN, cur.y);
  cur.y += 3;
  doc.setDrawColor(28, 28, 28);
  doc.setLineWidth(0.8);
  doc.line(MARGIN, cur.y, PAGE_W - MARGIN, cur.y);
  cur.y += lineHeight(SIZES.body) * 0.9;
}

/** left title (bold) + right-aligned italic date range on one row */
function drawEntryRow(doc: jsPDF, cur: Cursor, title: string, dates: string) {
  ensureRoom(doc, cur, lineHeight(SIZES.entryTitle));
  doc.setFont("times", "italic");
  doc.setFontSize(SIZES.meta);
  const dateW = dates ? doc.getTextWidth(dates) : 0;
  if (dates) doc.text(dates, PAGE_W - MARGIN - dateW, cur.y);
  doc.setFont("times", "bold");
  doc.setFontSize(SIZES.entryTitle);
  const titleLines = doc.splitTextToSize(
    title,
    BODY_W - dateW - (dates ? 12 : 0)
  ) as string[];
  for (let i = 0; i < titleLines.length; i++) {
    if (i > 0) ensureRoom(doc, cur, lineHeight(SIZES.entryTitle));
    doc.text(titleLines[i], MARGIN, cur.y);
    cur.y += lineHeight(SIZES.entryTitle);
  }
}

function drawBullets(doc: jsPDF, cur: Cursor, bullets: string[]) {
  const indent = 14;
  for (const b of bullets.map((x) => x.trim()).filter(Boolean)) {
    doc.setFont("times", "normal");
    doc.setFontSize(SIZES.body);
    const lines = doc.splitTextToSize(b, BODY_W - indent) as string[];
    for (let i = 0; i < lines.length; i++) {
      ensureRoom(doc, cur, lineHeight(SIZES.body));
      if (i === 0) doc.text("•", MARGIN + 3, cur.y);
      doc.text(lines[i], MARGIN + indent, cur.y);
      cur.y += lineHeight(SIZES.body);
    }
  }
}

export function buildResumePdf(doc: jsPDF, c: ResumeContent): jsPDF {
  const cur: Cursor = { y: MARGIN + 6 };

  const draw: Record<ResumeSectionKey, () => void> = {
    contact: () => {
      doc.setFont("times", "bold");
      doc.setFontSize(SIZES.name);
      const name = c.contact.name.trim() || "Your Name";
      doc.text(name, PAGE_W / 2, cur.y, { align: "center" });
      cur.y += lineHeight(SIZES.name) * 0.85;
      const parts = [
        c.contact.email,
        c.contact.phone,
        c.contact.location,
        ...c.contact.links,
      ]
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length) {
        doc.setFont("times", "normal");
        doc.setFontSize(SIZES.contact);
        doc.text(parts.join("  ·  "), PAGE_W / 2, cur.y, { align: "center" });
        cur.y += lineHeight(SIZES.contact);
      }
      cur.y += 2;
    },
    summary: () => {
      if (!c.summary.trim()) return;
      drawHeader(doc, cur, "Professional Summary");
      drawWrapped(doc, cur, c.summary.trim(), SIZES.body, { gapAfter: 2 });
    },
    education: () => {
      if (!c.education.length) return;
      drawHeader(doc, cur, "Education");
      for (const e of c.education) {
        drawEntryRow(
          doc,
          cur,
          e.institution || "Institution",
          [e.start, e.end].map((s) => s.trim()).filter(Boolean).join(" – ")
        );
        if (e.degree.trim())
          drawWrapped(doc, cur, e.degree.trim(), SIZES.body, { style: "italic" });
        if (e.notes.trim()) drawWrapped(doc, cur, e.notes.trim(), SIZES.body);
        cur.y += 3;
      }
    },
    experience: () => {
      if (!c.experience.length) return;
      drawHeader(doc, cur, "Experience");
      for (const e of c.experience) {
        const title = [e.role, e.company].map((s) => s.trim()).filter(Boolean).join(" — ");
        drawEntryRow(
          doc,
          cur,
          title || "Role",
          [e.start, e.end].map((s) => s.trim()).filter(Boolean).join(" – ")
        );
        drawBullets(doc, cur, e.bullets);
        cur.y += 3;
      }
    },
    projects: () => {
      if (!c.projects.length) return;
      drawHeader(doc, cur, "Projects");
      for (const p of c.projects) {
        const title = [p.name, p.link].map((s) => s.trim()).filter(Boolean).join(" · ");
        drawEntryRow(doc, cur, title || "Project", "");
        drawBullets(doc, cur, p.bullets);
        if (p.tech.trim())
          drawWrapped(doc, cur, `Technologies: ${p.tech.trim()}`, SIZES.meta, {
            style: "italic",
          });
        cur.y += 3;
      }
    },
    skills: () => {
      if (!c.skills.length) return;
      drawHeader(doc, cur, "Skills");
      drawWrapped(doc, cur, c.skills.join(" · "), SIZES.body);
    },
  };

  for (const key of c.order) draw[key]();
  return doc;
}

export function resumeFileName(c: ResumeContent): string {
  const name = c.contact.name.trim().replace(/\s+/g, "_");
  return name ? `${name}_resume.pdf` : "resume.pdf";
}
