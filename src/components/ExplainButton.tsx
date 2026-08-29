"use client";

/**
 * "EXPLAIN THIS" — renders only if the server reports a Gemini key.
 * One tap → 2–3 honest sentences about the number. Never a chatbot.
 */

import React, { useEffect, useState } from "react";
import { PixelButton } from "@/components/pixel/PixelButton";
import { useLang } from "@/lib/i18n";

export function ExplainButton({
  payload,
}: {
  payload: {
    company: string;
    role: string;
    percent: number;
    confidence: "HIGH" | "MED";
    n: number;
    oneThing: string | null;
    inYourFavour: string | null;
  };
}) {
  const { t, lang } = useLang();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/explain")
      .then((r) => r.json())
      .then((d: { enabled: boolean }) => setEnabled(d.enabled))
      .catch(() => setEnabled(false));
  }, []);

  // No key → hide gracefully. The app never depends on this.
  if (!enabled) return null;

  async function explain() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, lang }),
      });
      if (res.ok) {
        const d = (await res.json()) as { text: string };
        setText(d.text);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      {text ? (
        <div className="border-3 border-ink bg-paper p-3 shadow-pixel-sm">
          <p className="font-mono text-[10px] font-bold text-grey">
            {t("reality.explain")}
          </p>
          <p className={`mt-1 text-sm leading-relaxed text-ink ${lang === "bn" ? "font-bangla" : "font-mono"}`}>
            {text}
          </p>
        </div>
      ) : (
        <PixelButton variant="secondary" full onClick={explain} disabled={busy}>
          {busy ? t("reality.explaining") : `✦ ${t("reality.explain")}`}
        </PixelButton>
      )}
    </div>
  );
}

export default ExplainButton;
