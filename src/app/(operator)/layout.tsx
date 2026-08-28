"use client";

/**
 * Operator workspace shell — employer and admin.
 *
 * Separate from the student shell on purpose. These routes used to live in
 * `(main)`, which meant an admin got the student header, the student bottom
 * nav and the student sidebar with an "ADMIN" chip added to them: one account
 * wearing two products at once, with no way to tell which one you were in.
 *
 * No profile guard here. `(main)` redirects a session without a profile to
 * /onboarding, which is a student flow; an operator has no business being
 * sent there. Authentication and the role gate are middleware's job, every
 * page re-checks the role, and RLS plus the guard triggers are the actual
 * boundary — see src/middleware.ts.
 */

import { OperatorHeader } from "@/components/operator/OperatorHeader";
import { AgentDock } from "@/components/agent/AgentDock";

export default function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <OperatorHeader />
      {/*
        No bottom-nav clearance: the operator shell has no bottom nav, so the
        pb-20 the student shell needs would just be a gap here.
      */}
      <div className="min-w-0 pb-8">{children}</div>
      <AgentDock />
    </>
  );
}
