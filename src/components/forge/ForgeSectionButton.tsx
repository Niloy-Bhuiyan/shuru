"use client";

/**
 * "FORGE THIS SECTION" — per-section AI rewrite. Hidden entirely when no
 * Gemini key is configured (probes /api/forge-section once). Returns 2
 * options; the user explicitly accepts one or discards. Never silent.
 */

import React, { useEffect, useState } from "react";
import { PixelButton } from "@/components/pixel/PixelButton";
import { useLang } from "@/lib/i18n";

let cachedEnabled: boolean | null = null;

export function ForgeSectionButton({
  section,
  text,
  jd,
  onAccept,
}: {
  section: "summary" | "bullets";
  text: string;
  jd?: string;
  onAccept: (rewritten: string) => void;
}) {
  const { t, lang } = useLang();
  const [enabled, setEnabled] = useState<boolean | null>(cachedEnabled);
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<string[] | null>(null);

  useEffect(() => {
    if (cachedEnabled !== null) return;
    fetch("/api/forge-section")
      .then((r) => r.json())
      .then((d: { enabled: boolean }) => {
        cachedEnabled = d.enabled;
        setEnabled(d.enabled);
      })
      .catch(() => {
        cachedEnabled = false;
        setEnabled(false);
      });
  }, []);

  if (!enabled) return null;

  async function forge() {
    if (busy || !text.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/forge-section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, text, jd, lang }),
      });
      if (res.ok) {
        const d = (await res.json()) as { options: string[] };
        setOptions(d.options);
      }
    } finally {
      setBusy(false);
    }
  }

  if (options) {
    return (
      <div className="mt-2 space-y-2">
        {options.map((opt, i) => (
          <div key={i} className="border-3 border-ink bg-cream p-2 shadow-pixel-sm">
            <p className="font-mono text-[10px] font-bold text-grey">
              {t("forge.option")} {i + 1}
            </p>
            <p className={`mt-1 whitespace-pre-line text-xs leading-relaxed text-ink ${lang === "bn" ? "font-bangla" : "font-mono"}`}>
              {opt}
            </p>
            <div className="mt-2 flex gap-2">
              <PixelButton
                size="sm"
                variant="positive"
                onClick={() => {
                  onAccept(opt);
                  setOptions(null);
                }}
              >
                {t("forge.accept")}
              </PixelButton>
            </div>
          </div>
        ))}
        <PixelButton size="sm" variant="secondary" onClick={() => setOptions(null)}>
          {t("forge.discard")}
        </PixelButton>
      </div>
    );
  }

  return (
    <PixelButton
      size="sm"
      variant="secondary"
      className="mt-2"
      onClick={forge}
      disabled={busy || !text.trim()}
    >
      {busy ? t("forge.forging") : `⚒ ${t("forge.forgeSection")}`}
    </PixelButton>
  );
}

export default ForgeSectionButton;
