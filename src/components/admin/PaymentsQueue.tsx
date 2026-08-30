"use client";

/**
 * TRANSACTION REVIEW — the admin half of the mobile-money payment path.
 *
 * Someone sent money from their bKash, Nagad or Rocket wallet to the merchant
 * number and typed in the transaction id. This is where an admin opens the
 * merchant statement, finds that transaction, and says whether it is there.
 * Approving grants the subscription; rejecting tells the payer why.
 *
 * ── Designed around the actual task ───────────────────────────────────────
 *
 * The job is matching one line against a statement, so the transaction id is
 * the most prominent thing on each row, set in a monospace face at a size you
 * can read next to a phone screen, with the sending number and the amount
 * beside it. Everything that is not needed for a match is smaller or absent.
 *
 * The wallet's own mark sits on the row for the same reason. A reviewer with
 * three merchant statements open is choosing WHICH statement before they look
 * for anything in it, and a logo is faster to sort by than the lowercase word
 * "nagad" in a list of metadata.
 *
 * The queue is OLDEST FIRST — the opposite of every other list in this product.
 * Someone is waiting for money they have already sent; the person who has been
 * waiting longest is served first, not the newest arrival.
 *
 * ── Two refusals that are enforced elsewhere and explained here ───────────
 *
 * An admin cannot approve their own payment (the route returns 403), and two
 * admins cannot both decide the same one (the second gets 409). Both surface
 * as an explanatory sentence rather than a generic failure, because both are
 * things a reviewer will otherwise assume is a bug.
 */

import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { LoadingBlock } from "@/components/LoadingBlock";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelBadge } from "@/components/pixel/PixelBadge";
import { MethodMark } from "@/components/brand/MethodMark";
import { cx } from "@/lib/cx";
import { formatMoney } from "@/lib/subscription";
import { useLang } from "@/lib/i18n";
import { toUserMessage } from "@/lib/errors";
import {
  decidePayment,
  listAutomaticPayments,
  listPaymentsForReview,
  type ReviewablePayment,
} from "@/lib/data/adminPayments";

type View = "pending" | "decided" | "automatic";

