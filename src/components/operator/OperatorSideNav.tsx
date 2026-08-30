"use client";

/**
 * OperatorSideNav -- the console's own navigation.
 *
 * The operator area previously reused the student chrome with a darker
 * header and a row of tabs, which is why it read as "a student page with an
 * admin mode" rather than as a tool. A moderation console is a different
 * kind of software from a job feed: it is dense, it is used repeatedly by
 * the same person, and its primary axis is a list of queues.
 *
 * So: a persistent dark rail with the queues on it, counts where a count
 * means "there is work here", and a permanent way back to the student app --
 * an operator is also a person with their own radar.
 *
 * Visible at every width. The student app hides its sidebar below `lg` and
 * swaps in a bottom bar; this one collapses to icons instead, because an
 * operator screen without its queue list is not usable at all. At the
 * collapsed width the count becomes a dot on the icon: the number will not
 * fit, but "there is something here" still has to survive.
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
      className="sticky top-0 flex h-dvh w-[64px] shrink-0 flex-col bg-ink sm:w-[212px]"
    >
      <div className="border-b border-white/10 px-3 py-4 sm:px-4">
        <span className="font-sans text-[17px] font-semibold leading-none tracking-[-0.01em] text-white">
          Shuru
        </span>
        <p className="mt-1.5 hidden font-sans text-[12px] text-white/55 sm:block">
          {role === "admin" ? t("admin.title") : t("emp.title")} · {t("op.workspace")}
        </p>
      </div>

      <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2 sm:p-3">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const hasWork = item.count !== undefined && item.count > 0;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={t(item.key)}
                className={cx(
                  "relative flex min-h-[40px] items-center gap-2.5 rounded-lg px-2.5 font-sans text-[14px]",
                  "transition-colors duration-150",
                  active
                    ? "bg-white/12 font-medium text-white"
                    : "text-white/65 hover:bg-white/[0.07] hover:text-white"
                )}
              >
                {/* The active marker is a rule, not a fill. A saturated amber
                    block behind the current item made the rail's loudest
                    element the one thing the operator already knows. */}
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-amber"
                  />
                )}
                <span className="relative flex shrink-0 items-center">
                  <PixelIcon name={item.icon} size={15} />
                  {/* Collapsed rail: the numeral has nowhere to go, so the
                      fact that there IS work becomes a dot on the icon. */}
                  {hasWork && (
                    <span
                      aria-hidden="true"
                      className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-amber sm:hidden"
                    />
                  )}
                </span>
                <span className="hidden min-w-0 flex-1 truncate sm:inline">
                  {t(item.key)}
                </span>
                {hasWork && (
                  <span className="ml-auto hidden shrink-0 rounded-md bg-amber px-1.5 py-0.5 font-sans text-[12px] font-semibold leading-none text-white tabular sm:inline-block">
                    {item.count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-white/10 p-2 sm:p-3">
        <Link
          href="/radar"
          title={t("op.exit")}
          className="flex min-h-[40px] items-center gap-2.5 rounded-lg px-2.5 font-sans text-[13px] text-white/65 transition-colors hover:bg-white/[0.07] hover:text-white"
        >
          <PixelIcon name="radar" size={14} />
          <span className="hidden sm:inline">{t("op.exit")}</span>
        </Link>
      </div>
    </nav>
  );
}

export default OperatorSideNav;
