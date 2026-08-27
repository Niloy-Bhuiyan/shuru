"use client";

/**
 * UPLOAD RESUME dropzone + START FROM SCRATCH — the forge's front door.
 * Posts to /api/parse-resume; reports whether AI structuring ran or the
 * raw-text fallback was used, so the user knows what to review.
 */

import React, { useRef, useState } from "react";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { cx } from "@/lib/cx";
import { useLang } from "@/lib/i18n";
import type { ResumeContent } from "@/lib/types";

export function UploadResume({
  onParsed,
  onScratch,
}: {
  onParsed: (content: ResumeContent, structured: boolean) => void;
  onScratch: () => void;
}) {
  const { t } = useLang();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/parse-resume", { method: "POST", body: form });
      if (!res.ok) {
        let code = "";
        try {
          code = ((await res.json()) as { error?: string }).error ?? "";
        } catch {
          /* non-json error body */
        }
        setError(
          code === "too_large"
            ? t("forge.errTooLarge")
            : code === "unsupported_type"
              ? t("forge.errType")
              : code === "no_text"
                ? t("forge.errNoText")
                : t("forge.uploadErr")
        );
        return;
      }
      const d = (await res.json()) as { content: ResumeContent; structured: boolean };
      onParsed(d.content, d.structured);
    } catch {
      setError(t("forge.uploadErr"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        className={cx(
          "cursor-pointer border-3 border-ink p-4 text-center shadow-pixel",
          dragOver ? "dither-amber bg-paper" : "bg-paper",
          "active:translate-x-[2px] active:translate-y-[2px] active:shadow-pixel-none"
        )}
      >
        <span className="mx-auto flex h-9 w-9 items-center justify-center border-2 border-ink bg-amber text-ink">
          <PixelIcon name="upload" size={16} />
        </span>
        <p className="mt-2 font-pixel text-[10px] text-ink">
          {busy ? t("forge.parsing") : t("forge.upload")}
        </p>
        <p className="mt-1 font-mono text-[11px] text-grey">{t("forge.uploadHint")}</p>
        {error && (
          <p className="mt-2 font-mono text-[11px] font-bold text-alert">! {error}</p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </div>

      <button
        type="button"
        onClick={onScratch}
        className="border-3 border-ink bg-paper p-4 text-center shadow-pixel active:translate-x-[2px] active:translate-y-[2px] active:shadow-pixel-none"
      >
        <span className="mx-auto flex h-9 w-9 items-center justify-center border-2 border-ink bg-mint text-ink">
          <PixelIcon name="edit" size={16} />
        </span>
        <p className="mt-2 font-pixel text-[10px] text-ink">{t("forge.scratch")}</p>
        <p className="mt-1 font-mono text-[11px] text-grey">→</p>
      </button>
      {busy && <span className="sr-only" aria-live="polite">{t("forge.parsing")}</span>}
    </div>
  );
}

export default UploadResume;
