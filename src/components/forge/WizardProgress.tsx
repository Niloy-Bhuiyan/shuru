"use client";

/**
 * 5-segment pixel progress bar for the Resume Forge wizard.
 * Done = mint, current = amber, upcoming = dithered grey.
 * Completed steps are tappable to jump back; the future is not.
 */

import React from "react";
import { cx } from "@/lib/cx";
import { useLang, type StringKey } from "@/lib/i18n";

export type WizardStep = "start" | "build" | "score" | "tailor" | "finish";

export const WIZARD_STEPS: WizardStep[] = ["start", "build", "score", "tailor", "finish"];

const STEP_LABEL: Record<WizardStep, StringKey> = {
  start: "forge.step.start",
  build: "forge.step.build",
  score: "forge.step.score",
  tailor: "forge.step.tailor",
  finish: "forge.step.finish",
};

export function WizardProgress({
  current,
  onJump,
}: {
  current: WizardStep;
  onJump: (step: WizardStep) => void;
}) {
  const { t } = useLang();
  const currentIdx = WIZARD_STEPS.indexOf(current);

  return (
    <nav aria-label="Wizard progress" className="mt-3 flex gap-1.5">
      {WIZARD_STEPS.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <button
            key={s}
            type="button"
            disabled={!done}
            aria-current={active ? "step" : undefined}
            onClick={() => onJump(s)}
            className={cx(
              "flex-1 border-2 border-ink pb-1 pt-0.5",
              done && "bg-mint active:translate-x-[1px] active:translate-y-[1px]",
              active && "bg-amber shadow-pixel-sm",
              !done && !active && "dither-grey bg-paper opacity-60"
            )}
          >
            <span
              className={cx(
                "block h-1.5 border-b-2 border-ink/40",
                active && "pixel-blink"
              )}
            />
            <span className="mt-1 block truncate px-0.5 text-center font-pixel text-[7px] text-ink">
              {t(STEP_LABEL[s])}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export default WizardProgress;
