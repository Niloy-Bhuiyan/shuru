"use client";

/**
 * Operator entry point in the app bar — renders ONLY for employer/admin.
 *
 * Kept out of /you on purpose: that screen is the student's own profile, and
 * an "ADMIN" button sitting in a user surface reads like the tool is part of
 * the normal product. Here it belongs to the app chrome instead, and a
 * student never sees it at any width.
 *
 * Discoverability only. The link being hidden protects nothing on its own —
 * middleware role-gates both routes, and RLS plus the guard triggers are the
 * actual boundary.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/cx";
import { useRole } from "@/hooks/useRole";
import { useLang } from "@/lib/i18n";

export function RoleChip() {
  const { role, loading } = useRole();
  const pathname = usePathname();
  const { t } = useLang();

  if (loading || (role !== "admin" && role !== "employer")) return null;

  const href = role === "admin" ? "/admin" : "/employer";
  const label = role === "admin" ? t("admin.title") : t("emp.title");
  const active = pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={cx(
        "border-2 border-ink px-1.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wide shadow-pixel-sm",
        "active:translate-x-[1px] active:translate-y-[1px]",
        active ? "bg-ink text-amber" : "bg-amber text-ink"
      )}
    >
      {label}
    </Link>
  );
}

export default RoleChip;