export function PaymentsQueue({
  onCountChange,
}: {
  /** Lifts the pending count so the console header and rail can show it. */
  onCountChange?: (n: number) => void;
}) {
  const { t, lang } = useLang();

  const [view, setView] = useState<View>("pending");
  const [pending, setPending] = useState<ReviewablePayment[]>([]);
  const [decided, setDecided] = useState<ReviewablePayment[]>([]);
  const [automatic, setAutomatic] = useState<ReviewablePayment[]>([]);
  const [ready, setReady] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [p, approved, rejected, auto] = await Promise.all([
      listPaymentsForReview("pending"),
      listPaymentsForReview("approved"),
      listPaymentsForReview("rejected"),
      listAutomaticPayments(),
    ]);
    setPending(p);
    // One "decided" list rather than two tabs: a reviewer looking something up
    // after the fact knows the transaction id, not whether it was approved.
    setDecided(
      [...approved, ...rejected].sort((a, b) =>
        (b.reviewed_at ?? "").localeCompare(a.reviewed_at ?? "")
      )
    );
    setAutomatic(auto);
    setReady(true);
    onCountChange?.(p.length);
  }, [onCountChange]);

  useEffect(() => {
    load().catch((e) => {
      setError(toUserMessage(e, t));
      setReady(true);
    });
  }, [load]);

  async function decide(row: ReviewablePayment, approve: boolean) {
    setError(null);

    const reason = (note[row.id] ?? "").trim();
    if (!approve && !reason) {
      // Checked here as well as on the server so the reviewer is told before
      // a round trip, not after one.
      setError(t("adminPay.reasonRequired"));
      return;
    }

    setBusyId(row.id);
    try {
      await decidePayment(row.id, approve, reason || undefined);
      setNote((m) => ({ ...m, [row.id]: "" }));
      await load();
    } catch (e) {
      // DecisionRejected carries a sentence written for a reviewer and marks
      // itself `explained`, so toUserMessage lets it through unchanged.
      setError(toUserMessage(e, t));
    } finally {
      setBusyId(null);
    }
  }

  if (!ready) return <LoadingBlock />;

  const VIEWS: { id: View; label: string; count: number }[] = [
    { id: "pending", label: t("adminPay.tabPending"), count: pending.length },
    { id: "decided", label: t("adminPay.tabDecided"), count: decided.length },
    { id: "automatic", label: t("adminPay.tabAuto"), count: automatic.length },
  ];

  const rows =
    view === "pending" ? pending : view === "decided" ? decided : automatic;

  return (
    <section className="mb-6">
      <div className="rounded-xl border border-ui-line bg-paper p-4">
        <p className="font-sans text-[15px] font-medium text-ink">
          {t("adminPay.title")}
        </p>
        <p className="mt-1 max-w-prose font-sans text-[13px] leading-relaxed text-ui-muted">
          {t("adminPay.hint")}
        </p>
      </div>

      {/* One segmented control rather than three loose bordered buttons: these
          are three views of one table, and a joined control says so. */}
      <div
        role="group"
        aria-label={t("adminPay.title")}
        className="mt-3 inline-flex overflow-hidden rounded-lg border border-ui-lineStrong"
      >
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            aria-pressed={view === v.id}
            className={cx(
              "min-h-[38px] px-3.5 font-sans text-[13px] font-medium transition-colors",
              view === v.id
                ? "bg-ink text-white"
                : "bg-paper text-ui-muted hover:bg-cream hover:text-ink"
            )}
          >
            {v.label}
            {v.count > 0 && (
              <span className="ml-1.5 tabular opacity-70">{v.count}</span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-alert bg-alert/5 p-3 font-sans text-[13px] leading-relaxed text-alert"
        >
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            icon="check"
            title={
              view === "pending"
                ? t("adminPay.emptyPending")
                : t("adminPay.emptyOther")
            }
          />
        </div>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-xl border border-ui-line bg-paper p-4 transition-colors hover:border-ui-lineStrong"
            >
              {/* The match line: everything needed to find this in a merchant
                  statement, and nothing else. */}
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <span className="flex min-w-0 items-center gap-2.5">
                  <MethodMark id={row.method} height={20} />
                  <code className="font-code text-[16px] font-semibold tracking-wider text-ink tabular">
                    {row.payer_reference ?? "—"}
                  </code>
                </span>
                <span className="font-sans text-[16px] font-semibold text-ink tabular">
                  {formatMoney({
                    amountMinor: row.amount_minor,
                    currency: row.currency,
                  })}
                </span>
              </div>

              <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 font-sans text-[13px]">
                <Pair label={t("adminPay.method")} value={row.method} />
                <Pair
                  label={t("adminPay.from")}
                  value={row.payer_msisdn ?? t("adminPay.notGiven")}
                />
                <Pair
                  label={t("adminPay.sent")}
                  value={formatWhen(row.created_at, lang)}
                />
                <Pair
                  label={t("adminPay.grants")}
                  value={`${row.entitlement_days} ${t("pay.days")}`}
                />
              </dl>

              {/* Decided rows are a record, not a control surface. */}
              {row.review_status === "pending" ? (
                <>
                  <label
                    htmlFor={`note-${row.id}`}
                    className="mt-3 block font-sans text-[12px] font-medium text-ui-muted"
                  >
                    {t("adminPay.noteLabel")}
                  </label>
                  <input
                    id={`note-${row.id}`}
                    value={note[row.id] ?? ""}
                    onChange={(e) =>
                      setNote((m) => ({ ...m, [row.id]: e.target.value }))
                    }
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-ui-lineStrong bg-paper px-3 font-sans text-[14px] text-ink placeholder:text-ui-faint focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                  />

                  <div className="mt-3 flex flex-wrap gap-2">
                    <PixelButton
                      size="sm"
                      variant="positive"
                      disabled={busyId === row.id}
                      onClick={() => void decide(row, true)}
                    >
                      {busyId === row.id
                        ? t("pro.working")
                        : t("adminPay.approve")}
                    </PixelButton>
                    <PixelButton
                      size="sm"
                      variant="danger"
                      disabled={busyId === row.id}
                      onClick={() => void decide(row, false)}
                    >
                      {t("adminPay.reject")}
                    </PixelButton>
                  </div>
                </>
              ) : (
                <p className="mt-3 flex flex-wrap items-center gap-2">
                  <PixelBadge
                    tone={row.status === "succeeded" ? "qualify" : "alert"}
                    icon={row.status === "succeeded" ? "check" : "warn"}
                  >
                    {row.review_status === "approved"
                      ? t("adminPay.wasApproved")
                      : row.review_status === "rejected"
                        ? t("adminPay.wasRejected")
                        : row.status === "succeeded"
                          ? t("adminPay.settledAuto")
                          : t("pro.stPending")}
                  </PixelBadge>
                  {row.reviewed_at && (
                    <span className="font-sans text-[13px] text-ui-muted">
                      {formatWhen(row.reviewed_at, lang)}
                    </span>
                  )}
                </p>
              )}

              {row.review_note && row.review_status !== "pending" && (
                <p className="mt-2.5 border-t border-ui-line pt-2.5 font-sans text-[13px] leading-relaxed text-ink">
                  {row.review_note}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
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

function formatWhen(iso: string, lang: string): string {
  try {
    return new Date(iso).toLocaleString(lang === "bn" ? "bn-BD" : "en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

export default PaymentsQueue;
