"use client";

/**
 * PixelSideNav — the desktop counterpart to PixelNav.
 *
 * Desktop-only (`hidden lg:flex`): PixelNav stays the mobile bottom bar, and
 * exactly one of the two is visible at any width. Same routes and same active
 * rule, laid out vertically with room for the label — the extra width buys
 * legibility, not more destinations.
 *
 * Student destinations ONLY, and there is no door to the operator console
 * anywhere in this app. Employer and admin were once appended here for those
 * roles, then moved to a chip in the header — which was the same mistake in a
 * smaller box. Operators arrive at their console by signing in.
 *
 * ── Pro had no entry point ────────────────────────────────────────────────
 *
 * /pro was reachable only from the plan card on /you and from whichever
 * ProLock you happened to collide with. So the one screen that explains what
 * the product costs could only be found by walking into a locked door first,
 * which is why it read as hidden: it was.
 *
 * It sits at the FOOT of the rail, separated by a rule, in the slot every
 * subscription product puts it in. Not in the main list — it is not a place
 * you go to do your work, and putting it there would push a real destination
 * out of a list that is already six long. It disappears once you are Pro,
 * because a permanent "upgrade" button for someone who already paid is an
 * advertisement, not navigation.
 */

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/cx";
import { PixelIcon, IconName } from "./PixelIcon";
import { useLang, StringKey } from "@/lib/i18n";
import { usePro } from "@/hooks/usePro";
import { armForgeTransition } from "@/components/ForgeTransition";

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
  const { isPro, loading } = usePro();

  const linkClass = (active: boolean) =>
    cx(
      "flex min-h-[40px] items-center gap-2.5 rounded-lg px-3 font-sans text-[14px] transition-colors",
      active
        ? "bg-cream font-medium text-ink"
        : "text-ui-muted hover:bg-cream hover:text-ink"
    );

  return (
    <nav
      aria-label="Main"
      className="sticky top-[57px] hidden h-[calc(100dvh-57px)] w-[212px] shrink-0 flex-col border-r border-ui-line bg-paper lg:flex"
    >
      <ul className="flex flex-1 flex-col gap-0.5 p-3">
        {ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={item.href === "/forge" ? armForgeTransition : undefined}
                aria-current={active ? "page" : undefined}
                className={linkClass(active)}
              >
                <PixelIcon name={item.icon} size={15} />
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Rendered only once the entitlement is known. Flashing an upgrade
          prompt at a subscriber for the length of one fetch is worse than
          showing it a beat late. */}
      {!loading && !isPro && (
        <div className="border-t border-ui-line p-3">
          <Link
            href="/pro"
            aria-current={pathname === "/pro" ? "page" : undefined}
            className={cx(
              "flex min-h-[40px] items-center gap-2.5 rounded-lg px-3 font-sans text-[14px] font-medium transition-colors",
              pathname === "/pro"
                ? "bg-amber/10 text-amberInk"
                : "text-amberInk hover:bg-amber/10"
            )}
          >
            <PixelIcon name="spark" size={15} />
            {t("pro.upgradeCta")}
          </Link>
        </div>
      )}
    </nav>
  );
}

export default PixelSideNav;
