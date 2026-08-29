"use client";

/**
 * WIZARD STEP 5 — FINISH. Calm and uncluttered:
 *   - the resume auto-saves on arrival (a quiet "Saved ✓" chip — saving a
 *     resume is never destructive, so no button ceremony)
 *   - the EXPLICIT mint dashboard-sync confirm appears after, unchanged:
 *     extracted skills / deployed evidence / CGPA / department are OFFERED,
 *     never applied silently — this is what feeds Reality Check
 *   - full-width live document preview (no selection chrome here)
 *   - DOWNLOAD PDF: the existing text-layer export (jsPDF text API)
 *   - START A NEW VERSION → back to the START screen
 */

import React, { useEffect, useRef, useState } from "react";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { ResumePreview } from "@/components/forge/ResumePreview";
import { useProfile } from "@/hooks/useProfile";
import { saveProfile, saveResume } from "@/lib/data";
import { extractProfileHints, hasHints, type ProfileHints } from "@/lib/resume/extract";
import { useLang } from "@/lib/i18n";
import type { ResumeContent } from "@/lib/types";

export function StepFinish({
  content,
  onNewVersion,
}: {
  content: ResumeContent;
  onNewVersion: () => void;
}) {
  const { t } = useLang();
  const { profile, refresh } = useProfile();

  const [saveState, setSaveState] = useState<"saving" | "saved" | "error">("saving");
  const [hints, setHints] = useState<ProfileHints | null>(null);
  const [synced, setSynced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const savedOnce = useRef(false);

  // auto-save on arrival (once), then offer the explicit profile sync
  useEffect(() => {
    if (savedOnce.current || !profile) return;
    savedOnce.current = true;
    saveResume(content)
      .then(() => {
        setSaveState("saved");
        const h = extractProfileHints(content, profile);
        setHints(hasHints(h) ? h : null);
      })
      .catch(() => setSaveState("error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  async function onConfirmSync() {
    if (!profile || !hints || busy) return;
    setBusy(true);
    try {
      await saveProfile({
        ...profile,
        skills: [...profile.skills, ...hints.newSkills],
        has_deployed_project: profile.has_deployed_project || hints.deployedDetected,
        cgpa: hints.cgpa ?? profile.cgpa,
        department: hints.department ?? profile.department,
      });
      await refresh();
      setSynced(true);
      setHints(null);
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf() {
    if (exporting) return;
    setExporting(true);
    try {
      const [{ jsPDF }, { buildResumePdf, resumeFileName }] = await Promise.all([
        import("jspdf"),
        import("@/lib/resume/pdfExport"),
      ]);
      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      buildResumePdf(pdf, content);
      pdf.save(resumeFileName(content));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mt-4 space-y-4">
      {/* quiet save status */}
      <p className="mx-auto w-fit border-2 border-ink bg-paper px-2 py-1 font-mono text-[10px] font-bold text-ink">
        {saveState === "saving"
          ? t("forge.saving")
          : saveState === "saved"
            ? t("forge.savedOk")
            : `! ${t("forge.uploadErr")}`}
      </p>

      {/* explicit dashboard sync — never silent */}
      {hints && profile && (
        <div className="border-3 border-ink bg-mint p-3 shadow-pixel">
          <p className="font-pixel text-[9px] leading-relaxed text-ink">
            {t("forge.sync.title")}
          </p>
          <p className="mt-2 font-mono text-xs leading-relaxed text-ink/90">
            {t("forge.sync.body")}
          </p>
          <div className="mt-3 space-y-1.5 font-mono text-xs font-bold text-ink">
            {hints.newSkills.length > 0 && (
              <p>
                {t("forge.sync.skills")}:{" "}
                <span className="font-normal">{hints.newSkills.join(", ")}</span>
              </p>
            )}
            {hints.deployedDetected && (
              <p className="flex items-center gap-1">
                <PixelIcon name="check" size={11} /> {t("forge.sync.deployed")}
              </p>
            )}
            {hints.cgpa !== null && (
              <p>
                {t("forge.sync.cgpa")}: {profile.cgpa.toFixed(2)} → {hints.cgpa.toFixed(2)}
              </p>
            )}
            {hints.department && (
              <p>
                {t("forge.sync.dept")}: {profile.department} → {hints.department}
              </p>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <PixelButton size="sm" onClick={onConfirmSync} disabled={busy}>
              {t("forge.sync.confirm")}
            </PixelButton>
            <PixelButton size="sm" variant="secondary" onClick={() => setHints(null)}>
              {t("forge.sync.skip")}
            </PixelButton>
          </div>
        </div>
      )}
      {synced && (
        <p className="border-3 border-ink bg-paper p-3 font-mono text-xs font-bold text-ink shadow-pixel-sm">
          {t("forge.sync.done")}
        </p>
      )}

      {/* the document, full width, no chrome */}
      <ResumePreview
        content={content}
        selected={null}
        onSelect={() => undefined}
        toolbarFor={() => null}
      />

      <PixelButton full size="lg" onClick={downloadPdf} disabled={exporting}>
        <span className="flex items-center justify-center gap-1.5">
          <PixelIcon name="download" size={12} />
          {exporting ? t("forge.exporting") : `${t("forge.download")} ↓`}
        </span>
      </PixelButton>
      <PixelButton full variant="secondary" onClick={onNewVersion}>
        {t("forge.newVersion")}
      </PixelButton>
    </div>
  );
}

export default StepFinish;
