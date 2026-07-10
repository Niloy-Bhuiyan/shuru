"use client";

/**
 * LIVE DOCUMENT PREVIEW — looks like a real, exportable resume (light page,
 * serif, hairline rules). Deliberately NOT pixel-styled: the pixel world is
 * the chrome around it; this simulates the actual document (.resume-doc is
 * exempted from the forge-world palette remap in globals.css).
 *
 * Entries are clickable: selecting one anchors the inline EntryToolbar
 * above it (move / edit / eye / delete / improve).
 */

import React, { forwardRef } from "react";
import { cx } from "@/lib/cx";
import type { ResumeContent } from "@/lib/types";

export type EntryRef =
  | { kind: "summary" }
  | { kind: "experience"; index: number }
  | { kind: "projects"; index: number }
  | { kind: "education"; index: number };

export function entryKey(e: EntryRef): string {
  return e.kind === "summary" ? "summary" : `${e.kind}-${e.index}`;
}

function Selectable({
  id,
  active,
  onSelect,
  anchor,
  children,
}: {
  id: string;
  active: boolean;
  onSelect: () => void;
  anchor?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      id={`pv-${id}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      className={cx(
        "relative -mx-1 px-1 text-left",
        active && "outline outline-2 outline-dashed outline-[#7C6FF0]"
      )}
    >
      {active && anchor && (
        <div className="absolute -top-4 left-1/2 z-10 -translate-x-1/2">{anchor}</div>
      )}
      {children}
    </div>
  );
}

export const ResumePreview = forwardRef<
  HTMLDivElement,
  {
    content: ResumeContent;
    selected: EntryRef | null;
    onSelect: (e: EntryRef | null) => void;
    toolbarFor: (e: EntryRef) => React.ReactNode;
  }
>(function ResumePreview({ content, selected, onSelect, toolbarFor }, ref) {
  const c = content;
  const sel = selected ? entryKey(selected) : "";

  const H = ({ children }: { children: React.ReactNode }) => (
    <h2 className="mt-4 border-b border-[#1c1c1c] pb-0.5 text-[13px] font-bold uppercase tracking-wide">
      {children}
    </h2>
  );

  const sections: Record<string, React.ReactNode> = {
    contact: (
      <header key="contact" className="text-center">
        <h1 className="text-[22px] font-bold tracking-wide">
          {c.contact.name || "Your Name"}
        </h1>
        <p className="mt-1 text-[11px]">
          {[c.contact.email, c.contact.phone, c.contact.location, ...c.contact.links]
            .filter(Boolean)
            .join("  ·  ")}
        </p>
      </header>
    ),
    summary: c.summary.trim() ? (
      <div key="summary">
        <H>Professional Summary</H>
        <Selectable
          id="summary"
          active={sel === "summary"}
          onSelect={() => onSelect({ kind: "summary" })}
          anchor={toolbarFor({ kind: "summary" })}
        >
          <p className="mt-1 text-[11.5px] leading-relaxed">{c.summary}</p>
        </Selectable>
      </div>
    ) : null,
    education: c.education.length ? (
      <div key="education">
        <H>Education</H>
        {c.education.map((e, i) => (
          <Selectable
            key={i}
            id={`education-${i}`}
            active={sel === `education-${i}`}
            onSelect={() => onSelect({ kind: "education", index: i })}
            anchor={toolbarFor({ kind: "education", index: i })}
          >
            <div className="mt-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[12px] font-bold">{e.institution}</p>
                <p className="shrink-0 text-[10.5px] italic">
                  {[e.start, e.end].filter(Boolean).join(" – ")}
                </p>
              </div>
              <p className="text-[11.5px] italic">{e.degree}</p>
              {e.notes && <p className="text-[11px]">{e.notes}</p>}
            </div>
          </Selectable>
        ))}
      </div>
    ) : null,
    experience: c.experience.length ? (
      <div key="experience">
        <H>Experience</H>
        {c.experience.map((e, i) => (
          <Selectable
            key={i}
            id={`experience-${i}`}
            active={sel === `experience-${i}`}
            onSelect={() => onSelect({ kind: "experience", index: i })}
            anchor={toolbarFor({ kind: "experience", index: i })}
          >
            <div className="mt-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[12px] font-bold">
                  {e.role}
                  {e.company ? ` — ${e.company}` : ""}
                </p>
                <p className="shrink-0 text-[10.5px] italic">
                  {[e.start, e.end].filter(Boolean).join(" – ")}
                </p>
              </div>
              <ul className="ml-4 mt-0.5 list-disc space-y-0.5">
                {e.bullets.filter(Boolean).map((b, j) => (
                  <li key={j} className="text-[11.5px] leading-snug">
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          </Selectable>
        ))}
      </div>
    ) : null,
    projects: c.projects.length ? (
      <div key="projects">
        <H>Projects</H>
        {c.projects.map((p, i) => (
          <Selectable
            key={i}
            id={`projects-${i}`}
            active={sel === `projects-${i}`}
            onSelect={() => onSelect({ kind: "projects", index: i })}
            anchor={toolbarFor({ kind: "projects", index: i })}
          >
            <div className="mt-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[12px] font-bold">
                  {p.name}
                  {p.link ? (
                    <span className="font-normal italic"> · {p.link}</span>
                  ) : null}
                </p>
              </div>
              <ul className="ml-4 mt-0.5 list-disc space-y-0.5">
                {p.bullets.filter(Boolean).map((b, j) => (
                  <li key={j} className="text-[11.5px] leading-snug">
                    {b}
                  </li>
                ))}
              </ul>
              {p.tech && (
                <p className="text-[10.5px] italic">Technologies: {p.tech}</p>
              )}
            </div>
          </Selectable>
        ))}
      </div>
    ) : null,
    skills: c.skills.length ? (
      <div key="skills">
        <H>Skills</H>
        <p className="mt-1 text-[11.5px] leading-relaxed">{c.skills.join(" · ")}</p>
      </div>
    ) : null,
  };

  return (
    <div
      ref={ref}
      className="resume-doc mx-auto w-full max-w-[640px] px-6 py-7 shadow-pixel"
      onClick={(e) => {
        if (e.target === e.currentTarget) onSelect(null);
      }}
    >
      {content.order.map((key) => sections[key])}
    </div>
  );
});

export default ResumePreview;
