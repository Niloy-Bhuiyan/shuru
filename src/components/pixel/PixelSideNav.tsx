"use client";

/**
 * PixelSideNav — the desktop counterpart to PixelNav.
 *
 * Desktop-only (`hidden lg:flex`): PixelNav stays the mobile bottom bar, and
 * exactly one of the two is visible at any width. Same routes and same active
 * rule, laid out vertically with room for the label — the extra width buys
 * legibility, not more destinations.
 *
 * Student destinations ONLY. Employer and admin used to be appended here for
 * those roles, which put an operator tool inside the student's own
 * navigation. The two workspaces now have separate shells and RoleChip in the
 * header is the single door between them.
 */

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/cx";
import { PixelIcon, IconName } from "./PixelIcon";
import { useLang, StringKey } from "@/lib/i18n";

type Item = { href: string; icon: IconName; key: StringKey };

const ITEMS: Item[] = [
  { href: "/radar", icon: "radar", key: "nav.radar" },
  { href: "/saved", icon: "bookmark", key: "nav.saved" },
  { href: "/forge", icon: "hammer", key: "nav.forge" },
  { href: "/vault", icon: "vault", key: "nav.vault" },
  { href: "/notifications", icon: "signal", key: "nav.alerts" },
  { href: "/you", icon: "user", key: "nav.you" },
];

export function PixelSideNav() {
  const pathname = usePathname();
  const { t } = useLang();

  return (
    <nav
      aria-label="Main"
      className="sticky top-[57px] hidden h-[calc(100dvh-57px)] w-[200px] shrink-0 border-r-3 border-ink bg-paper lg:flex lg:flex-col"
    >
      <ul className="flex flex-col gap-1 p-3">
        {ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex items-center gap-2.5 border-3 px-2.5 py-2 font-mono text-[11px] font-bold uppercase tracking-wide",
                  active
                    ? "border-ink bg-ink text-amber shadow-pixel-sm"
                    : "border-transparent text-ink hover:border-ink hover:bg-cream"
                )}
              >
                <PixelIcon name={item.icon} size={14} />
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default PixelSideNav;
