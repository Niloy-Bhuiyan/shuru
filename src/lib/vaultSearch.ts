/**
 * Vault free-text search — pure matcher over company + role + question text
 * (question_types plus each round's name/format/notes). No I/O; unit-tested.
 */

import type { InterviewReport } from "@/lib/types";

export function matchesReportQuery(r: InterviewReport, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    r.company,
    r.role,
    ...r.question_types,
    ...r.rounds.flatMap((rd) => [rd.name, rd.format ?? "", rd.notes ?? ""]),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}
