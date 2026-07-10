"use client";

/**
 * WIZARD STEP 2 — BUILD. One resume section per focused screen, in a fixed
 * teaching order (Contact → Summary → Education → Experience → Projects →
 * Skills). Each screen: a one-line "why this matters" hint, the section's
 * fields (existing PixelInput / BulletsEditor / EntryToolbar — eye retired
 * per B1 sign-off), six progress dots (tappable), and BACK / NEXT. The last
 * NEXT becomes SEE MY SCORE.
 *
 * All edits flow through the page's history-aware update() so undo/redo in
 * the top bar covers everything here. AI improve is delegated up to the
 * page (shared with TAILOR in B5).
 */

import React, { useRef } from "react";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelBadge } from "@/components/pixel/PixelBadge";
import { PixelInput } from "@/components/pixel/PixelInput";
import { BulletsEditor } from "@/components/forge/BulletsEditor";
import { EntryToolbar } from "@/components/forge/EntryToolbar";
import { entryKey, type EntryRef } from "@/components/forge/ResumePreview";
import { useLang, type StringKey } from "@/lib/i18n";
import { cx } from "@/lib/cx";
import type { ResumeContent, ResumeSectionKey } from "@/lib/types";

/** fixed teaching order — content.order (preview/PDF order) is untouched */
export const BUILD_ORDER: ResumeSectionKey[] = [
  "contact",
  "summary",
  "education",
  "experience",
  "projects",
  "skills",
];

const SECTION_LABEL: Record<ResumeSectionKey, StringKey> = {
  contact: "forge.section.contact",
  summary: "forge.section.summary",
  education: "forge.section.education",
  experience: "forge.section.experience",
  projects: "forge.section.projects",
  skills: "forge.section.skills",
};

const WHY: Record<ResumeSectionKey, StringKey> = {
  contact: "forge.why.contact",
  summary: "forge.why.summary",
  education: "forge.why.education",
  experience: "forge.why.experience",
  projects: "forge.why.projects",
  skills: "forge.why.skills",
};

export function sectionComplete(c: ResumeContent, k: ResumeSectionKey): boolean {
  switch (k) {
    case "contact":
      return !!c.contact.name.trim() && !!c.contact.email.trim();
    case "summary":
      return c.summary.trim().length > 0;
    case "education":
      return c.education.length > 0;
    case "experience":
      return c.experience.length > 0;
    case "projects":
      return c.projects.length > 0;
    case "skills":
      return c.skills.length >= 3;
  }
}

export type ImproveState = {
  ref: EntryRef;
  busy: boolean;
  options: string[] | null;
  error?: boolean;
} | null;

