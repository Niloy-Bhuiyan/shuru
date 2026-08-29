"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/cx";
import { PixelIcon, IconName } from "./PixelIcon";
import { useLang, StringKey } from "@/lib/i18n";
import { armForgeTransition } from "@/components/ForgeTransition";

const ITEMS: { href: string; icon: IconName; key: StringKey }[] = [
  { href: "/radar", icon: "radar", key: "nav.radar" },
  { href: "/saved", icon: "bookmark", key: "nav.saved" },
  { href: "/forge", icon: "hammer", key: "nav.forge" },
  { href: "/vault", icon: "vault", key: "nav.vault" },
  { href: "/you", icon: "user", key: "nav.you" },
];

/**
 * PixelNav — fixed bottom navigation. Active tab = solid amber block above
 * the icon + inverted colors. Sits inside the 430px app frame.
 *
 * Mobile only: hidden from `lg`, where PixelSideNav takes over. Exactly one
 * of the two is visible at any width.
 */
export function PixelNav() {
  const pathname = usePathname();
  const { t } = useLang();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-app border-t-3 border-ink bg-ink lg:hidden"
    >
      <div className="grid grid-cols-5">
        {ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              // Arm the Forge arrival animation; a plain navigation still
              // happens, so middle-click and new-tab keep working.
              onClick={item.href === "/forge" ? armForgeTransition : undefined}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex flex-col items-center gap-1 py-2 pt-1.5 font-mono text-[10px] font-bold",
                active ? "text-amber" : "text-cream/60"
              )}
            >
              <span
                aria-hidden
                className={cx("h-[3px] w-8", active ? "bg-amber" : "bg-transparent")}
              />
              <PixelIcon name={item.icon} size={16} />
              {t(item.key)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default PixelNav;
