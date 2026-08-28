"use client";

/**
 * Operator workspace shell — employer and admin.
 *
 * Separate from the student shell on purpose. These routes used to live in
 * `(main)`, which meant an admin got the student header, the student bottom
 * nav and the student sidebar with an "ADMIN" chip added to them: one account
 * wearing two products at once, with no way to tell which one you were in.
 *
 * The layout itself is intentionally thin. Each page owns its OperatorShell
 * so it can set its own title, subtitle, actions and nav counts — a console
 * where the heading is always the same word is a console that never tells you
 * where you are.
 *
 * No profile guard here. `(main)` redirects a session without a profile to
 * /onboarding, which is a student flow; an operator has no business being
 * sent there. Authentication and the role gate are middleware's job, every
 * page re-checks the role, and RLS plus the guard triggers are the actual
 * boundary — see src/middleware.ts.
 */

import { AgentDock } from "@/components/agent/AgentDock";

export default function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <AgentDock />
    </>
  );
}
