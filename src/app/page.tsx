"use client";

/** Entry: route to Radar if a profile exists, otherwise to Login.
 *  (The full design-system gallery lives at /gallery.) */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getProfile } from "@/lib/data";
import { LoadingBlock } from "@/components/LoadingBlock";

export default function Entry() {
  const router = useRouter();

  useEffect(() => {
    getProfile().then((p) => {
      router.replace(p ? "/radar" : "/login");
    });
  }, [router]);

  return (
    <main className="px-4 pt-10">
      <LoadingBlock />
    </main>
  );
}
