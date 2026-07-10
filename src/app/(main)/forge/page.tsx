"use client";

/**
 * RESUME FORGE — guided step wizard.
 *
 * START → BUILD → SCORE → TAILOR → FINISH, one full screen per step, inside
 * the 430px frame and the slate forge world. All five steps are fully built
 * and live.
 *
 * Revisit behavior: an existing saved resume drops you on SCORE (see where
 * you stand first).
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { LoadingBlock } from "@/components/LoadingBlock";
import { breakTo } from "@/components/GlassShatter";
import {
  WizardProgress,
  type WizardStep,
} from "@/components/forge/WizardProgress";
import { StepStart } from "@/components/forge/StepStart";
import { BUILD_ORDER, StepBuild, type ImproveState } from "@/components/forge/StepBuild";
import { StepScore } from "@/components/forge/StepScore";
import { StepTailor } from "@/components/forge/StepTailor";
import { StepFinish } from "@/components/forge/StepFinish";
import type { EntryRef } from "@/components/forge/ResumePreview";
import { useProfile } from "@/hooks/useProfile";
import { getResume, resumeFromProfile, saveResume } from "@/lib/data";
import { useLang } from "@/lib/i18n";
import { cx } from "@/lib/cx";
import type { ResumeContent, ResumeSectionKey } from "@/lib/types";

export default function ForgePage() {
  const router = useRouter();
  const { profile } = useProfile();
  const { t, lang } = useLang();

  const [step, setStep] = useState<WizardStep | null>(null);
  const [content, setContent] = useState<ResumeContent | null>(null);
  const [parseNote, setParseNote] = useState<"ai" | "raw" | null>(null);
  /** where to return if the user jumps to START and then keeps the current resume */
  const [stepBeforeStart, setStepBeforeStart] = useState<WizardStep>("score");
  const [buildIndex, setBuildIndex] = useState(0);
  const [improve, setImprove] = useState<ImproveState>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  /** persists across steps so BUILD's improve becomes JD-aware after tailoring */
  const [jd, setJd] = useState("");

  const LS_DISMISSED = "shuru.forge.dismissed";
  useEffect(() => {
    try {
      setDismissed(JSON.parse(window.localStorage.getItem(LS_DISMISSED) ?? "[]"));
    } catch {
      setDismissed([]);
    }
  }, []);
  function dismissCheck(id: string) {
    const next = [...dismissed, id];
    setDismissed(next);
    window.localStorage.setItem(LS_DISMISSED, JSON.stringify(next));
  }
  function restoreCheck(id: string) {
    const next = dismissed.filter((x) => x !== id);
    setDismissed(next);
    window.localStorage.setItem(LS_DISMISSED, JSON.stringify(next));
  }
  /** FIX THIS → the BUILD section that owns the failing check */
  function fixSection(section: ResumeSectionKey) {
    setImprove(null);
    setBuildIndex(Math.max(0, BUILD_ORDER.indexOf(section)));
    setStep("build");
  }

  // history-aware update: edits within 700ms group into one undo step
  const history = useRef<{ past: ResumeContent[]; future: ResumeContent[]; last: number }>({
    past: [],
    future: [],
    last: 0,
  });
  const [, bumpHistory] = useState(0);

  function update(patch: Partial<ResumeContent>) {
    setContent((c) => {
      if (!c) return c;
      const now = Date.now();
      if (now - history.current.last > 700) {
        history.current.past.push(c);
        if (history.current.past.length > 60) history.current.past.shift();
        history.current.last = now;
      }
      history.current.future = [];
      return { ...c, ...patch };
    });
    bumpHistory((n) => n + 1);
  }
  function undo() {
    const prev = history.current.past.pop();
    if (!prev) return;
    setContent((c) => {
      if (c) history.current.future.push(c);
      return prev;
    });
    bumpHistory((n) => n + 1);
  }
  function redo() {
    const next = history.current.future.pop();
    if (!next) return;
    setContent((c) => {
      if (c) history.current.past.push(c);
      return next;
    });
    bumpHistory((n) => n + 1);
  }

  // AI improve — shared by BUILD (jd-less) and TAILOR (B5, jd-aware)
  function entryText(c: ResumeContent, ref: EntryRef): string {
    if (ref.kind === "summary") return c.summary;
    if (ref.kind === "experience")
      return c.experience[ref.index]?.bullets.filter(Boolean).join("\n") ?? "";
    if (ref.kind === "projects")
      return c.projects[ref.index]?.bullets.filter(Boolean).join("\n") ?? "";
    return c.education[ref.index]?.notes ?? "";
  }
  async function runImprove(ref: EntryRef, jdText: string) {
    if (!content) return;
    const text = entryText(content, ref);
    if (!text.trim()) return;
    setImprove({ ref, busy: true, options: null });
    try {
      const res = await fetch("/api/forge-section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: ref.kind === "summary" ? "summary" : "bullets",
          text,
          jd: jdText,
          lang,
        }),
      });
      if (res.ok) {
        const d = (await res.json()) as { options: string[] };
        setImprove({ ref, busy: false, options: d.options });
        return;
      }
    } catch {
      /* fall through to the error state below */
    }
    setImprove({ ref, busy: false, options: null, error: true });
  }
  function applyImprove(option: string) {
    if (!improve || !content) return;
    const ref = improve.ref;
    if (ref.kind === "summary") update({ summary: option });
    else if (ref.kind === "experience" || ref.kind === "projects") {
      const list = [...content[ref.kind]];
      const bullets = option
        .split("\n")
        .map((b) => b.replace(/^[-•*]\s*/, "").trim())
        .filter(Boolean);
      list[ref.index] = { ...list[ref.index], bullets } as never;
      update({ [ref.kind]: list } as Partial<ResumeContent>);
    }
    setImprove(null);
  }

  useEffect(() => {
    if (!profile) return;
    getResume()
      .then((r) => {
        if (r?.content?.order) {
          setContent(r.content);
          setStep("score");
        } else {
          setStep("start");
        }
      })
      // Don't hang on the loader if the resume fetch fails — start fresh.
      .catch(() => setStep("start"));
  }, [profile]);

  // Debounced autosave: edits made in BUILD/SCORE/TAILOR are now persisted as
  // you go (previously only saved on reaching FINISH — see ISSUES.md), so work
  // survives a reload and the agent's get_ats_analysis reads current content.
  useEffect(() => {
    if (!content || step === null || step === "start") return;
    const handle = setTimeout(() => {
      saveResume(content).catch(() => {});
    }, 800);
    return () => clearTimeout(handle);
  }, [content, step]);

  function jumpTo(target: WizardStep) {
    if (target === "start" && step && step !== "start") {
      setStepBeforeStart(step);
    }
    setStep(target);
  }

  if (!profile || step === null) {
    return (
      <div className="world-forge min-h-dvh px-4 pt-4">
        <LoadingBlock />
      </div>
    );
  }

  return (
    <div className="world-forge min-h-dvh pb-8">
      <div className="px-4 pt-4">
        {/* ── top bar ── */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={(e) =>
              breakTo(router, "/radar", { x: e.clientX, y: e.clientY, tint: "slate" })
            }
            className="flex items-center gap-1 font-mono text-xs font-bold uppercase text-ink"
          >
            <span className="inline-block rotate-180">
              <PixelIcon name="arrow-right" size={11} />
            </span>
            {t("common.back")}
          </button>
          <h1 className="flex items-center gap-2 font-pixel text-xs text-amber">
            <PixelIcon name="hammer" size={14} /> {t("forge.title")}
          </h1>
          {step === "build" ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Undo"
                onClick={undo}
                disabled={history.current.past.length === 0}
                className="flex h-8 w-8 items-center justify-center border-2 border-ink bg-paper text-ink shadow-pixel-sm disabled:opacity-30 active:translate-x-[1px] active:translate-y-[1px]"
              >
                <PixelIcon name="undo" size={13} />
              </button>
              <button
                type="button"
                aria-label="Redo"
                onClick={redo}
                disabled={history.current.future.length === 0}
                className="flex h-8 w-8 items-center justify-center border-2 border-ink bg-paper text-ink shadow-pixel-sm disabled:opacity-30 active:translate-x-[1px] active:translate-y-[1px]"
              >
                <PixelIcon name="redo" size={13} />
              </button>
            </div>
          ) : (
            <span className="w-12" aria-hidden />
          )}
        </div>

        <WizardProgress current={step} onJump={jumpTo} />

        {parseNote && step !== "start" && (
          <p
            className={cx(
              "mt-3 border-3 border-ink p-2.5 font-mono text-xs font-bold text-ink shadow-pixel-sm",
              parseNote === "ai" ? "bg-mint" : "dither-grey bg-cream"
            )}
          >
            {parseNote === "ai" ? t("forge.parsedAi") : t("forge.parsedRaw")}
          </p>
        )}

        {/* AI improve failure — never silent */}
        {improve?.error && (
          <div className="mt-3 flex items-center justify-between gap-2 border-3 border-ink bg-alert p-3 shadow-pixel-sm">
            <p className="font-mono text-xs font-bold text-cream">! {t("forge.aiErr")}</p>
            <div className="flex shrink-0 gap-2">
              <PixelButton size="sm" variant="secondary" onClick={() => runImprove(improve.ref, jd)}>
                {t("forge.retry")}
              </PixelButton>
              <PixelButton size="sm" variant="ghost" onClick={() => setImprove(null)}>
                {t("forge.discard")}
              </PixelButton>
            </div>
          </div>
        )}

        {/* AI improve options */}
        {improve?.options && (
          <div className="mt-3 space-y-2 border-3 border-ink bg-paper p-3 shadow-pixel">
            <p className="flex items-center gap-1.5 font-pixel text-[9px] text-amber">
              <PixelIcon name="spark" size={11} /> {t("forge.improve")}
            </p>
            {improve.options.map((opt, i) => (
              <div key={i} className="border-2 border-ink bg-cream p-2">
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-grey">
                  {t("forge.option")} {i + 1}
                </p>
                <p
                  className={cx(
                    "mt-1 whitespace-pre-line text-xs leading-relaxed text-ink",
                    lang === "bn" ? "font-bangla" : "font-mono"
                  )}
                >
                  {opt}
                </p>
                <PixelButton size="sm" variant="positive" className="mt-2" onClick={() => applyImprove(opt)}>
                  {t("forge.accept")}
                </PixelButton>
              </div>
            ))}
            <PixelButton size="sm" variant="secondary" onClick={() => setImprove(null)}>
              {t("forge.discard")}
            </PixelButton>
          </div>
        )}

        {/* ── step router ── */}
        {step === "start" ? (
          <StepStart
            hasExisting={content !== null}
            onParsed={(c, structured) => {
              setContent(c);
              setParseNote(structured ? "ai" : "raw");
              setBuildIndex(0);
              setStep("build");
            }}
            onScratch={() => {
              setContent(resumeFromProfile(profile));
              setParseNote(null);
              setBuildIndex(0);
              setStep("build");
            }}
            onKeep={() => setStep(stepBeforeStart)}
          />
        ) : step === "build" && content ? (
          <StepBuild
            content={content}
            update={update}
            buildIndex={buildIndex}
            setBuildIndex={(i) => {
              setImprove(null);
              setBuildIndex(Math.max(0, Math.min(5, i)));
            }}
            onDone={() => setStep("score")}
            improve={improve}
            onImprove={(ref) => runImprove(ref, jd)}
          />
        ) : step === "score" && content ? (
          <StepScore
            content={content}
            dismissed={dismissed}
            onDismiss={dismissCheck}
            onRestore={restoreCheck}
            onFix={fixSection}
            onContinue={() => setStep("tailor")}
          />
        ) : step === "tailor" && content ? (
          <StepTailor
            content={content}
            jd={jd}
            setJd={setJd}
            onImprove={(ref) => runImprove(ref, jd)}
            improving={improve?.busy === true}
            onContinue={() => setStep("finish")}
          />
        ) : content ? (
          <StepFinish
            content={content}
            onNewVersion={() => {
              setStepBeforeStart("finish");
              setStep("start");
            }}
          />
        ) : (
          <LoadingBlock />
        )}
      </div>
    </div>
  );
}
