"use client";

/**
 * OperatorHeader — the app bar for the employer and admin workspaces.
 *
 * Deliberately NOT SunriseHeader. The two surfaces are different products
 * wearing the same design system: the student app is cream and reads as
 * "yours", the operator workspace is ink and reads as "a tool you are
 * signed in to". Sharing one header is what made an admin account feel like
 * a student account with extra buttons bolted on.
 *
 * The way back to the student app is always visible, because an operator is
 * also a person with their own radar.
 */

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/cx";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { useRole } from "@/hooks/useRole";
import { useLang, type StringKey } from "@/lib/i18n";

type Item = { href: string; key: StringKey };

export function OperatorHeader() {
  const pathname = usePathname();
  const { lang, setLang, t } = useLang();
  const { role } = useRole();

  // An admin can work in both queues; an employer only has their own.
  const items: Item[] =
    role === "admin"
      ? [
          { href: "/admin", key: "op.moderation" },
          { href: "/employer", key: "op.employer" },
        ]
      : [{ href: "/employer", key: "op.employer" }];

  return (
    <header className="sticky top-0 z-40 border-b-3 border-ink bg-ink">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-pixel text-[15px] leading-none text-amber">Shuru</span>
          <span className="border-2 border-amber px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber">
            {t("op.workspace")}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/radar"
            className="flex items-center gap-1.5 border-2 border-cream bg-ink px-2 py-1 font-mono text-[10px] font-bold text-cream active:translate-x-[1px] active:translate-y-[1px]"
          >
            <PixelIcon name="radar" size={11} />
            {/* Label drops below `sm` — the wordmark, workspace badge and
                language toggle already fill a 390px bar. */}
            <span className="hidden sm:inline">{t("op.exit")}</span>
          </Link>
          <div
            className="flex border-2 border-cream"
            role="group"
            aria-label="Language"
          >
            {(["en", "bn"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                className={cx(
                  "px-2 py-1 text-[11px] font-bold",
                  "active:translate-x-[1px] active:translate-y-[1px]",
                  l === "bn" ? "font-bangla" : "font-mono",
                  lang === l ? "bg-amber text-ink" : "bg-ink text-cream"
                )}
              >
                {l === "en" ? "EN" : "বাং"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/*
        Workspace tabs. Only rendered when there is a choice to make — an
        employer has exactly one destination, and a single tab is furniture,
        not navigation.
      */}
      {items.length > 1 && (
        <nav aria-label={t("op.workspace")} className="flex gap-2 px-4 pb-2">
          {items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "border-2 px-2.5 py-1 font-mono text-[11px] font-bold",
                  active
                    ? "border-amber bg-amber text-ink"
                    : "border-cream/40 bg-ink text-cream"
                )}
              >
                {t(item.key)}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}

export default OperatorHeader;
