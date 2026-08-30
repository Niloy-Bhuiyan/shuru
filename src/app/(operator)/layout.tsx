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
  /*
   * `data-operator` is read by globals.css, which widens the app frame for
   * this subtree.
   *
   * The root layout wraps everything in a 480px mobile frame that only opens
   * up at `lg`. That is right for the student app and wrong here: between
   * roughly 640px and 1024px the console was being clamped into 480px WITH a
   * 212px sidebar inside it, leaving about 220px of working area. Queue rows
   * were unreadable and every stat tile label truncated to two letters. A
   * moderation console is a desktop tool and does not belong in a phone frame.
   *
   * Done in CSS rather than by branching in the root layout, which is a server
   * component and would have to become a client one to read the pathname.
   */
  return (
    <div data-operator>
      {children}
      <AgentDock />
    </div>
  );
}
