"use client";

/**
 * DISCOVER — ask a model to search the live web for internships.
 *
 * This exists because Shuru's ingestion cannot reach the listings it most
 * needs. Every board adapter requires a public API, and no Bangladeshi board
 * and no major BD employer has one — the corpus is 26 foreign listings and one
 * entered by hand. See ADR 0004.
 *
 * ── The screen's job is to be honest about three different things ─────────
 *
 *  1. WHAT SURVIVED. Every result shown here had its URL fetched server-side
 *     and confirmed to be a page naming that company and that role. These are
 *     safe to click and safe to apply to today.
 *
 *  2. WHAT DIED, AND WHY. Rejections are shown, not hidden. "4 dropped: the
 *     page did not mention the company" tells a student the model invented
 *     employers, which is a true and useful thing to know about a tool they
 *     are being asked to trust. Quietly showing two results out of six teaches
 *     them the web is empty.
 *
 *  3. WHAT HAPPENS NEXT. Found listings do NOT appear on the radar
 *     immediately. They go to an admin queue first. Saying so plainly is
 *     better than a student wondering why their search results vanished — and
 *     it is the difference between a student trusting a link they asked for
 *     and Shuru asserting to everyone that a listing is real.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelCard } from "@/components/pixel/PixelCard";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { LoadingBlock } from "@/components/LoadingBlock";
import { ProLock } from "@/components/ProLock";
import { useLang, type StringKey } from "@/lib/i18n";
import { cx } from "@/lib/cx";

type Result = {
  company: string;
  role: string;
  location: string | null;
  work_mode: "onsite" | "remote" | "hybrid" | null;
  deadline: string | null;
  stipend_text: string | null;
  duration: string | null;
  resolved_url: string;
};

type Rejection = { reason: string; company: string; role?: string };

type Outcome = {
  results: Result[];
  inserted: number;
  duplicates: number;
  rejected: Rejection[];
  warning?: string;
};

type Phase = "idle" | "searching" | "done" | "error";

const MAX_ASK = 400;

export default function DiscoverPage() {
  const { t } = useLang();

  const [probe, setProbe] = useState<{ enabled: boolean; pro: boolean } | null>(null);
  const [ask, setAsk] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<StringKey>("discover.errGeneric");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/discover")
      .then((r) => r.json())
      .then((d: { enabled?: boolean; pro?: boolean }) => {
        if (!cancelled) {
          setProbe({ enabled: Boolean(d.enabled), pro: Boolean(d.pro) });
        }
      })
      .catch(() => {
        if (!cancelled) setProbe({ enabled: false, pro: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function search() {
    setPhase("searching");
    setOutcome(null);
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ask: ask.trim() || undefined }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(ERRORS[body.error ?? ""] ?? "discover.errGeneric");
        setPhase("error");
        return;
      }

      setOutcome((await res.json()) as Outcome);
      setPhase("done");
    } catch {
      setError("discover.errNetwork");
      setPhase("error");
    }
  }

  if (!probe) {
    return (
      <main className="px-4 py-6">
        <LoadingBlock />
      </main>
    );
  }

  // Not configured on this deployment: render nothing but an explanation. No
  // teaser for a feature the operator has not enabled.
  if (!probe.enabled) {
    return (
      <main className="px-4 py-6">
        <Header t={t} />
        <PixelCard className="mt-4 p-4">
          <p className="font-mono text-[12px] leading-relaxed text-ui-muted">
            {t("discover.notConfigured")}
          </p>
        </PixelCard>
        <BackLink t={t} />
      </main>
    );
  }

  if (!probe.pro) {
    return (
      <main className="px-4 py-6">
        <Header t={t} />
        <ProLock featureKey="pro.lockDiscover" className="mt-4" />
        <BackLink t={t} />
      </main>
    );
  }

  return (
    <main className="px-4 py-6">
      <Header t={t} />

      <div className="mt-4">
        <label
          htmlFor="discover-ask"
          className="mb-1.5 block font-sans text-[13px] font-medium text-ink"
        >
          {t("discover.askLabel")}
        </label>
        <textarea
          id="discover-ask"
          value={ask}
          onChange={(e) => setAsk(e.target.value.slice(0, MAX_ASK))}
          rows={3}
          aria-describedby="discover-ask-hint"
          placeholder={t("discover.askPlaceholder")}
          className={cx(
            "w-full rounded-lg border border-ui-lineStrong bg-paper px-3 py-2.5",
            "font-sans text-[14px] leading-relaxed text-ink",
            "placeholder:text-ui-faint focus:border-amber focus:outline-none focus:ring-2 focus:ring-amber/20"
          )}
        />
        <p
          id="discover-ask-hint"
          className="mt-1.5 font-mono text-[11px] leading-relaxed text-ui-muted"
        >
          {t("discover.askHint")}
        </p>

        <PixelButton
          full
          className="mt-3"
          disabled={phase === "searching"}
          onClick={() => void search()}
        >
          {phase === "searching" ? t("discover.searching") : t("discover.run")}
        </PixelButton>

        {phase === "searching" && (
          <p
            role="status"
            aria-live="polite"
            className="mt-2 font-mono text-[11px] leading-relaxed text-ui-muted"
          >
            {t("discover.searchingHint")}
          </p>
        )}
      </div>

      {phase === "error" && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-alert bg-alert/5 p-3.5"
        >
          <p className="font-mono text-[12px] leading-relaxed text-alert">
            {t(error)}
          </p>
          <PixelButton
            variant="secondary"
            className="mt-3"
            onClick={() => setPhase("idle")}
          >
            {t("error.retry")}
          </PixelButton>
        </div>
      )}

      {phase === "done" && outcome && <Outcomes outcome={outcome} t={t} />}

      <BackLink t={t} />
    </main>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

type Translate = (key: StringKey) => string;

function Header({ t }: { t: Translate }) {
  return (
    <>
      <h1 className="font-pixel text-lg leading-tight text-ink">
        {t("discover.title")}
      </h1>
      <p className="mt-2 max-w-prose font-mono text-[12px] leading-relaxed text-ui-muted">
        {t("discover.subtitle")}
      </p>
    </>
  );
}

function BackLink({ t }: { t: Translate }) {
  return (
    <Link
      href="/radar"
      className="mt-6 inline-block font-mono text-[12px] underline"
    >
      ← {t("nav.radar")}
    </Link>
  );
}

function Outcomes({ outcome, t }: { outcome: Outcome; t: Translate }) {
  const { results, inserted, duplicates, rejected } = outcome;

  return (
    <section aria-live="polite" className="mt-6">
      {/* The honest summary, before the results. */}
      <div className="rounded-lg border border-ui-line bg-cream p-3.5">
        <p className="font-pixel text-[13px] text-ink">
          {results.length === 0
            ? t("discover.noneTitle")
            : `${results.length} ${t("discover.verifiedSuffix")}`}
        </p>
        <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-ui-muted">
          {results.length === 0 ? t("discover.noneBody") : t("discover.verifiedBody")}
        </p>

        <ul className="mt-2.5 space-y-1 border-t border-ui-line pt-2.5 font-mono text-[11px] text-ui-muted">
          {inserted > 0 && (
            <li>
              <span className="font-bold text-ink tabular">{inserted}</span>{" "}
              {t("discover.queued")}
            </li>
          )}
          {duplicates > 0 && (
            <li>
              <span className="font-bold text-ink tabular">{duplicates}</span>{" "}
              {t("discover.alreadyHad")}
            </li>
          )}
          {rejected.length > 0 && (
            <li>
              <span className="font-bold text-ink tabular">{rejected.length}</span>{" "}
              {t("discover.rejected")}
            </li>
          )}
        </ul>

        {outcome.warning === "found_but_not_recorded" && (
          <p
            role="status"
            className="mt-2.5 rounded border border-amber/40 bg-amber/5 p-2 font-mono text-[11px] leading-relaxed text-ink"
          >
            {t("discover.notRecorded")}
          </p>
        )}
      </div>

      {/* Why candidates died. Grouped, because "4 × company_not_found" is the
          useful shape and four identical lines is not. */}
      {rejected.length > 0 && (
        <details className="mt-3 rounded-lg border border-ui-line bg-paper p-3">
          <summary className="cursor-pointer font-mono text-[11px] font-bold text-ink">
            {t("discover.whyDropped")}
          </summary>
          <ul className="mt-2 space-y-1">
            {Object.entries(
              rejected.reduce<Record<string, number>>((acc, r) => {
                acc[r.reason] = (acc[r.reason] ?? 0) + 1;
                return acc;
              }, {})
            ).map(([reason, n]) => (
              <li
                key={reason}
                className="font-mono text-[11px] leading-relaxed text-ui-muted"
              >
                <span className="font-bold text-ink tabular">{n}</span> ·{" "}
                {t(REJECTION_KEYS[reason] ?? "discover.rejOther")}
              </li>
            ))}
          </ul>
        </details>
      )}

      <ul className="mt-4 space-y-2">
        {results.map((r) => (
          <li
            key={r.resolved_url}
            className="rounded-lg border border-ui-lineStrong bg-paper p-3.5 shadow-pixel-sm"
          >
            <p className="font-pixel text-[14px] leading-snug text-ink">{r.role}</p>
            <p className="mt-0.5 font-mono text-[12px] text-ui-muted">
              {r.company}
              {r.location && ` · ${r.location}`}
              {r.work_mode && ` · ${r.work_mode}`}
            </p>

            {/* Only what the posting actually said. A field the source was
                silent about is simply absent — never "Not specified", never a
                guess. */}
            <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px]">
              {r.stipend_text && (
                <Pair label={t("discover.stipend")} value={r.stipend_text} />
              )}
              {r.duration && (
                <Pair label={t("discover.duration")} value={r.duration} />
              )}
              {r.deadline && (
                <Pair label={t("discover.deadline")} value={r.deadline} />
              )}
            </dl>

            <a
              href={r.resolved_url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2.5 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-ink px-3 font-mono text-[11px] font-bold text-cream hover:bg-ink/90"
            >
              {t("discover.openPosting")}
              <PixelIcon name="arrow-right" size={12} />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-ui-faint">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

/** Server refusal codes → the string that explains them. */
const ERRORS: Record<string, StringKey> = {
  not_configured: "discover.notConfigured",
  profile_required: "discover.errNoProfile",
  rate_limited: "discover.errRateLimited",
  search_failed: "discover.errSearchFailed",
  unparseable_response: "discover.errUnparseable",
};

/** Verification rejection reasons, in words a student can act on. */
const REJECTION_KEYS: Record<string, StringKey> = {
  unreachable: "discover.rejUnreachable",
  http_error: "discover.rejHttp",
  not_html: "discover.rejNotHtml",
  company_not_found: "discover.rejCompany",
  role_not_found: "discover.rejRole",
};