export function StepBuild({
  content,
  update,
  buildIndex,
  setBuildIndex,
  onDone,
  improve,
  onImprove,
}: {
  content: ResumeContent;
  update: (patch: Partial<ResumeContent>) => void;
  buildIndex: number;
  setBuildIndex: (i: number) => void;
  onDone: () => void;
  improve: ImproveState;
  onImprove: (ref: EntryRef) => void;
}) {
  const { t } = useLang();
  const skillsDraft = useRef<string | null>(null);
  const section = BUILD_ORDER[buildIndex];

  function moveEntry(ref: EntryRef, dir: -1 | 1) {
    if (ref.kind === "summary") return;
    const list = [...content[ref.kind]] as unknown[];
    const j = ref.index + dir;
    if (j < 0 || j >= list.length) return;
    [list[ref.index], list[j]] = [list[j], list[ref.index]];
    update({ [ref.kind]: list } as Partial<ResumeContent>);
  }
  function deleteEntry(ref: EntryRef) {
    if (ref.kind === "summary") update({ summary: "" });
    else
      update({
        [ref.kind]: (content[ref.kind] as unknown[]).filter((_, i) => i !== ref.index),
      } as Partial<ResumeContent>);
  }

  const toolbarFor = (ref: EntryRef) => (
    <EntryToolbar
      onUp={ref.kind !== "summary" && ref.index > 0 ? () => moveEntry(ref, -1) : undefined}
      onDown={
        ref.kind !== "summary" && ref.index < content[ref.kind].length - 1
          ? () => moveEntry(ref, 1)
          : undefined
      }
      onDelete={() => deleteEntry(ref)}
      onImprove={ref.kind !== "education" ? () => onImprove(ref) : undefined}
      improving={improve?.busy && entryKey(improve.ref) === entryKey(ref)}
    />
  );

  const body: Record<ResumeSectionKey, React.ReactNode> = {
    contact: (
      <div className="space-y-3">
        <PixelInput label={t("auth.name")} name="r-name" value={content.contact.name} onChange={(v) => update({ contact: { ...content.contact, name: v } })} />
        <PixelInput label={t("auth.email")} name="r-email" type="email" value={content.contact.email} onChange={(v) => update({ contact: { ...content.contact, email: v } })} placeholder="you@university.edu" />
        <PixelInput label="Phone" name="r-phone" value={content.contact.phone} onChange={(v) => update({ contact: { ...content.contact, phone: v } })} placeholder="+8801XXXXXXXXX" />
        <PixelInput label={t("detail.location")} name="r-loc" value={content.contact.location} onChange={(v) => update({ contact: { ...content.contact, location: v } })} />
        <PixelInput label="Links" name="r-links" value={content.contact.links.join(", ")} onChange={(v) => update({ contact: { ...content.contact, links: v.split(",").map((s) => s.trim()).filter(Boolean) } })} hint="Comma separated" />
      </div>
    ),
    summary: (
      <div className="space-y-3">
        <textarea
          value={content.summary}
          aria-label={t("forge.section.summary")}
          onChange={(e) => update({ summary: e.target.value })}
          rows={5}
          className="w-full border-3 border-ink bg-cream px-3 py-2 font-mono text-xs leading-relaxed text-ink placeholder:text-grey focus:outline-none focus:shadow-pixel-sm"
          placeholder="2–3 sentences: who you are, what you build, what you're aiming at."
        />
        {toolbarFor({ kind: "summary" })}
      </div>
    ),
    education: (
      <div className="space-y-3">
        {content.education.map((e, i) => (
          <div key={i} className="space-y-2 border-2 border-ink/30 p-2">
            <PixelInput label="Institution" name={`edu-inst-${i}`} value={e.institution} onChange={(v) => { const education = [...content.education]; education[i] = { ...e, institution: v }; update({ education }); }} />
            <PixelInput label="Degree" name={`edu-deg-${i}`} value={e.degree} onChange={(v) => { const education = [...content.education]; education[i] = { ...e, degree: v }; update({ education }); }} />
            <div className="grid grid-cols-2 gap-2">
              <PixelInput label="Start" name={`edu-s-${i}`} value={e.start} onChange={(v) => { const education = [...content.education]; education[i] = { ...e, start: v }; update({ education }); }} placeholder="Jan 2023" />
              <PixelInput label="End" name={`edu-e-${i}`} value={e.end} onChange={(v) => { const education = [...content.education]; education[i] = { ...e, end: v }; update({ education }); }} placeholder="Dec 2026" />
            </div>
            <PixelInput label="Notes" name={`edu-n-${i}`} value={e.notes} onChange={(v) => { const education = [...content.education]; education[i] = { ...e, notes: v }; update({ education }); }} hint="CGPA, honors, expected graduation…" />
            {toolbarFor({ kind: "education", index: i })}
          </div>
        ))}
        <PixelButton size="sm" variant="secondary" onClick={() => update({ education: [...content.education, { institution: "", degree: "", start: "", end: "", notes: "" }] })}>
          + {t("forge.addEntry")}
        </PixelButton>
      </div>
    ),
    experience: (
      <div className="space-y-3">
        {content.experience.map((e, i) => (
          <div key={i} className="space-y-2 border-2 border-ink/30 p-2">
            <PixelInput label="Company" name={`exp-c-${i}`} value={e.company} onChange={(v) => { const experience = [...content.experience]; experience[i] = { ...e, company: v }; update({ experience }); }} />
            <PixelInput label="Role" name={`exp-r-${i}`} value={e.role} onChange={(v) => { const experience = [...content.experience]; experience[i] = { ...e, role: v }; update({ experience }); }} />
            <div className="grid grid-cols-2 gap-2">
              <PixelInput label="Start" name={`exp-s-${i}`} value={e.start} onChange={(v) => { const experience = [...content.experience]; experience[i] = { ...e, start: v }; update({ experience }); }} />
              <PixelInput label="End" name={`exp-e-${i}`} value={e.end} onChange={(v) => { const experience = [...content.experience]; experience[i] = { ...e, end: v }; update({ experience }); }} />
            </div>
            <BulletsEditor bullets={e.bullets} onChange={(bullets) => { const experience = [...content.experience]; experience[i] = { ...e, bullets }; update({ experience }); }} />
            {toolbarFor({ kind: "experience", index: i })}
          </div>
        ))}
        <PixelButton size="sm" variant="secondary" onClick={() => update({ experience: [...content.experience, { company: "", role: "", start: "", end: "", bullets: ["", ""] }] })}>
          + {t("forge.addEntry")}
        </PixelButton>
      </div>
    ),
    projects: (
      <div className="space-y-3">
        {content.projects.map((p, i) => (
          <div key={i} className="space-y-2 border-2 border-ink/30 p-2">
            <PixelInput label="Project" name={`prj-n-${i}`} value={p.name} onChange={(v) => { const projects = [...content.projects]; projects[i] = { ...p, name: v }; update({ projects }); }} />
            <PixelInput label="Link" name={`prj-l-${i}`} value={p.link} onChange={(v) => { const projects = [...content.projects]; projects[i] = { ...p, link: v }; update({ projects }); }} placeholder="live URL or repo" />
            <PixelInput label="Tech" name={`prj-t-${i}`} value={p.tech} onChange={(v) => { const projects = [...content.projects]; projects[i] = { ...p, tech: v }; update({ projects }); }} hint="Comma separated" />
            <BulletsEditor bullets={p.bullets} onChange={(bullets) => { const projects = [...content.projects]; projects[i] = { ...p, bullets }; update({ projects }); }} />
            {toolbarFor({ kind: "projects", index: i })}
          </div>
        ))}
        <PixelButton size="sm" variant="secondary" onClick={() => update({ projects: [...content.projects, { name: "", link: "", tech: "", bullets: ["", ""] }] })}>
          + {t("forge.addEntry")}
        </PixelButton>
      </div>
    ),
    skills: (
      <div className="space-y-3">
        <PixelInput
          label={t("auth.skills")}
          name="r-skills"
          value={skillsDraft.current ?? content.skills.join(", ")}
          onChange={(v) => {
            skillsDraft.current = v;
            update({ skills: v.split(",").map((s) => s.trim()).filter(Boolean) });
          }}
          hint={t("auth.skillsHint")}
        />
        <div className="flex flex-wrap gap-1.5">
          {content.skills.map((s) => (
            <PixelBadge key={s} tone="neutral">{s}</PixelBadge>
          ))}
        </div>
      </div>
    ),
  };

  return (
    <div className="mt-4">
      {/* section progress dots — remaining sections at a glance, tappable */}
      <div className="flex items-center justify-center gap-2" role="tablist" aria-label="Sections">
        {BUILD_ORDER.map((k, i) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={i === buildIndex}
            aria-label={t(SECTION_LABEL[k])}
            onClick={() => setBuildIndex(i)}
            className={cx(
              "h-3 w-3 border-2 border-ink",
              i === buildIndex
                ? "pixel-blink bg-amber"
                : sectionComplete(content, k)
                  ? "bg-mint"
                  : "bg-grey opacity-60"
            )}
          />
        ))}
      </div>

      {/* the focused section */}
      <div className="mt-3 border-3 border-ink bg-paper p-3 shadow-pixel">
        <h2 className="font-pixel text-[10px] text-ink">
          {t(SECTION_LABEL[section])}{" "}
          <span className="text-grey">
            · {buildIndex + 1}/{BUILD_ORDER.length}
          </span>
        </h2>
        <p className="mt-2 border-l-4 border-amber pl-2 font-mono text-[11px] leading-snug text-grey">
          {t(WHY[section])}
        </p>
        <div className="mt-3">{body[section]}</div>
      </div>

      {/* prev / next */}
      <div className="mt-4 flex gap-2">
        <PixelButton
          variant="secondary"
          onClick={() => setBuildIndex(buildIndex - 1)}
          disabled={buildIndex === 0}
        >
          ← {t("forge.prevSection")}
        </PixelButton>
        {buildIndex < BUILD_ORDER.length - 1 ? (
          <PixelButton full onClick={() => setBuildIndex(buildIndex + 1)}>
            {t("forge.nextSection")} →
          </PixelButton>
        ) : (
          <PixelButton full variant="positive" onClick={onDone}>
            {t("forge.seeScore")} →
          </PixelButton>
        )}
      </div>
    </div>
  );
}

export default StepBuild;
