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
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { cx } from "@/lib/cx";
import { formatMoney } from "@/lib/subscription";
import { useLang } from "@/lib/i18n";
import {
  DecisionRejected,
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
      setError((e as Error).message);
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
      setError(
        e instanceof DecisionRejected ? e.message : (e as Error).message
      );
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
    <section className="mb-6 mt-4">
      <div className="border-3 border-ink bg-paper p-3 shadow-pixel-sm">
        <p className="font-pixel text-[11px] text-ink">
          {t("adminPay.title")}
        </p>
        <p className="mt-1 font-mono text-[10px] leading-relaxed text-ui-muted">
          {t("adminPay.hint")}
        </p>
      </div>

      <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            aria-pressed={view === v.id}
            className={cx(
              "shrink-0 border-2 border-ink px-2 py-1 font-mono text-[10px] font-bold",
              view === v.id ? "bg-ink text-cream" : "bg-paper text-ink"
            )}
          >
            {v.label}
            {v.count > 0 && ` (${v.count})`}
          </button>
        ))}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 border-3 border-ink bg-alert p-2 font-mono text-[11px] leading-relaxed text-cream"
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
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="border-3 border-ink bg-cream p-3 shadow-pixel-sm"
            >
              {/* The match line: everything needed to find this in a merchant
                  statement, and nothing else. */}
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <code className="font-code text-[15px] font-bold tracking-wider text-ink tabular">
                  {row.payer_reference ?? "—"}
                </code>
                <span className="font-mono text-[13px] font-bold text-ink tabular">
                  {formatMoney({
                    amountMinor: row.amount_minor,
                    currency: row.currency,
                  })}
                </span>
              </div>

              <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[11px] text-ui-muted">
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
                    className="mt-2.5 block font-mono text-[10px] font-bold tracking-[0.12em] text-ui-muted"
                  >
                    {t("adminPay.noteLabel")}
                  </label>
                  <input
                    id={`note-${row.id}`}
                    value={note[row.id] ?? ""}
                    onChange={(e) =>
                      setNote((m) => ({ ...m, [row.id]: e.target.value }))
                    }
                    className="mt-1 w-full border-2 border-ink bg-paper px-2 py-1.5 font-mono text-[11px] text-ink focus:outline-none"
                  />

                  <div className="mt-2 flex gap-1.5">
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void decide(row, true)}
                      className="min-h-[36px] flex-1 border-2 border-ink bg-mint px-2 py-1 font-mono text-[10px] font-bold text-ink disabled:opacity-50"
                    >
                      {busyId === row.id
                        ? t("pro.working")
                        : t("adminPay.approve")}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void decide(row, false)}
                      className="min-h-[36px] flex-1 border-2 border-ink bg-alert px-2 py-1 font-mono text-[10px] font-bold text-cream disabled:opacity-50"
                    >
                      {t("adminPay.reject")}
                    </button>
                  </div>
                </>
              ) : (
                <p
                  className={cx(
                    "mt-2 flex items-center gap-1.5 font-mono text-[11px] font-bold",
                    row.status === "succeeded" ? "text-mint" : "text-alert"
                  )}
                >
                  <PixelIcon
                    name={row.status === "succeeded" ? "check" : "warn"}
                    size={12}
                  />
                  {row.review_status === "approved"
                    ? t("adminPay.wasApproved")
                    : row.review_status === "rejected"
                      ? t("adminPay.wasRejected")
                      : row.status === "succeeded"
                        ? t("adminPay.settledAuto")
                        : t("pro.stPending")}
                  {row.reviewed_at && (
                    <span className="font-normal text-ui-muted">
                      · {formatWhen(row.reviewed_at, lang)}
                    </span>
                  )}
                </p>
              )}

              {row.review_note && row.review_status !== "pending" && (
                <p className="mt-1.5 border-t-2 border-ink/15 pt-1.5 font-mono text-[11px] leading-relaxed text-ink">
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
