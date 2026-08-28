"use client";

/**
 * OperatorSideNav — the console's own navigation.
 *
 * The operator area previously reused the student chrome with a darker
 * header and a row of tabs, which is why it read as "a student page with an
 * admin mode" rather than as a tool. A moderation console is a different
 * kind of software from a job feed: it is dense, it is used repeatedly by
 * the same person, and its primary axis is a list of queues.
 *
 * So: a persistent dark rail with the queues on it, counts where a count
 * means "there is work here", and a permanent way back to the student app —
 * an operator is also a person with their own radar.
 *
 * Visible at every width. The student app hides its sidebar below `lg` and
 * swaps in a bottom bar; this one collapses to icons instead, because an
 * operator screen without its queue list is not usable at all.
 */

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/cx";
import { PixelIcon, type IconName } from "@/components/pixel/PixelIcon";
import { useLang, type StringKey } from "@/lib/i18n";

export type OperatorNavItem = {
  href: string;
  icon: IconName;
  key: StringKey;
  /** Rendered only when > 0: a zero badge is noise, not information. */
  count?: number;
};

export function OperatorSideNav({
  items,
  role,
}: {
  items: OperatorNavItem[];
  role: "admin" | "employer" | null;
}) {
  const pathname = usePathname();
  const { t } = useLang();

  return (
    <nav
      aria-label={t("op.workspace")}
      className="sticky top-0 flex h-dvh w-[64px] shrink-0 flex-col border-r-3 border-ink bg-ink sm:w-[210px]"
    >
      <div className="border-b-3 border-cream/15 px-3 py-3 sm:px-4">
        <span className="font-pixel text-sm leading-none text-amber">SHURU</span>
        <p className="mt-1.5 hidden font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-cream/50 sm:block">
          {role === "admin" ? t("admin.title") : t("emp.title")} · {t("op.workspace")}
        </p>
      </div>

      <ul className="flex flex-1 flex-col gap-1 overflow-y-auto p-2 sm:p-3">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={t(item.key)}
                className={cx(
                  "flex items-center gap-2.5 border-2 px-2 py-2 font-mono text-[11px] font-bold uppercase tracking-wide sm:px-2.5",
                  active
                    ? "border-amber bg-amber text-ink"
                    : "border-transparent text-cream/75 hover:border-cream/30 hover:text-cream"
                )}
              >
                <PixelIcon name={item.icon} size={14} />
                <span className="hidden min-w-0 flex-1 truncate sm:inline">
                  {t(item.key)}
                </span>
                {item.count !== undefined && item.count > 0 && (
                  <span
                    className={cx(
                      "ml-auto hidden shrink-0 border-2 px-1.5 font-pixel text-[9px] sm:inline-block",
                      active
                        ? "border-ink bg-ink text-amber"
                        : "border-amber/60 bg-transparent text-amber"
                    )}
                  >
                    {item.count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="border-t-3 border-cream/15 p-2 sm:p-3">
        <Link
          href="/radar"
          title={t("op.exit")}
          className="flex items-center gap-2 border-2 border-cream/40 px-2 py-2 font-mono text-[10px] font-bold uppercase tracking-wide text-cream hover:border-cream sm:px-2.5"
        >
          <PixelIcon name="radar" size={13} />
          <span className="hidden sm:inline">{t("op.exit")}</span>
        </Link>
      </div>
    </nav>
  );
}

export default OperatorSideNav;
