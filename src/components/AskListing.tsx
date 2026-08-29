"use client";

/**
 * ASK ABOUT THIS LISTING
 *
 * A question box scoped to one listing, answered by the retrieval service from
 * the text that listing actually publishes.
 *
 * Three states this component exists to render honestly, and which are the
 * whole point of the feature:
 *
 *   - NOT CONFIGURED  → the panel does not render at all. No teaser, no
 *                       "coming soon", no disabled button.
 *   - NOT SUBSCRIBED  → a lock naming the feature and its price. Different
 *                       from the state above, and it has to be: the retrieval
 *                       service IS running here and would answer. Hiding it
 *                       would be hiding a working feature; showing an enabled
 *                       box would be a 402 on submit.
 *   - ABSTAINED       → said plainly, in the same visual weight as an answer.
 *                       An abstention is the product working, so it must not
 *                       look like an error.
 *   - ANSWERED        → shown WITH its sources. There is deliberately no code
 *                       path that renders an answer without them.
 */

import { useEffect, useState } from "react";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelCard } from "@/components/pixel/PixelCard";
import { ProLock } from "@/components/ProLock";
import { useLang } from "@/lib/i18n";

type Citation = {
  n: number;
  company: string;
  role: string;
  source_field: string;
  excerpt: string;
  apply_url: string | null;
  suspected_injection: boolean;
};

type Answer = {
  answer: string;
  abstained: boolean;
  abstain_reason: string | null;
  citations: Citation[];
};

type Phase = "idle" | "asking" | "answered" | "limit" | "error";

export function AskListing({ opportunityId }: { opportunityId: string }) {
  const { t } = useLang();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [pro, setPro] = useState(false);
  const [question, setQuestion] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<Answer | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ask")
      .then((r) => (r.ok ? r.json() : { available: false, pro: false }))
      .then((d) => {
        if (cancelled) return;
        setAvailable(Boolean(d.available));
        setPro(Boolean(d.pro));
      })
      // A probe that fails means unavailable. Never optimistically available:
      // that would render a box whose every submission errors.
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Hidden entirely, not disabled. A dead control is worse than no control.
  if (available !== true) return null;

  // Available here, but not to this account.
  if (!pro) return <ProLock featureKey="pro.lockAsk" className="mt-4" />;

  async function ask() {
    const q = question.trim();
    if (!q) return;
    setPhase("asking");
    setResult(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, opportunity_id: opportunityId }),
      });
      if (res.status === 429) {
        setPhase("limit");
        return;
      }
      if (!res.ok) {
        setPhase("error");
        return;
      }
      setResult((await res.json()) as Answer);
      setPhase("answered");
    } catch {
      setPhase("error");
    }
  }

  /** Which sentence to show when the service declined to write an answer. */
  function abstentionText(reason: string | null): string {
    if (reason === "generation_not_configured") return t("ask.retrievalOnly");
    if (reason === "answer_not_supported_by_sources") return t("ask.noAnswer");
    return t("ask.noSources");
  }

  return (
    <section aria-labelledby="ask-heading" className="mt-5">
      <h2
        id="ask-heading"
        className="font-mono text-xs font-bold text-ink"
      >
        {t("ask.title")}
      </h2>
      <p className="mt-0.5 font-mono text-[10px] leading-relaxed text-ink/60">
        {t("ask.hint")}
      </p>

      <div className="mt-2 flex gap-2">
        <label htmlFor="ask-input" className="sr-only">
          {t("ask.title")}
        </label>
        <input
          id="ask-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") ask();
          }}
          maxLength={500}
          placeholder={t("ask.placeholder")}
          disabled={phase === "asking"}
          className="min-w-0 flex-1 border-3 border-ink bg-paper px-2 py-1.5 font-mono text-xs text-ink placeholder:text-grey focus:outline-none focus:shadow-pixel-sm disabled:opacity-50"
        />
        <PixelButton
          size="sm"
          onClick={ask}
          disabled={phase === "asking" || question.trim().length === 0}
        >
          {phase === "asking" ? t("ask.thinking") : t("ask.send")}
        </PixelButton>
      </div>

      {phase === "limit" && (
        <p role="status" className="mt-2 font-mono text-[11px] text-ink/80">
          {t("ask.limit")}
        </p>
      )}
      {phase === "error" && (
        <p role="alert" className="mt-2 font-mono text-[11px] text-ink/80">
          {t("ask.unavailable")}
        </p>
      )}

      {phase === "answered" && result && (
        <div aria-live="polite" className="mt-3">
          <PixelCard className="p-3">
            <p className="font-mono text-[11.5px] leading-relaxed text-ink">
              {result.abstained
                ? abstentionText(result.abstain_reason)
                : result.answer}
            </p>
          </PixelCard>

          {/*
            Sources render whenever they exist — including alongside an
            abstention, because "we found these passages but will not write
            over them" is more useful than silence.
          */}
          {result.citations.length > 0 && (
            <div className="mt-2">
              <h3 className="font-mono text-[10px] font-bold text-ink/70">
                {t("ask.sources")}
              </h3>
              <ol className="mt-1 space-y-1.5">
                {result.citations.map((c) => (
                  <li
                    key={c.n}
                    className="border-2 border-ink/30 bg-cream p-2 font-mono text-[10px] leading-relaxed text-ink/80"
                  >
                    <span className="font-bold">
                      [{c.n}] {c.company} — {c.role}
                    </span>
                    <p className="mt-0.5 italic">“{c.excerpt}”</p>
                    {c.suspected_injection && (
                      // Surfaced, not hidden: a student reading a quote that
                      // tries to give the assistant orders deserves to know
                      // the listing did that.
                      <p className="mt-1 border-2 border-ink bg-amber p-1 not-italic text-ink">
                        ⚠ {t("ask.flagged")}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
