"use client";

/**
 * WARM INTRO — opt-in mentors from the user's own university who interned
 * at this company: CV review or a warm intro. Requests are tracked locally
 * (MVP) so the buttons don't double-fire.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PixelCard } from "@/components/pixel/PixelCard";
import { PixelBadge } from "@/components/pixel/PixelBadge";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { LoadingBlock } from "@/components/LoadingBlock";
import { EmptyState } from "@/components/EmptyState";
import { useProfile } from "@/hooks/useProfile";
import { getOpportunity, listMentors } from "@/lib/data";
import { useLang } from "@/lib/i18n";
import type { Mentor, Opportunity } from "@/lib/types";

const LS_REQUESTS = "shuru.mentorRequests";

function getRequests(): Record<string, true> {
  try {
    return JSON.parse(window.localStorage.getItem(LS_REQUESTS) ?? "{}");
  } catch {
    return {};
  }
}

export default function MentorsPage() {
  const { opportunityId } = useParams<{ opportunityId: string }>();
  const router = useRouter();
  const { profile } = useProfile();
  const { t } = useLang();

  const [op, setOp] = useState<Opportunity | null | undefined>(undefined);
  const [mentors, setMentors] = useState<Mentor[] | null>(null);
  const [requests, setRequests] = useState<Record<string, true>>({});

  useEffect(() => {
    setRequests(getRequests());
  }, []);

  useEffect(() => {
    if (!profile || !opportunityId) return;
    (async () => {
      const found = await getOpportunity(opportunityId);
      setOp(found ?? null);
      if (found) {
        setMentors(
          await listMentors({
            university: profile.university,
            company: found.company,
          })
        );
      }
    })();
  }, [profile, opportunityId]);

  function request(mentorId: string, offer: "cv_review" | "intro") {
    const key = `${mentorId}:${offer}`;
    const next = { ...getRequests(), [key]: true as const };
    window.localStorage.setItem(LS_REQUESTS, JSON.stringify(next));
    setRequests(next);
  }

  if (op === undefined || !profile || (op && mentors === null)) {
    return (
      <main className="px-4 pt-4">
        <LoadingBlock />
      </main>
    );
  }
  if (op === null) {
    return (
      <main className="px-4 pt-4">
        <EmptyState icon="x" title={t("detail.notFound")} />
      </main>
    );
  }

  return (
    <main className="px-4 pt-4">
      <button
        type="button"
        onClick={() => router.back()}
        className="mb-3 flex items-center gap-1 font-mono text-xs font-bold uppercase text-ink"
      >
        <span className="inline-block rotate-180">
          <PixelIcon name="arrow-right" size={11} />
        </span>
        {t("common.back")}
      </button>

      <h1 className="font-pixel text-xs text-ink">{t("mentors.title")}</h1>
      <p className="mt-1 font-mono text-xs text-ink/70">
        {op.company} · {profile.university}
      </p>
      <p className="mt-1 font-mono text-[11px] text-grey">{t("mentors.subtitle")}</p>

      <div className="mt-4 space-y-3 pb-4">
        {mentors!.length === 0 ? (
          <EmptyState icon="user" title={t("mentors.empty")} />
        ) : (
          mentors!.map((m) => (
            <PixelCard key={m.id} accent="mint">
              <div className="flex items-start justify-between gap-2">
                <p className="font-mono text-sm font-bold text-ink">{m.name_display}</p>
                <div className="flex gap-1">
                  {m.offers.includes("cv_review") && (
                    <PixelBadge tone="qualify">{t("mentors.cv")}</PixelBadge>
                  )}
                  {m.offers.includes("intro") && (
                    <PixelBadge tone="urgent">{t("mentors.intro")}</PixelBadge>
                  )}
                </div>
              </div>
              <p className="mt-0.5 font-mono text-xs text-ink/70">
                {m.company} · {m.university}
              </p>

              <div className="mt-3 flex flex-col gap-2">
                {m.offers.includes("cv_review") && (
                  <PixelButton
                    variant="secondary"
                    size="sm"
                    onClick={() => request(m.id, "cv_review")}
                    disabled={!!requests[`${m.id}:cv_review`]}
                  >
                    {requests[`${m.id}:cv_review`]
                      ? t("mentors.requested")
                      : t("mentors.requestCv")}
                  </PixelButton>
                )}
                {m.offers.includes("intro") && (
                  <PixelButton
                    size="sm"
                    onClick={() => request(m.id, "intro")}
                    disabled={!!requests[`${m.id}:intro`]}
                  >
                    {requests[`${m.id}:intro`]
                      ? t("mentors.requested")
                      : t("mentors.requestIntro")}
                  </PixelButton>
                )}
              </div>
            </PixelCard>
          ))
        )}
      </div>
    </main>
  );
}
