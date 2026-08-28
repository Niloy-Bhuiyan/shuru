"use client";

/**
 * "Hiring interns?" — the student-side half of employer access.
 *
 * Lives on /you, and it is the ONE operator-adjacent thing that belongs in
 * the student app: an operator tool does not belong in a user surface, but a
 * request about your own account does, and that is exactly what /you is for.
 *
 * Renders nothing for someone who already holds a role — an employer or admin
 * has no reason to ask for what they have.
 *
 * The states are deliberately distinct. A pending request says pending; a
 * rejected one says so and lets you ask again with the reviewer's note
 * visible. Neither pretends to be progress.
 */

import { useEffect, useState } from "react";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelInput } from "@/components/pixel/PixelInput";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import {
  getMyEmployerRequest,
  requestEmployerAccess,
  type EmployerAccessRequest,
} from "@/lib/data/employerAccess";
import { useRole } from "@/hooks/useRole";
import { useLang } from "@/lib/i18n";

export function EmployerAccessCard() {
  const { t } = useLang();
  const { role, loading: roleLoading } = useRole();

  const [request, setRequest] = useState<EmployerAccessRequest | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState("");
  const [website, setWebsite] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyEmployerRequest()
      .then((r) => {
        if (!cancelled) setRequest(r);
      })
      // A failed lookup must not hide the profile page behind an error; the
      // card simply does not render.
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (roleLoading || !loaded) return null;
  if (role !== "student") return null;

  async function submit() {
    if (!company.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await requestEmployerAccess({
        company_name: company,
        company_website: website,
        contact_role: contactRole,
      });
      setRequest(created);
      setOpen(false);
    } catch {
      setError(t("emp.reqError"));
    } finally {
      setBusy(false);
    }
  }

  const heading = (
    <p className="flex items-center gap-2 font-pixel text-[10px] uppercase text-ink">
      <PixelIcon name="hammer" size={12} className="text-amberInk" />
      {t("emp.reqTitle")}
    </p>
  );

  if (request?.status === "pending") {
    return (
      <section className="border-3 border-ink bg-paper p-3 shadow-pixel-sm">
        {heading}
        <p className="mt-2 w-fit border-2 border-ink bg-amber px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-ink">
          {t("emp.reqPending")}
        </p>
        <p className="mt-2 font-mono text-[11px] leading-relaxed text-ink/80">
          {t("emp.reqPendingBody")} <span className="font-bold">{request.company_name}</span>
        </p>
      </section>
    );
  }

  if (request?.status === "rejected") {
    return (
      <section className="border-3 border-ink bg-paper p-3 shadow-pixel-sm">
        {heading}
        <p className="mt-2 w-fit border-2 border-ink bg-alert px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-cream">
          {t("emp.reqRejected")}
        </p>
        {request.review_notes && (
          <p className="mt-2 border-l-3 border-ink/30 pl-2 font-mono text-[11px] leading-relaxed text-ink/80">
            {request.review_notes}
          </p>
        )}
        <PixelButton size="sm" variant="secondary" className="mt-3" onClick={() => setOpen(true)}>
          {t("emp.reqAgain")}
        </PixelButton>
        {open && (
          <RequestForm
            {...{ company, setCompany, website, setWebsite, contactRole, setContactRole, busy, error, submit, onCancel: () => setOpen(false) }}
          />
        )}
      </section>
    );
  }

  return (
    <section className="border-3 border-ink bg-paper p-3 shadow-pixel-sm">
      {heading}
      <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-ink/80">
        {t("emp.reqBody")}
      </p>
      {!open ? (
        <PixelButton size="sm" className="mt-3" onClick={() => setOpen(true)}>
          {t("emp.reqCta")}
        </PixelButton>
      ) : (
        <RequestForm
          {...{ company, setCompany, website, setWebsite, contactRole, setContactRole, busy, error, submit, onCancel: () => setOpen(false) }}
        />
      )}
    </section>
  );
}

function RequestForm({
  company,
  setCompany,
  website,
  setWebsite,
  contactRole,
  setContactRole,
  busy,
  error,
  submit,
  onCancel,
}: {
  company: string;
  setCompany: (v: string) => void;
  website: string;
  setWebsite: (v: string) => void;
  contactRole: string;
  setContactRole: (v: string) => void;
  busy: boolean;
  error: string | null;
  submit: () => void;
  onCancel: () => void;
}) {
  const { t } = useLang();
  return (
    <div className="mt-3 space-y-3 border-t-2 border-ink/20 pt-3">
      <PixelInput
        label={t("emp.reqCompany")}
        name="req_company"
        value={company}
        onChange={setCompany}
        required
      />
      <PixelInput
        label={t("emp.reqWebsite")}
        name="req_website"
        value={website}
        onChange={setWebsite}
        hint={t("emp.reqWebsiteHint")}
      />
      <PixelInput
        label={t("emp.reqRole")}
        name="req_role"
        value={contactRole}
        onChange={setContactRole}
      />
      {error && <p className="font-mono text-[11px] font-bold text-alert">! {error}</p>}
      <p className="font-mono text-[10px] leading-relaxed text-grey">
        {t("emp.reqReviewNote")}
      </p>
      <div className="flex gap-2">
        <PixelButton size="sm" onClick={submit} disabled={busy || !company.trim()}>
          {busy ? "…" : t("emp.reqSubmit")}
        </PixelButton>
        <PixelButton size="sm" variant="secondary" onClick={onCancel}>
          {t("agent.cancel")}
        </PixelButton>
      </div>
    </div>
  );
}

export default EmployerAccessCard;
