"use client";

/**
 * WIZARD STEP 1 — START. Two choices, nothing else: UPLOAD MY RESUME or
 * START FRESH (both via the existing UploadResume component, which carries
 * the dropzone, parsing states and specific error messages). When a resume
 * already exists (user jumped back here), a single escape hatch returns
 * them without losing anything.
 */

import React from "react";
import { PixelButton } from "@/components/pixel/PixelButton";
import { UploadResume } from "@/components/forge/UploadResume";
import { useLang } from "@/lib/i18n";
import type { ResumeContent } from "@/lib/types";

export function StepStart({
  hasExisting,
  onParsed,
  onScratch,
  onKeep,
}: {
  hasExisting: boolean;
  onParsed: (content: ResumeContent, structured: boolean) => void;
  onScratch: () => void;
  onKeep: () => void;
}) {
  const { t } = useLang();
  return (
    <div className="mt-6">
      <p className="mb-4 text-center font-pixel text-[10px] leading-relaxed text-amber">
        {t("forge.startLead")}
      </p>
      <UploadResume onParsed={onParsed} onScratch={onScratch} />
      {hasExisting && (
        <PixelButton size="sm" variant="secondary" className="mt-4" onClick={onKeep}>
          ← {t("forge.keepCurrent")}
        </PixelButton>
      )}
    </div>
  );
}

export default StepStart;
