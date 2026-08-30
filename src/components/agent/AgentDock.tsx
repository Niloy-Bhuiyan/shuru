"use client";

/**
 * AgentDock — the agent's permanent home: a pixel robot face parked in the
 * bottom-right corner of every signed-in screen, which opens the chat in a
 * panel over the current page.
 *
 * Why a dock and not a destination: the agent's whole value is answering a
 * question about what you are looking at RIGHT NOW. A full-page route made
 * you leave the listing to ask about the listing, and its only entry point
 * was a promo block competing with the radar feed for the top of the screen.
 *
 * Hidden entirely when no provider key is configured — same rule as before,
 * an entry point that leads to "not available" is worse than no entry point.
 *
 * The full-screen CRT world at /agent still exists and the panel links to it;
 * both render the same <AgentChat/>, so they cannot drift apart.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AgentAvatar } from "@/components/AgentAvatar";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { AgentChat } from "./AgentChat";
import { useAgentEnabled } from "@/hooks/useAgentEnabled";
import { useLang } from "@/lib/i18n";

export function AgentDock() {
  const enabled = useAgentEnabled();
  const pathname = usePathname();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  // Escape closes and returns focus to the launcher, so keyboard users are not
  // stranded inside the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        launcherRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // The one screen the dock stays off is the agent's own full-screen world —
  // a launcher for the thing you are already looking at. Everywhere else,
  // including the Forge, it rides along: "how do I word this bullet" is the
  // question the agent is best at and the Forge is where it gets asked.
  const suppressed = pathname === "/agent";

  if (enabled !== true || suppressed) return null;

  return (
    <>
      {/*
        Launcher. Sits above the mobile bottom nav (bottom-24) and drops to a
        normal corner offset from `lg`, where that nav is gone.
      */}
      {!open && (
        <button
          ref={launcherRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("agent.open")}
          className="fixed bottom-24 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-ink shadow-lg ring-1 ring-black/5 transition-transform hover:scale-105 active:scale-95 lg:bottom-6 lg:right-6"
        >
          <AgentAvatar size={30} />
        </button>
      )}

      {open && (
        <>
          {/* Scrim. Click-outside closes; it is also what stops the page
              behind from being interacted with by mistake on mobile. */}
          <div
            className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            aria-hidden
          />

          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("agent.title")}
            className="fixed inset-x-0 bottom-0 z-50 flex h-[78dvh] flex-col overflow-hidden rounded-t-2xl border border-ui-line bg-paper shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[560px] sm:max-h-[80dvh] sm:w-[400px] sm:rounded-2xl"
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-ui-line bg-paper px-3.5 py-3">
              <span className="flex items-center gap-2.5 text-[15px] font-semibold text-ink">
                <AgentAvatar size={22} />
                {t("agent.title")}
              </span>
              <div className="flex items-center gap-1">
                <Link
                  href="/agent"
                  onClick={() => setOpen(false)}
                  aria-label={t("agent.expand")}
                  title={t("agent.expand")}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-ui-muted transition-colors hover:bg-cream hover:text-ink"
                >
                  <PixelIcon name="spark" size={12} />
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t("agent.close")}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-ui-muted transition-colors hover:bg-cream hover:text-ink"
                >
                  <PixelIcon name="x" size={12} />
                </button>
              </div>
            </div>

            <AgentChat compact />
          </div>
        </>
      )}
    </>
  );
}

export default AgentDock;
