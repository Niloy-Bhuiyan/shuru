"use client";

/**
 * ASK YOUR AGENT — the full-screen agent world.
 *
 * The everyday entry point is now AgentDock, the corner robot on every
 * screen. This page is what the dock expands INTO: the same conversation in
 * the agent's own phosphor CRT world, with room to read a long answer.
 *
 * The chat itself lives in <AgentChat/> so the two surfaces cannot drift.
 * What is left here is the costume: the CRT power-on reveal (skipped under
 * reduced-motion), the world class, and the gated states.
 */

import { useState } from "react";
import Link from "next/link";
import { LoadingBlock } from "@/components/LoadingBlock";
import { AgentAvatar } from "@/components/AgentAvatar";
import { AgentChat } from "@/components/agent/AgentChat";
import { CrtReveal } from "@/components/CrtReveal";
import { useAgentEnabled } from "@/hooks/useAgentEnabled";
import { useLang } from "@/lib/i18n";
import { cx } from "@/lib/cx";

export default function AgentPage() {
  const enabled = useAgentEnabled();
  const { t } = useLang();
  const [revealed, setRevealed] = useState(false);

  if (enabled === null) {
    return (
      <main className="px-4 pt-4">
        <LoadingBlock />
      </main>
    );
  }
  if (enabled === false) {
    return (
      <main className="px-4 pt-6">
        <p className="border-3 border-ink bg-paper p-3 font-mono text-xs text-ink shadow-pixel-sm">
          {t("agent.notConfigured")}{" "}
          <Link href="/radar" className="font-bold underline">
            ← {t("common.back")}
          </Link>
        </p>
      </main>
    );
  }

  return (
    <div className="world-agent relative min-h-dvh pb-8">
      {!revealed && <CrtReveal onDone={() => setRevealed(true)} />}

      <main className={cx("px-4 pt-4", revealed && "agent-enter")}>
        <h1 className="flex items-center gap-2 font-pixel text-xs text-ink">
          <AgentAvatar size={28} materialize={revealed} />
          {t("agent.title")}
        </h1>

        <AgentChat materialize={revealed} />
      </main>
    </div>
  );
}
